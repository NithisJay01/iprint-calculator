/**
 * shape.js — pure geometry for the card: its outline (die-cut), the artwork frame and the image guards.
 * No DOM and no three.js in here, so tests/material-preview-test.mjs can run it in node.
 *
 * Vocabulary
 *   outline   list of rings, each ring = [{x, y}] in millimetres, y up, centred on the middle of the cut shape's
 *             bounding box. Ring 0 is the outer edge, the others are punched holes.
 *   bounds    {w, h} — bounding box of the cut shape (this is "the card size").
 *   frame     {cx, cy, w, h} — the rectangle every artwork layer is fitted to, same coordinates as the outline.
 *             For presets it is the bounds (+ bleed on each side); for a die-cut file it is the file's own canvas,
 *             so a template whose artwork and die-line share one artboard lines up by itself.
 */

export const THICKNESS_MM = 0.55;
export const BEVEL_MM = 0.07;
/** Real (production) size range per side, mm. Each side is clamped on its own only at these limits. */
export const SIZE_LIMITS = Object.freeze({ min: 20, max: 1000 });
/**
 * The 3D preview never builds a card larger than PREVIEW_MAX_MM: a bigger job is shown as a scale model — the same
 * shape and ratio, drawn at 1:N (the first step that fits). Production files and the size fields keep the real mm.
 */
export const PREVIEW_MAX_MM = 150;
export const PREVIEW_SCALES = Object.freeze([1, 2, 5, 10]);
export const ASPECT_TOLERANCE = 0.02;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/* ------------------------------------------------------------------ polygons */

/** Signed area (counter-clockwise = positive). */
export function polygonArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function ringBounds(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsOf(rings) {
  const all = rings.map(ringBounds);
  return {
    minX: Math.min(...all.map((b) => b.minX)),
    minY: Math.min(...all.map((b) => b.minY)),
    maxX: Math.max(...all.map((b) => b.maxX)),
    maxY: Math.max(...all.map((b) => b.maxY)),
  };
}

export function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Drops consecutive duplicate points (and a closing point equal to the first). */
export function dedupeRing(ring, eps = 1e-6) {
  const out = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > eps || Math.abs(last.y - p.y) > eps) out.push(p);
  }
  while (out.length > 1 && Math.abs(out[0].x - out[out.length - 1].x) <= eps && Math.abs(out[0].y - out[out.length - 1].y) <= eps) out.pop();
  return out;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function rdpOpen(points, tol) {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(points[i], points[s], points[e]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (idx > 0 && max > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Ramer–Douglas–Peucker for a closed ring (split at the point farthest from the first one). */
export function simplifyRing(ring, tol) {
  const pts = dedupeRing(ring);
  if (pts.length <= 4 || !(tol > 0)) return pts;
  let far = 0;
  let best = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = rdpOpen(pts.slice(0, far + 1), tol);
  const b = rdpOpen([...pts.slice(far), pts[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function segmentsCross(p1, p2, p3, p4) {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function segmentBox(a, b) {
  return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
}

const boxesOverlap = (u, v) => u.x0 <= v.x1 && v.x0 <= u.x1 && u.y0 <= v.y1 && v.y0 <= u.y1;

export function ringSelfIntersects(ring) {
  const n = ring.length;
  const boxes = ring.map((p, i) => segmentBox(p, ring[(i + 1) % n]));
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // neighbours through the closing edge
      if (!boxesOverlap(boxes[i], boxes[j])) continue;
      if (segmentsCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function ringsCross(a, b) {
  const boxesB = b.map((p, j) => segmentBox(p, b[(j + 1) % b.length]));
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    const box = segmentBox(p, q);
    for (let j = 0; j < b.length; j++) {
      if (boxesOverlap(box, boxesB[j]) && segmentsCross(p, q, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return false;
}

export const CROSSING_MESSAGE = 'เส้นรอบรูปทรงตัดกันเอง — ใช้เส้นปิดที่ไม่ไขว้กัน (Unite / Outline Stroke ก่อน Export)';

/**
 * Is this outline something the renderer can extrude? Messages are Thai because they are shown to customers.
 * @returns {{ok: boolean, message?: string}}
 */
export function validateRings(rings, { minArea = 1, maxPoints = 4000 } = {}) {
  const fail = (code, message) => ({ ok: false, code, message });
  if (!Array.isArray(rings) || !rings.length) return fail('empty', 'ไม่พบเส้นรอบรูปทรงในไฟล์');
  let total = 0;
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 3) return fail('points', 'เส้นรอบรูปทรงมีจุดน้อยเกินไป');
    if (ring.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return fail('nan', 'เส้นรอบรูปทรงมีค่าที่อ่านไม่ได้');
    total += ring.length;
  }
  if (total > maxPoints) return fail('complex', `รูปทรงซับซ้อนเกินไป (${total} จุด, สูงสุด ${maxPoints}) — ลองลดจำนวนจุดของเส้นก่อน Export`);
  // crossing edges first: a bow-tie has a net area of ~0 and would otherwise be reported as "too small"
  for (const ring of rings) {
    if (ringSelfIntersects(ring)) return fail('cross', CROSSING_MESSAGE);
  }
  if (Math.abs(polygonArea(rings[0])) < minArea) return fail('small', 'รูปทรงเล็กเกินไป');
  for (const hole of rings.slice(1)) {
    if (!pointInRing(hole[0], rings[0]) || ringsCross(rings[0], hole)) return fail('hole', 'รูที่เจาะอยู่นอกหรือตัดกับเส้นรอบนอก');
  }
  return { ok: true };
}

/* ---------------------------------------------------------- preset outlines */

export function presetOutline(kind, w, h, radius = 0) {
  const hw = w / 2;
  const hh = h / 2;
  if (kind === 'ellipse') {
    const n = clamp(Math.round((Math.PI * (w + h)) / 1.2), 48, 180);
    const ring = [];
    for (let i = 0; i < n; i++) {
      const t = (Math.PI * 2 * i) / n;
      ring.push({ x: hw * Math.cos(t), y: hh * Math.sin(t) });
    }
    return [ring];
  }
  const r = kind === 'rounded' ? clamp(radius, 0, Math.min(hw, hh)) : 0;
  if (r < 0.05) return [[{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }]];
  const segs = clamp(Math.ceil(r * 1.6), 6, 16);
  const ring = [];
  const corners = [
    { cx: hw - r, cy: -hh + r, a0: -Math.PI / 2 },
    { cx: hw - r, cy: hh - r, a0: 0 },
    { cx: -hw + r, cy: hh - r, a0: Math.PI / 2 },
    { cx: -hw + r, cy: -hh + r, a0: Math.PI },
  ];
  for (const c of corners) {
    for (let s = 0; s <= segs; s++) {
      const a = c.a0 + ((Math.PI / 2) * s) / segs;
      ring.push({ x: c.cx + r * Math.cos(a), y: c.cy + r * Math.sin(a) });
    }
  }
  return [ring];
}

export const clampSize = (v) => clamp(num(v, 90), SIZE_LIMITS.min, SIZE_LIMITS.max);

/**
 * The single description of the card that geometry, textures, camera and shadow are all derived from.
 * params: { kind: 'rect' | 'rounded' | 'ellipse' | 'custom', width, height, radius, bleed, custom }
 *   custom = { rings (y up, in the file's own units), frame: {x0, y0, x1, y1} } — scaled so the cut shape is `width` mm wide.
 */
export function buildSpec(params = {}) {
  const kind = params.kind || 'rect';
  if (kind === 'custom' && params.custom?.rings?.length) return customSpec(params.custom, num(params.width, 90));
  const w = clampSize(params.width);
  const h = clampSize(params.height ?? 54);
  const bleed = clamp(num(params.bleed, 0), 0, 10);
  const preset = kind === 'custom' ? 'rect' : kind;
  return {
    kind: preset,
    rings: presetOutline(preset, w, h, num(params.radius, 3)),
    bounds: { w, h },
    frame: { cx: 0, cy: 0, w: w + 2 * bleed, h: h + 2 * bleed },
    thickness: THICKNESS_MM,
    bevel: BEVEL_MM,
    bleed,
  };
}

function customSpec(custom, widthMm) {
  const b = boundsOf(custom.rings);
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  let s = clamp(widthMm, SIZE_LIMITS.min, SIZE_LIMITS.max) / bw;
  const big = Math.max(bw * s, bh * s);
  if (big > SIZE_LIMITS.max) s *= SIZE_LIMITS.max / big;
  const small = Math.min(bw * s, bh * s);
  if (small < SIZE_LIMITS.min) s *= SIZE_LIMITS.min / small;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const f = custom.frame;
  return {
    kind: 'custom',
    rings: custom.rings.map((r) => r.map((p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s }))),
    bounds: { w: bw * s, h: bh * s },
    frame: { cx: ((f.x0 + f.x1) / 2 - cx) * s, cy: ((f.y0 + f.y1) / 2 - cy) * s, w: (f.x1 - f.x0) * s, h: (f.y1 - f.y0) * s },
    thickness: THICKNESS_MM,
    bevel: BEVEL_MM,
    bleed: 0,
  };
}

/** The 1:N the preview uses for a real size: the first scale step whose model fits in PREVIEW_MAX_MM. */
export function previewScaleFor(bounds) {
  const big = Math.max(bounds.w, bounds.h);
  return PREVIEW_SCALES.find((n) => big / n <= PREVIEW_MAX_MM + 1e-6) ?? PREVIEW_SCALES[PREVIEW_SCALES.length - 1];
}

/**
 * The spec the 3D preview is built from: `spec` (real mm) shrunk to 1:`scale` — outline, frame and bleed alike, so the
 * ratio and artwork placement are unchanged. Thickness and bevel stay those of real stock, so the model still reads as a
 * card. `scale` is kept on the result.
 */
export function previewSpec(spec, scale = previewScaleFor(spec.bounds)) {
  if (scale === 1) return { ...spec, scale: 1 };
  const k = 1 / scale;
  const f = spec.frame;
  return {
    ...spec,
    rings: spec.rings.map((r) => r.map((p) => ({ x: p.x * k, y: p.y * k }))),
    bounds: { w: spec.bounds.w * k, h: spec.bounds.h * k },
    frame: { cx: f.cx * k, cy: f.cy * k, w: f.w * k, h: f.h * k },
    bleed: spec.bleed * k,
    scale,
  };
}

/** Texture size for a frame: full detail (`budget.ppm` px per mm) unless the frame is so big that the pixel budget wins. */
export function textureSizeFor(frameW, frameH, budget) {
  const ppm = Math.min(budget.ppm, Math.sqrt(budget.pixels / (frameW * frameH)));
  const width = Math.max(64, Math.round(frameW * ppm));
  const height = Math.max(64, Math.round(frameH * ppm));
  return { width, height, ppm: width / frameW };
}

/* ------------------------------------------------------------------- frames */

export const aspectOf = (w, h) => w / h;
export const compareAspect = (a, b, tol = ASPECT_TOLERANCE) => Math.abs(a / b - 1) <= tol;

/**
 * How a file of this aspect sits on the card:
 *   'trim'   it is the trim size without bleed → drawn over the trim, and (artwork) its edges extended into the bleed
 *   'frame'  it already includes the bleed, or nothing better fits → the whole frame (contained, as before)
 * Only preset shapes with a bleed can be 'trim'; a die-cut file's frame is its own artboard.
 */
export function artworkFit(aspect, spec) {
  if (!aspect || spec.kind === 'custom' || !(spec.bleed > 0)) return 'frame';
  const toTrim = Math.abs(aspect / (spec.bounds.w / spec.bounds.h) - 1);
  const toFrame = Math.abs(aspect / (spec.frame.w / spec.frame.h) - 1);
  return toTrim <= ASPECT_TOLERANCE && toTrim < toFrame ? 'trim' : 'frame';
}

/**
 * Where a file of `aspect` lands in the frame, as fractions of the frame (x / y from the top-left, may reach past 0–1:
 * that part is cut off). `placement` is the customer's own choice from the check pop-up, or null for automatic:
 *   null                                   'trim' fit → on the trim, edges extended into the bleed (extend: true)
 *                                          otherwise → contained in the frame (as before)
 *   { base: 'fit' | 'fill' | 'trim',       fit = whole image inside the frame, fill = covers the frame, trim = inside the trim
 *     zoom, dx, dy }                       then scaled by `zoom` about the centre and moved by dx / dy mm (y down)
 */
export function placeArtwork(aspect, spec, placement = null) {
  const fa = spec.frame.w / spec.frame.h;
  const inside = (a, box) => (a > box ? [1, box / a] : [a / box, 1]); // contain: [w, h] as fractions of the box
  if (!placement) {
    if (artworkFit(aspect, spec) === 'trim') {
      const t = trimFraction(spec);
      return { rect: t, extend: true };
    }
    const [w, h] = inside(aspect, fa);
    return { rect: { x: (1 - w) / 2, y: (1 - h) / 2, w, h }, extend: false };
  }
  let w;
  let h;
  if (placement.base === 'fill') [w, h] = aspect > fa ? [aspect / fa, 1] : [1, fa / aspect];
  else if (placement.base === 'trim' && spec.kind !== 'custom') {
    const t = trimFraction(spec);
    const [cw, ch] = inside(aspect, spec.bounds.w / spec.bounds.h);
    [w, h] = [t.w * cw, t.h * ch];
  } else [w, h] = inside(aspect, fa);
  const z = Number(placement.zoom) || 1;
  w *= z;
  h *= z;
  const cx = 0.5 + (Number(placement.dx) || 0) / spec.frame.w;
  const cy = 0.5 + (Number(placement.dy) || 0) / spec.frame.h;
  return { rect: { x: cx - w / 2, y: cy - h / 2, w, h }, extend: false };
}

/** Does the placed picture cover the whole frame (no empty paper left anywhere)? */
export const coversFrame = (r) => r.x <= 1e-3 && r.y <= 1e-3 && r.x + r.w >= 1 - 1e-3 && r.y + r.h >= 1 - 1e-3;

/** The trim area inside the frame, as fractions of the frame (preset shapes are centred in their frame). */
export function trimFraction(spec) {
  const { w, h } = spec.frame;
  return { x: (w - spec.bounds.w) / 2 / w, y: (h - spec.bounds.h) / 2 / h, w: spec.bounds.w / w, h: spec.bounds.h / h };
}

/** Where an image of size sw × sh lands inside W × H without stretching (centred). */
export function containRect(sw, sh, W, H) {
  const s = Math.min(W / sw, H / sh);
  return { x: (W - sw * s) / 2, y: (H - sh * s) / 2, w: sw * s, h: sh * s };
}

/** A file whose aspect matches the cut size plus a common bleed on every side → that bleed (mm), else null. */
export function suggestBleed(fileAspect, w, h, options = [1, 2, 3, 4, 5]) {
  if (compareAspect(fileAspect, w / h)) return null;
  let best = null;
  let bestDiff = 0.015;
  for (const b of options) {
    const diff = Math.abs(fileAspect / ((w + 2 * b) / (h + 2 * b)) - 1);
    if (diff <= bestDiff) {
      best = b;
      bestDiff = diff;
    }
  }
  return best;
}

export const effectiveDpi = (pixelWidth, frameWidthMm) => pixelWidth / (frameWidthMm / 25.4);

/** Human-readable checks that the layers line up. `art` / `mask` = { aspect, pixelWidth? } or null. */
export function registrationNotes({ spec, art, mask }) {
  const notes = [];
  const frameAspect = spec.frame.w / spec.frame.h;
  const size = `${spec.frame.w.toFixed(1)}×${spec.frame.h.toFixed(1)} mm`;
  for (const [label, layer] of [['Layer 1', art], ['Layer 3', mask]]) {
    if (label === 'Layer 3' && layer?.placement) {
      notes.push({ text: 'Layer 3: ปรับขนาด / ตำแหน่งรูปทรงเทคนิคพิเศษเองแล้ว' });
      continue;
    }
    if (label === 'Layer 3' && layer?.aspect && art?.placement && compareAspect(layer.aspect, art.aspect)) {
      notes.push({ text: 'Layer 3: ใช้ขนาดและตำแหน่งเดียวกับงานพิมพ์ที่ปรับไว้' });
      continue;
    }
    if (layer?.placement) {
      if (label === 'Layer 1') {
        const covers = coversFrame(placeArtwork(layer.aspect, spec, layer.placement).rect);
        notes.push(covers
          ? { text: 'Layer 1: ปรับขนาด / ตำแหน่งภาพเองแล้ว — ภาพเต็มแผ่นรวม Bleed' }
          : { text: 'Layer 1: ปรับขนาด / ตำแหน่งภาพเองแล้ว แต่ยังมีพื้นที่ว่างบนแผ่น — จะเป็นขอบขาวหลังตัด', warn: true });
      }
      continue;
    }
    if (layer?.aspect && artworkFit(layer.aspect, spec) === 'trim') {
      notes.push({
        text: label === 'Layer 1'
          ? `Layer 1: ไฟล์ขนาดเท่างานตัด (ไม่มี Bleed) — ระบบเติม Bleed ${+spec.bleed.toFixed(1)} mm ให้อัตโนมัติ โดยยืดขอบภาพออกไป งานไม่ถูกขยายหรือตัดขอบ`
          : 'Layer 3: ไฟล์ขนาดเท่างานตัด — วางตรงกับงานตัด (ไม่ขยายเข้า Bleed)',
      });
      continue;
    }
    if (!layer?.aspect || compareAspect(layer.aspect, frameAspect)) continue;
    let text = `${label}: สัดส่วนไฟล์ ${layer.aspect.toFixed(2)} ไม่ตรงกับกรอบ ${size} (${frameAspect.toFixed(2)}) — วางไว้กลางกรอบโดยไม่ยืดภาพ`;
    if (spec.kind !== 'custom') {
      const b = suggestBleed(layer.aspect, spec.bounds.w, spec.bounds.h);
      if (b) text += ` · ไฟล์นี้น่าจะมี Bleed ${b} mm ลองตั้งค่า Bleed ในขั้นรูปร่างและขนาด`;
    }
    notes.push({ text, warn: true });
  }
  if (art?.aspect && mask?.aspect && !compareAspect(art.aspect, mask.aspect)) {
    notes.push({ text: 'Layer 1 กับ Layer 3 สัดส่วนไม่ตรงกัน — ตำแหน่งเทคนิคพิเศษอาจเยื้องจากงานพิมพ์', warn: true });
  }
  if (art?.pixelWidth) {
    const dpi = effectiveDpi(art.pixelWidth, spec.frame.w);
    if (dpi < 200) notes.push({ text: `Layer 1: ความละเอียดต่ำ (ประมาณ ${Math.round(dpi)} dpi ที่ขนาดจริง) ภาพอาจแตก — ควรตั้งแต่ 300 dpi`, warn: true });
  }
  return notes;
}

/* ------------------------------------------------------------- image guards */

const u16be = (b, o) => (b[o] << 8) | b[o + 1];
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16le = (b, o) => b[o] | (b[o + 1] << 8);
const u24le = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const ascii = (b, o, len) => String.fromCharCode(...b.subarray(o, o + len));

/**
 * Reads the pixel size of a PNG / JPEG / WebP from its header — before anything is decoded, so a small file that
 * claims a gigantic size can be refused without allocating it.
 * @returns {{type: 'png'|'jpeg'|'webp', width: number, height: number} | null}
 */
export function readImageSize(bytes) {
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') {
    return { type: 'png', width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let o = 2;
    while (o + 9 < bytes.length) {
      if (bytes[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = bytes[o + 1];
      if (marker === 0xff) {
        o++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        o += 2;
        continue;
      }
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { type: 'jpeg', height: u16be(bytes, o + 5), width: u16be(bytes, o + 7) };
      o += 2 + u16be(bytes, o + 2);
    }
    return null;
  }
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8 ') return { type: 'webp', width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const b0 = bytes[21];
      const b1 = bytes[22];
      const b2 = bytes[23];
      const b3 = bytes[24];
      return { type: 'webp', width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (chunk === 'VP8X') return { type: 'webp', width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
  }
  return null;
}

function exifOrientation(b, t, end) {
  if (t + 8 > end) return null;
  const le = b[t] === 0x49; // "II" = little endian, "MM" = big endian
  const u16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
  if (u16(t + 2) !== 42) return null;
  const ifd = t + u32(t + 4);
  if (ifd + 2 > end) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) break;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/**
 * What a PDF needs to know to embed a JPEG untouched: size, number of colour components (1 grey, 3 RGB, 4 CMYK),
 * and whether the picture is rotated by an EXIF orientation tag — a PDF ignores that tag, so a rotated JPEG cannot
 * be passed through as it is. `adobeTransform` is the Adobe APP14 colour-transform flag (CMYK JPEGs are often inverted).
 * @returns {{width, height, components, progressive, orientation: number, adobeTransform: number|null} | null}
 */
export function readJpegInfo(bytes) {
  if (!(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8)) return null;
  let o = 2;
  let orientation = 1;
  let adobeTransform = null;
  let sof = null;
  while (o + 4 <= bytes.length) {
    if (bytes[o] !== 0xff) {
      o++;
      continue;
    }
    const marker = bytes[o + 1];
    if (marker === 0xff) {
      o++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan — the headers are behind us
    const len = u16be(bytes, o + 2);
    const seg = o + 4;
    if (marker === 0xe1 && ascii(bytes, seg, 4) === 'Exif') orientation = exifOrientation(bytes, seg + 6, o + 2 + len) ?? orientation;
    else if (marker === 0xee && ascii(bytes, seg, 5) === 'Adobe') adobeTransform = bytes[seg + 11] ?? null;
    else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      sof = { progressive: marker === 0xc2, height: u16be(bytes, seg + 1), width: u16be(bytes, seg + 3), components: bytes[seg + 5] };
    }
    o += 2 + len;
  }
  return sof ? { ...sof, orientation, adobeTransform } : null;
}

/* ------------------------------------------------- outline from a mask image */

/**
 * A 0..1 shape field from RGBA pixels. A PNG with transparency uses its alpha; a fully opaque picture (a black
 * silhouette on white, say) falls back to brightness, dark = shape, unless `invert` is set.
 */
export function shapeFieldFromRgba(rgba, w, h, { invert = false } = {}) {
  const n = w * h;
  const field = new Float32Array(n);
  // Opaque picture vs. PNG with transparency is decided by the INTERIOR: the outermost pixels of a resampled picture
  // are often semi-transparent just from anti-aliasing, and that must not turn a black-on-white picture into "alpha".
  const m = w > 6 && h > 6 ? 2 : 0;
  let opaque = true;
  scan: for (let y = m; y < h - m; y++) {
    for (let x = m; x < w - m; x++) {
      if (rgba[(y * w + x) * 4 + 3] < 250) {
        opaque = false;
        break scan;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (!opaque) field[i] = rgba[i * 4 + 3] / 255;
    else {
      const luma = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
      field[i] = invert ? luma : 1 - luma;
    }
  }
  return { field, usedBrightness: opaque };
}

export function blurField(src, w, h) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = src[y * w + Math.max(0, x - 1)];
      const c = src[y * w + x];
      const r = src[y * w + Math.min(w - 1, x + 1)];
      tmp[y * w + x] = (l + c + r) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    const up = Math.max(0, y - 1);
    const down = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) out[y * w + x] = (tmp[up * w + x] + tmp[y * w + x] + tmp[down * w + x]) / 3;
  }
  return out;
}

/**
 * Marching squares on a scalar field. Returns closed loops in pixel-centre coordinates, y up
 * (pixel (0,0) → (0.5, h − 0.5)); the field is padded with zeros so every loop closes.
 */
export function traceContours(field, w, h, iso = 0.5) {
  const W = w + 2;
  const H = h + 2;
  const g = new Float32Array(W * H);
  for (let y = 0; y < h; y++) g.set(field.subarray(y * w, y * w + w), (y + 1) * W + 1);

  const pts = new Map();
  const adj = new Map();
  const point = (key, x, y) => {
    if (!pts.has(key)) pts.set(key, { x, y });
    return key;
  };
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  };

  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const a = g[y * W + x];
      const b = g[y * W + x + 1];
      const c = g[(y + 1) * W + x + 1];
      const d = g[(y + 1) * W + x];
      const idx = (a >= iso ? 8 : 0) | (b >= iso ? 4 : 0) | (c >= iso ? 2 : 0) | (d >= iso ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const T = () => point(2 * (y * W + x), x + (iso - a) / (b - a), y);
      const R = () => point(2 * (y * W + x + 1) + 1, x + 1, y + (iso - b) / (c - b));
      const B = () => point(2 * ((y + 1) * W + x), x + (iso - d) / (c - d), y + 1);
      const L = () => point(2 * (y * W + x) + 1, x, y + (iso - a) / (d - a));
      switch (idx) {
        case 1:
        case 14:
          link(L(), B());
          break;
        case 2:
        case 13:
          link(B(), R());
          break;
        case 3:
        case 12:
          link(L(), R());
          break;
        case 4:
        case 11:
          link(T(), R());
          break;
        case 6:
        case 9:
          link(T(), B());
          break;
        case 7:
        case 8:
          link(L(), T());
          break;
        case 5:
          if ((a + b + c + d) / 4 >= iso) {
            link(T(), L());
            link(B(), R());
          } else {
            link(T(), R());
            link(L(), B());
          }
          break;
        case 10:
          if ((a + b + c + d) / 4 >= iso) {
            link(T(), R());
            link(L(), B());
          } else {
            link(L(), T());
            link(B(), R());
          }
          break;
        default:
      }
    }
  }

  const loops = [];
  const seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1;
    let cur = start;
    for (;;) {
      seen.add(cur);
      loop.push(pts.get(cur));
      const nb = adj.get(cur);
      const next = nb[0] === prev ? nb[1] : nb[0];
      if (next === undefined || next === start || seen.has(next)) break;
      prev = cur;
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop.map((p) => ({ x: p.x - 0.5, y: h - (p.y - 0.5) })));
  }
  return loops;
}

/** Biggest loop = the cut edge, loops directly inside it = holes. Everything else (separate pieces, islands) is dropped. */
export function outlineFromLoops(loops, { minArea = 0 } = {}) {
  const info = loops
    .map((ring) => ({ ring, area: Math.abs(polygonArea(ring)) }))
    .filter((o) => o.area >= minArea)
    .sort((a, b) => b.area - a.area);
  if (!info.length) return null;
  for (const o of info) o.depth = info.filter((p) => p !== o && p.area > o.area && pointInRing(o.ring[0], p.ring)).length;
  const outer = info.find((o) => o.depth === 0);
  const holes = info.filter((o) => o.depth === 1 && pointInRing(o.ring[0], outer.ring));
  return { rings: [outer.ring, ...holes.map((o) => o.ring)], pieces: info.filter((o) => o.depth === 0).length };
}

/** Field → simplified rings (units = field pixels). Returns null when there is no shape. */
export function outlineFromField(field, w, h, { iso = 0.5, smooth = 1, tolerance = 0.7, minArea } = {}) {
  let f = field;
  for (let i = 0; i < smooth; i++) f = blurField(f, w, h);
  const res = outlineFromLoops(traceContours(f, w, h, iso), { minArea: minArea ?? Math.max(16, w * h * 0.0005) });
  if (!res) return null;
  return { rings: res.rings.map((r) => simplifyRing(r, tolerance)), pieces: res.pieces };
}
