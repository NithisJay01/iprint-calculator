/**
 * svgArtwork.js — reads an uploaded SVG for Layer 1 (printed artwork) or Layer 3 (finish shape).
 *
 * Everything visible in the file is used. Only guide geometry is left out: a layer / group / id named dieline,
 * cutline, bleed, trim, safe, guide, template, crop marks… or anything marked data-finish="hide".
 *
 * The SVG is sanitised (no scripts, no external files) and only ever rendered through an <img>, which cannot run
 * code. No network, no backend: the file never leaves the browser.
 */

export const MAX_SVG_BYTES = 5 * 1024 * 1024;
const NON_RENDERED = 'defs, symbol, clipPath, mask, pattern, marker';
const DRAWABLE = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'use']);
const UNIT_PX = { '': 1, px: 1, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72, pc: 16 };
const GUIDE = /\b(die ?line|die ?cut|cut ?line|cut ?contour|bleed|trim|safe( zone)?|guides?|template|crop marks?|ignore|hidden)\b/;

export const tag = (el) => (el.localName || '').toLowerCase();

/** "spot_x5F_uv" (Illustrator escapes "_" as _x5F_) → "spot uv" */
export function normalizeLabel(s) {
  return String(s || '')
    .replace(/_x([0-9a-f]{2,4})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/[_\-.]+/g, ' ')
    .toLowerCase()
    .trim();
}

export const labelOf = (el) => el.getAttribute('inkscape:label') || el.getAttribute('data-name') || el.getAttribute('serif:id') || el.getAttribute('aria-label') || el.getAttribute('id') || '';

export const isGuideLabel = (label) => GUIDE.test(normalizeLabel(label));

/** Is this element (or any group around it) a guide that must not be printed / stamped? */
function isGuide(leaf) {
  for (let n = leaf; n && n.nodeType === 1; n = n.parentNode) {
    const f = n.getAttribute('data-finish');
    if (f && /^(hide|hidden|ignore)$/.test(normalizeLabel(f))) return true;
    if (isGuideLabel(labelOf(n))) return true;
  }
  return false;
}

/* -------------------------------------------------------------- sanitising */

const EXTERNAL_URL = /url\(\s*(['"]?)(?!#|data:)[^)]*\)/gi;

/** Strips anything that could run code or fetch a file. Returns how many linked (non-embedded) images were dropped. */
export function sanitize(svg) {
  let externalImages = 0;
  for (const el of svg.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, animate, animateTransform, animateMotion, set')) el.remove();
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on')) el.removeAttribute(a.name);
      else if ((n === 'href' || n === 'xlink:href') && !/^(#|data:image\/)/i.test(a.value.trim())) {
        if (tag(el) === 'image') externalImages++; // a linked picture: cannot be loaded, so it will be missing
        el.removeAttribute(a.name);
      } else if (n === 'style' && EXTERNAL_URL.test(a.value)) el.setAttribute(a.name, a.value.replace(EXTERNAL_URL, 'none'));
      EXTERNAL_URL.lastIndex = 0;
    }
    if (tag(el) === 'style') el.textContent = el.textContent.replace(/@import[^;]*;?/gi, '').replace(EXTERNAL_URL, 'none');
  }
  return { externalImages };
}

/* ------------------------------------------------------------------- sizes */

function toPx(value) {
  const m = String(value ?? '').trim().match(/^([\d.]+)\s*([a-z%]*)$/i);
  if (!m || m[2] === '%' || !(m[2].toLowerCase() in UNIT_PX)) return null;
  return parseFloat(m[1]) * UNIT_PX[m[2].toLowerCase()];
}

/** viewBox (or width / height) → { x, y, w, h }; null when the file has no usable size. */
export function readSize(svg) {
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  const w = toPx(svg.getAttribute('width'));
  const h = toPx(svg.getAttribute('height'));
  return w > 0 && h > 0 ? { x: 0, y: 0, w, h } : null;
}

/** Text → sanitised, size-checked SVG element. Throws an Error with a Thai message when the file is unusable. */
export function loadSvgElement(text) {
  if (text.length > MAX_SVG_BYTES) throw new Error('ไฟล์ SVG ใหญ่เกิน 5 MB');
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || tag(svg) !== 'svg' || doc.querySelector('parsererror')) throw new Error('อ่านไฟล์ SVG ไม่ได้ — โครงสร้างไฟล์ไม่ถูกต้อง');
  const { externalImages } = sanitize(svg);
  const size = readSize(svg);
  if (!size) throw new Error('ไม่พบขนาดของ SVG (ต้องมี viewBox หรือ width/height ที่ไม่ใช่ %)');
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `${size.x} ${size.y} ${size.w} ${size.h}`);
  return { svg, size, externalImages };
}

/* ------------------------------------------------------------------ layers */

/**
 * Read an SVG that will be drawn as one layer.
 * @returns {{name, svg, size, warnings, hidden, aspect}}
 */
export function parseSvg(text, name = 'artwork.svg') {
  const { svg, size, externalImages } = loadSvgElement(text);
  const leaves = [...svg.querySelectorAll('*')].filter((el) => DRAWABLE.has(tag(el)) && !el.closest(NON_RENDERED));
  if (!leaves.length) throw new Error('ไม่พบรูปทรงให้แสดงในไฟล์ SVG นี้');

  let hidden = 0;
  for (const leaf of leaves) {
    if (isGuide(leaf)) {
      leaf.setAttribute('data-mp-hide', '1');
      hidden++;
    }
  }
  if (hidden === leaves.length) throw new Error('ทุกส่วนของไฟล์เป็นเส้นไกด์ (dieline / bleed / guide) จึงไม่มีอะไรให้แสดง');

  const warnings = [];
  if (hidden) warnings.push(`ซ่อนเส้นไกด์ ${hidden} ชิ้น (dieline / bleed / guide) ไม่นำไปพิมพ์`);
  if (externalImages) warnings.push(`พบรูปภาพที่ลิงก์ไปไฟล์ภายนอก ${externalImages} รูป — แสดงไม่ได้ (ตัดลิงก์เพื่อความปลอดภัย) ให้ Embed รูปลงในไฟล์ SVG ก่อน Export`);
  if (leaves.some((l) => tag(l) === 'text')) warnings.push('พบข้อความแบบ Text — ถ้าฟอนต์ไม่ได้ติดตั้งในเครื่องนี้ จะแสดงเป็นฟอนต์อื่น แนะนำให้แปลงเป็น Outline (Create Outlines) ก่อน Export');
  return { name, svg, size, warnings, hidden, aspect: size.w / size.h };
}

/** Rasterise the SVG contained in W × H (never stretched). Guide geometry is hidden first. */
export async function renderSvgLayer(parsed, W, H) {
  const clone = parsed.svg.cloneNode(true);
  for (const el of clone.querySelectorAll('[data-mp-hide]')) el.setAttribute('style', `${el.getAttribute('style') || ''};display:none`);
  return rasterize(clone, W, H);
}

async function rasterize(svgEl, W, H) {
  svgEl.setAttribute('width', String(W));
  svgEl.setAttribute('height', String(H));
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  if (!svgEl.getAttribute('xmlns')) svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const xml = new XMLSerializer().serializeToString(svgEl);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('แสดงผล SVG ไม่สำเร็จ — ไฟล์อาจใช้ฟีเจอร์ที่เบราว์เซอร์ไม่รองรับ'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.getContext('2d').drawImage(img, 0, 0, W, H);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
