/**
 * shapeFile.js — a die-cut file (SVG or PNG) → the card outline.
 *
 * SVG   the outline is read straight from the path geometry (exact curves), sampled through the browser's own
 *       getPointAtLength / getCTM so transforms and every path command are handled. Elements inside a layer or group
 *       named dieline / cutline / contour / outline / shape are preferred; without one, every shape in the file counts.
 * PNG   the outline is traced from the silhouette (transparent PNG → alpha; an opaque picture → dark = shape).
 *
 * Either way the result is a list of rings in the FILE's own units (y up) plus the file's canvas as `frame`; shape.js
 * scales it to millimetres once the customer says how wide the card is. Only the largest piece is used; rings inside
 * it become punched holes.
 */
import { loadSvgElement, labelOf, normalizeLabel, MAX_SVG_BYTES } from './svgArtwork.js';
import { inspectRaster, decodeRaster } from './rasterArtwork.js';
import { shapeFieldFromRgba, outlineFromField, outlineFromLoops, simplifyRing, validateRings, ringSelfIntersects, CROSSING_MESSAGE } from './shape.js';

const DIE_LABEL = /die ?line|die ?cut|cut ?line|cut ?contour|contour|outline|shape|ไดคัท|เส้นตัด/;
const GEOMETRY = 'path, rect, circle, ellipse, polygon, polyline, line';
const NON_RENDERED = 'defs, symbol, clipPath, mask, pattern, marker';
const TRACE_SIDE = 720; // px on the long side the silhouette is traced at
const MAX_RING_POINTS = 4000;

const hasDieLabel = (el) => {
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) if (DIE_LABEL.test(normalizeLabel(labelOf(n)))) return true;
  return false;
};

/**
 * Simplify the raw rings and check they can be extruded. Simplifying a very detailed edge can make it cross itself
 * (or leave too many points), so the tolerance is varied before giving up; the first failure is what is reported.
 */
function finish(name, kind, raw, tolerance, frame, extent, warnings, extra = {}) {
  if (raw.pieces > 1) warnings.push(`พบรูปทรง ${raw.pieces} ชิ้นในไฟล์ — ใช้ชิ้นที่ใหญ่ที่สุดเท่านั้น`);
  const opts = { minArea: extent * extent * 1e-4, maxPoints: MAX_RING_POINTS };
  let firstFailure = null;
  for (const factor of [1, 1 / 3, 1 / 10, 3, 10]) {
    const rings = raw.rings.map((r) => simplifyRing(r, tolerance * factor));
    const check = validateRings(rings, opts);
    if (check.ok) return { kind, name, rings, frame, warnings, ...extra };
    firstFailure ??= check;
  }
  throw new Error(firstFailure.message);
}

/* ---------------------------------------------------------------------- SVG */

function outlineFromSvg(text, name) {
  const { svg, size } = loadSvgElement(text);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none';
  const live = document.importNode(svg, true);
  live.removeAttribute('viewBox'); // user units stay the file's own, so getCTM only carries the transforms inside the file
  live.setAttribute('width', String(size.w));
  live.setAttribute('height', String(size.h));
  host.append(live);
  document.body.append(host);
  try {
    const all = [...live.querySelectorAll(GEOMETRY)].filter((el) => !el.closest(NON_RENDERED) && typeof el.getTotalLength === 'function' && getComputedStyle(el).display !== 'none');
    if (!all.length) throw new Error('ไม่พบเส้นหรือรูปทรงในไฟล์ SVG นี้');
    const labelled = all.filter(hasDieLabel);
    const pick = labelled.length ? labelled : all;

    const extent = Math.max(size.w, size.h);
    const step = extent / 700;
    const loops = [];
    for (const el of pick) {
      let total = 0;
      try {
        total = el.getTotalLength();
      } catch {
        continue;
      }
      if (!(total > 0)) continue;
      const n = Math.min(1500, Math.max(16, Math.ceil(total / step)));
      const gap = Math.max((4 * total) / n, 1e-9); // a jump bigger than a few sample steps = the next sub-path
      const m = el.getCTM();
      let cur = [];
      let prev = null;
      const flush = () => {
        if (cur.length >= 3) loops.push(cur);
        cur = [];
      };
      for (let i = 0; i < n; i++) {
        const q = el.getPointAtLength((total * i) / n);
        const p = m ? { x: m.a * q.x + m.c * q.y + m.e, y: -(m.b * q.x + m.d * q.y + m.f) } : { x: q.x, y: -q.y };
        if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > gap) flush();
        cur.push(p);
        prev = p;
      }
      flush();
    }

    const result = outlineFromLoops(loops, { minArea: extent * extent * 1e-6 });
    if (!result) {
      // a bow-tie has a net area of ~0, so it never becomes an outline — say what is really wrong
      throw new Error(loops.some(ringSelfIntersects) ? CROSSING_MESSAGE : 'ไม่พบเส้นรอบรูปทรงที่ปิดสนิทในไฟล์ SVG');
    }

    const warnings = [];
    if (!labelled.length && all.length > 1) warnings.push('ไม่พบ Layer ชื่อ dieline — ใช้เส้นทั้งหมดในไฟล์ ถ้ามีงานพิมพ์ปนอยู่ ให้ส่งเฉพาะเส้นไดคัท');
    // y is flipped (up), so the file's canvas [y, y + h] becomes [−(y + h), −y]
    const frame = { x0: size.x, y0: -(size.y + size.h), x1: size.x + size.w, y1: -size.y };
    return finish(name, 'svg', result, extent * 0.0004, frame, extent, warnings, { sourceAspect: size.w / size.h });
  } finally {
    host.remove();
  }
}

/* ------------------------------------------------------------------ picture */

async function outlineFromPicture(file, { invert }) {
  const info = await inspectRaster(file);
  const decoded = await decodeRaster(file, info);
  try {
    const k = Math.min(1, TRACE_SIDE / Math.max(decoded.width, decoded.height));
    const w = Math.max(8, Math.round(decoded.width * k));
    const h = Math.max(8, Math.round(decoded.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, w, h);
    const { field, usedBrightness } = shapeFieldFromRgba(ctx.getImageData(0, 0, w, h).data, w, h, { invert });
    const result = outlineFromField(field, w, h, { tolerance: 0 }); // raw rings: finish() simplifies and validates
    if (!result) throw new Error('ไม่พบรูปทรงในภาพ — ใช้ PNG พื้นโปร่งใส หรือภาพสีเข้มบนพื้นขาว');

    const warnings = [];
    if (usedBrightness) warnings.push(invert ? 'ภาพไม่มีพื้นโปร่งใส — ใช้ส่วนที่สว่างเป็นรูปทรง (กดกลับด้านเพื่อสลับ)' : 'ภาพไม่มีพื้นโปร่งใส — ใช้ส่วนที่เข้มเป็นรูปทรง (กดกลับด้านเพื่อสลับ)');
    if (k < 1 || Math.min(decoded.width, decoded.height) < 200) warnings.push('เส้นขอบจาก PNG ละเอียดน้อยกว่า SVG — ถ้าต้องการขอบเรียบคมให้ใช้ SVG');
    return finish(file.name, 'png', result, 0.7, { x0: 0, y0: 0, x1: w, y1: h }, Math.max(w, h), warnings, { usedBrightness, sourceAspect: w / h });
  } finally {
    decoded.close();
  }
}

/** @returns {Promise<{kind: 'svg'|'png', name: string, rings: object[][], frame: object, warnings: string[], sourceAspect: number}>} */
export async function loadShapeFile(file, { invert = false } = {}) {
  if (/\.svg$/i.test(file.name || '') || file.type === 'image/svg+xml') {
    if (file.size > MAX_SVG_BYTES) throw new Error('ไฟล์ SVG ใหญ่เกิน 5 MB');
    return outlineFromSvg(await file.text(), file.name);
  }
  return outlineFromPicture(file, { invert });
}
