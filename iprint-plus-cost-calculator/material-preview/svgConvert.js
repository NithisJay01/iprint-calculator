/**
 * svgConvert.js — an uploaded SVG → drawing items in page millimetres, for the PDF and SVG exporters.
 *
 * The browser does the hard part: an off-screen copy of the SVG is asked for each element's computed paint, stroke
 * and transform (getComputedStyle / getCTM), so CSS classes, inheritance, nested transforms and units all come out
 * right. Geometry is read exactly (path data → Béziers, never sampled). The copy lives in a shadow root so a <style>
 * inside a customer's file cannot touch the page.
 *
 * Supported: path, rect, circle, ellipse, line, polyline, polygon, embedded raster <image>; solid fill / stroke, opacity,
 * dashes, fill rules. Not supported (the caller then draws the whole layer as a high-resolution picture instead):
 * text, <use>, gradients, patterns, clip-paths, masks, filters, blend modes, sliced images.
 */
import { parsePathData, rectSegments, ellipseSegments, lineSegments, polySegments, transformSegments, multiply, scaleOf } from './svgPath.js';

const LEAVES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'image']);
const NON_RENDERED = 'defs, symbol, clipPath, mask, pattern, marker';
const LABEL = { text: 'ข้อความ (Text ที่ยังไม่เป็น Outline)', tspan: 'ข้อความ (Text ที่ยังไม่เป็น Outline)', textpath: 'ข้อความ (Text ที่ยังไม่เป็น Outline)', use: 'องค์ประกอบ <use>', foreignobject: 'foreignObject' };
const CAP = { butt: 0, round: 1, square: 2 };
const JOIN = { miter: 0, 'miter-clip': 0, arcs: 0, round: 1, bevel: 2 };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function parsePaint(value) {
  if (!value || value === 'none') return null;
  if (value.startsWith('url(')) return 'unsupported';
  const m = /^rgba?\(([^)]+)\)$/.exec(value.trim());
  if (!m) return 'unsupported';
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { rgb: [r / 255, g / 255, b / 255], alpha: Number.isFinite(a) ? a : 1 };
}

function dataUrlBytes(href) {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([\s\S]+)$/i.exec(href.trim());
  if (!m) return null;
  const bin = atob(m[2].replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1].toLowerCase().replace('jpg', 'jpeg'), bytes };
}

/**
 * @param parsed  parseSvg() result: { svg (with data-mp-hide marks on guides), size: {x, y, w, h} }
 * @param place   { x0, y0, w, h } — where the SVG's viewBox lands on the page (mm), contained and never stretched
 * @param opts    mode: 'print' keeps colours, 'shape' paints everything in one spot colour (spotKey);
 *                nextId(): a new image id
 * @returns {Promise<{ok: boolean, items: object[], images: object[], reasons: string[]}>}
 */
export async function convertSvg(parsed, place, { mode = 'print', spotKey = null, nextId = () => `im${Math.random().toString(36).slice(2)}` } = {}) {
  const { svg, size } = parsed;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none';
  const shadow = host.attachShadow({ mode: 'open' });
  const live = document.importNode(svg, true);
  live.removeAttribute('viewBox'); // user units stay the file's own: getCTM then carries only the transforms inside the file
  live.setAttribute('width', String(size.w));
  live.setAttribute('height', String(size.h));
  shadow.append(live);
  document.body.append(host);

  const scale = Math.min(place.w / size.w, place.h / size.h);
  const T = [scale, 0, 0, scale, place.x0 + (place.w - size.w * scale) / 2 - size.x * scale, place.y0 + (place.h - size.h * scale) / 2 - size.y * scale];
  const reasons = new Set();
  const items = [];
  const images = [];

  const cache = new Map();
  const chain = (el) => {
    if (!el) return { opacity: 1, flags: [], hidden: false };
    if (cache.has(el)) return cache.get(el);
    const parent = chain(el.parentElement);
    const cs = getComputedStyle(el);
    const op = parseFloat(cs.opacity);
    const flags = [...parent.flags];
    if (cs.clipPath && cs.clipPath !== 'none') flags.push('clip-path');
    if (cs.mask && cs.mask !== 'none') flags.push('mask');
    if (cs.filter && cs.filter !== 'none') flags.push('filter');
    if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') flags.push('blend mode');
    const out = { opacity: parent.opacity * (Number.isFinite(op) ? op : 1), flags, hidden: parent.hidden || cs.display === 'none' };
    cache.set(el, out);
    return out;
  };

  try {
    for (const el of live.querySelectorAll('*')) {
      const tag = el.localName.toLowerCase();
      if (el.closest(NON_RENDERED) || el.closest('[data-mp-hide]')) continue;
      if (LABEL[tag]) {
        if (!chain(el).hidden) reasons.add(LABEL[tag]);
        continue;
      }
      if (!LEAVES.has(tag)) continue;
      const inherited = chain(el);
      if (inherited.hidden) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      for (const flag of inherited.flags) reasons.add(flag);

      const ctm = el.getCTM();
      if (!ctm) continue;
      const F = multiply(T, [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f]);
      const k = scaleOf(F);

      if (tag === 'image') {
        if (mode === 'shape') {
          reasons.add('รูปภาพในไฟล์รูปทรง');
          continue;
        }
        const href = el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '';
        const data = dataUrlBytes(href);
        if (!data) {
          reasons.add('รูปที่ไม่ได้ฝังในไฟล์');
          continue;
        }
        const par = el.preserveAspectRatio.baseVal;
        if (par.meetOrSlice === 2 && par.align !== 1) {
          reasons.add('รูปที่ถูกตัดขอบ (slice)');
          continue;
        }
        let nat;
        try {
          nat = await createImageBitmap(new Blob([data.bytes], { type: data.mime }));
        } catch {
          reasons.add('รูปที่อ่านไม่ได้');
          continue;
        }
        const nw = nat.width;
        const nh = nat.height;
        nat.close?.();
        const x = el.x.baseVal.value;
        const y = el.y.baseVal.value;
        const w = el.width.baseVal.value || nw;
        const h = el.height.baseVal.value || nh;
        let fw = w;
        let fh = h;
        let fx = x;
        let fy = y;
        if (par.align !== 1) {
          const s = Math.min(w / nw, h / nh);
          fw = nw * s;
          fh = nh * s;
          const a = par.align; // 2..10: xMin/xMid/xMax × yMin/yMid/yMax
          const xi = [0, 0, 0, 1, 2, 0, 1, 2, 0, 1, 2][a] ?? 1;
          const yi = [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2][a] ?? 1;
          fx = x + ((w - fw) * xi) / 2;
          fy = y + ((h - fh) * yi) / 2;
        }
        const id = nextId();
        images.push({ id, mime: data.mime, bytes: data.bytes, width: nw, height: nh });
        items.push({ type: 'image', id, matrix: multiply(F, [fw, 0, 0, -fh, fx, fy + fh]), alpha: clamp01(inherited.opacity) });
        continue;
      }

      let segs;
      try {
        if (tag === 'path') segs = parsePathData(el.getAttribute('d'));
        else if (tag === 'rect') {
          const w = el.width.baseVal.value;
          const h = el.height.baseVal.value;
          if (!(w > 0 && h > 0)) continue;
          segs = rectSegments(el.x.baseVal.value, el.y.baseVal.value, w, h, el.rx.baseVal.value, el.ry.baseVal.value);
        } else if (tag === 'circle') {
          const r = el.r.baseVal.value;
          if (!(r > 0)) continue;
          segs = ellipseSegments(el.cx.baseVal.value, el.cy.baseVal.value, r, r);
        } else if (tag === 'ellipse') {
          const rx = el.rx.baseVal.value;
          const ry = el.ry.baseVal.value;
          if (!(rx > 0 && ry > 0)) continue;
          segs = ellipseSegments(el.cx.baseVal.value, el.cy.baseVal.value, rx, ry);
        } else if (tag === 'line') segs = lineSegments(el.x1.baseVal.value, el.y1.baseVal.value, el.x2.baseVal.value, el.y2.baseVal.value);
        else segs = polySegments([...el.points].map((p) => ({ x: p.x, y: p.y })), tag === 'polygon');
      } catch {
        reasons.add('เส้น path ที่อ่านไม่ได้');
        continue;
      }
      if (!segs?.length) continue;

      const fillPaint = parsePaint(cs.fill);
      const strokePaint = parsePaint(cs.stroke);
      if (fillPaint === 'unsupported' || strokePaint === 'unsupported') {
        reasons.add('Gradient / Pattern');
        continue;
      }
      const strokeWidth = parseFloat(cs.strokeWidth) || 0;
      const hasStroke = Boolean(strokePaint) && strokeWidth > 0;
      if (!fillPaint && !hasStroke) continue;
      if (hasStroke && Math.abs(Math.hypot(F[0], F[1]) - Math.hypot(F[2], F[3])) > 0.01 * k) {
        reasons.add('เส้นขอบที่ถูกยืดไม่เท่ากันสองแกน');
        continue;
      }

      const isShape = mode === 'shape';
      const fillOpacity = parseFloat(cs.fillOpacity);
      const strokeOpacity = parseFloat(cs.strokeOpacity);
      const fill = fillPaint
        ? isShape
          ? { spot: spotKey, tint: 1 }
          : { rgb: fillPaint.rgb, alpha: clamp01(fillPaint.alpha * (Number.isFinite(fillOpacity) ? fillOpacity : 1) * inherited.opacity) }
        : null;
      let stroke = null;
      if (hasStroke) {
        let dash = [];
        if (cs.strokeDasharray && cs.strokeDasharray !== 'none') {
          dash = cs.strokeDasharray.split(/[\s,]+/).map(parseFloat).filter((v) => Number.isFinite(v) && v >= 0);
          if (dash.length % 2) dash = dash.concat(dash);
          if (!dash.some((v) => v > 0)) dash = [];
        }
        stroke = {
          ...(isShape
            ? { spot: spotKey, tint: 1 }
            : { rgb: strokePaint.rgb, alpha: clamp01(strokePaint.alpha * (Number.isFinite(strokeOpacity) ? strokeOpacity : 1) * inherited.opacity) }),
          width: strokeWidth * k,
          cap: CAP[cs.strokeLinecap] ?? 0,
          join: JOIN[cs.strokeLinejoin] ?? 0,
          miter: parseFloat(cs.strokeMiterlimit) || 10,
          dash: dash.map((v) => v * k),
          dashOffset: (parseFloat(cs.strokeDashoffset) || 0) * k,
        };
      }
      items.push({ type: 'path', segs: transformSegments(segs, F), fill, stroke, rule: cs.fillRule === 'evenodd' ? 'evenodd' : 'nonzero', overprint: isShape });
    }
  } finally {
    host.remove();
  }
  if (!items.length && !reasons.size) reasons.add('ไม่พบรูปทรงที่วาดได้');
  return { ok: reasons.size === 0, items, images, reasons: [...reasons] };
}
