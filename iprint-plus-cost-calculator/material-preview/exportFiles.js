/**
 * exportFiles.js — the customer's layers → a production PDF or a layered SVG. This is the DOM side of the export;
 * the layout and file formats live in productionSpec.js / pdfBuild.js / svgBuild.js (pure, tested in node).
 *
 * Loaded on demand (dynamic import) when the customer opens the export step, so it costs nothing until then.
 *
 * How each layer is drawn
 *   Layer 1  SVG      vector (svgConvert). If the file uses something PDF cannot keep (text, gradients, clip-paths…) the whole
 *                     layer is drawn as a picture at EXPORT.fallbackDpi and the report says why.
 *            picture  embedded at its own resolution; a JPEG is passed through byte for byte.
 *   Layer 3  SVG      vector, painted in the finish's spot colour.
 *            picture  its silhouette is traced into vector paths (all pieces, holes included), also in the spot colour.
 *   die-line exact curves for the presets, the (finely sampled) outline for a die-cut file.
 * Nothing leaves the browser.
 */
import { EXPORT } from './materials.js';
import { buildProductionPlan, assembleJob } from './productionSpec.js';
import { buildPdf } from './pdfBuild.js';
import { buildSvg } from './svgBuild.js';
import { inspectPdf, rgbToCmyk } from './pdf.js';
import { convertSvg } from './svgConvert.js';
import { renderSvgLayer } from './svgArtwork.js';
import { decodeRaster } from './rasterArtwork.js';
import { readJpegInfo, containRect, shapeFieldFromRgba, blurField, traceContours, simplifyRing, polygonArea } from './shape.js';
import { ringsToSegments } from './svgPath.js';

const MASK_TRACE_MAX_SIDE = 3000; // px on the long side a picture / rasterised SVG is traced at
const MAX_TRACE_POINTS = 200000;
const num = (v) => String(Math.round(v * 1000) / 1000);

const toBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const newCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
const pixelsOf = (canvas) => canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
/** Image space is 0..1 with y UP; this maps it onto a rectangle {x, y, w, h} of the page (mm, y down). */
const imageMatrix = (r) => [r.w, 0, 0, -r.h, r.x, r.y + r.h];

/** RGBA pixels → a PDF image resource (RGB or CMYK, with a soft mask when anything is transparent). */
function pixelsToResource(rgba, w, h, colorMode) {
  const n = w * h;
  let hasAlpha = false;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 255) {
      hasAlpha = true;
      break;
    }
  }
  const cmyk = colorMode === 'cmyk';
  const data = new Uint8Array(n * (cmyk ? 4 : 3));
  const alpha = hasAlpha ? new Uint8Array(n) : null;
  for (let i = 0, j = 0; i < n; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    if (cmyk) {
      const [c, m, y, k] = rgbToCmyk(r / 255, g / 255, b / 255);
      data[j++] = Math.round(c * 255);
      data[j++] = Math.round(m * 255);
      data[j++] = Math.round(y * 255);
      data[j++] = Math.round(k * 255);
    } else {
      data[j++] = r;
      data[j++] = g;
      data[j++] = b;
    }
    if (alpha) alpha[i] = rgba[i * 4 + 3];
  }
  return { width: w, height: h, colorSpace: cmyk ? 'DeviceCMYK' : 'DeviceRGB', bpc: 8, filter: null, data, smask: alpha ? { width: w, height: h, data: alpha } : null };
}

/**
 * A picture file → a PDF image resource. A plain JPEG is embedded untouched (RGB mode only); everything else is
 * decoded at full size (up to EXPORT.maxRasterPixels, then scaled down to fit that).
 */
async function embedRaster(file, type, colorMode, wantDataUrl) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = `image/${type}`;
  const jpeg = type === 'jpeg' ? readJpegInfo(bytes) : null;
  if (jpeg && jpeg.orientation === 1 && (jpeg.components === 1 || jpeg.components === 3) && colorMode === 'rgb') {
    const res = { width: jpeg.width, height: jpeg.height, colorSpace: jpeg.components === 1 ? 'DeviceGray' : 'DeviceRGB', bpc: 8, filter: 'DCTDecode', data: bytes };
    if (wantDataUrl) res.dataUrl = `data:${mime};base64,${toBase64(bytes)}`;
    return { res, width: jpeg.width, height: jpeg.height, note: 'ส่งผ่านไฟล์ JPEG เดิมโดยไม่เข้ารหัสซ้ำ' };
  }

  let source;
  let w;
  let h;
  let close = () => {};
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    source = bmp;
    w = bmp.width;
    h = bmp.height;
    close = () => bmp.close?.();
  } catch {
    const decoded = await decodeRaster(file, { width: 0, height: 0 }); // browsers without the option: the capped decoder
    source = decoded.source;
    w = decoded.width;
    h = decoded.height;
    close = () => decoded.close();
  }
  let note = 'ฝังที่ความละเอียดเดิมของไฟล์';
  if (w * h > EXPORT.maxRasterPixels) {
    const s = Math.sqrt(EXPORT.maxRasterPixels / (w * h));
    w = Math.floor(w * s);
    h = Math.floor(h * s);
    note = `ภาพใหญ่เกิน ${EXPORT.maxRasterPixels / 1e6} ล้านพิกเซล จึงย่อเหลือ ${w}×${h} px`;
  }
  const canvas = newCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  close();
  const res = pixelsToResource(ctx.getImageData(0, 0, w, h).data, w, h, colorMode);
  if (wantDataUrl) {
    const keepOriginal = type === 'png' || type === 'webp' || (jpeg && jpeg.orientation === 1);
    res.dataUrl = keepOriginal && w * h <= EXPORT.maxRasterPixels ? `data:${mime};base64,${toBase64(bytes)}` : canvas.toDataURL('image/png');
  }
  return { res, width: w, height: h, note };
}

/** A whole SVG drawn as one picture (the fallback when it cannot be kept as vectors). */
async function rasterizeSvg(parsed, frameRect, colorMode, wantDataUrl) {
  let W = Math.round((frameRect.w / 25.4) * EXPORT.fallbackDpi);
  let H = Math.round((frameRect.h / 25.4) * EXPORT.fallbackDpi);
  if (W * H > EXPORT.maxRasterPixels) {
    const s = Math.sqrt(EXPORT.maxRasterPixels / (W * H));
    W = Math.floor(W * s);
    H = Math.floor(H * s);
  }
  const canvas = await renderSvgLayer(parsed, W, H);
  const res = pixelsToResource(pixelsOf(canvas), W, H, colorMode);
  if (wantDataUrl) res.dataUrl = canvas.toDataURL('image/png');
  return { res, dpi: Math.round(W / (frameRect.w / 25.4)) };
}

/** A silhouette (RGBA pixels) → one even-odd path in the spot colour: every piece, holes included. */
function traceSilhouette(rgba, w, h, place, spotKey, { alphaOnly = false, invert = false } = {}) {
  let field;
  if (alphaOnly) {
    field = new Float32Array(w * h);
    for (let i = 0; i < field.length; i++) field[i] = rgba[i * 4 + 3] / 255;
  } else field = shapeFieldFromRgba(rgba, w, h, { invert }).field;
  const loops = traceContours(blurField(field, w, h), w, h, 0.5);
  const rings = [];
  let points = 0;
  for (const loop of loops) {
    if (Math.abs(polygonArea(loop)) < 2) continue; // specks
    const ring = simplifyRing(loop, 0.5);
    if (ring.length < 3) continue;
    rings.push(ring);
    points += ring.length;
  }
  if (!rings.length) throw new Error('ไม่พบรูปทรงในไฟล์ Layer 3');
  if (points > MAX_TRACE_POINTS) throw new Error('รูปทรง Layer 3 ซับซ้อนเกินไปสำหรับส่งออกแบบเวกเตอร์');
  const r = containRect(w, h, place.w, place.h);
  const k = r.w / w;
  const page = rings.map((ring) => ring.map((p) => ({ x: place.x0 + r.x + p.x * k, y: place.y0 + r.y + (h - p.y) * k })));
  return { items: [{ type: 'path', segs: ringsToSegments(page), fill: { spot: spotKey, tint: 1 }, stroke: null, rule: 'evenodd', overprint: true }], pieces: rings.length, points };
}

/* --------------------------------------------------- SVG export helpers */

function prefixIds(root, prefix) {
  const ids = new Set([...root.querySelectorAll('[id]')].map((el) => el.getAttribute('id')));
  if (root.getAttribute('id')) ids.add(root.getAttribute('id'));
  const fix = (v) => v.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, (m, q, id) => (ids.has(id) ? `url(#${prefix}${id})` : m));
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      if (a.name === 'id') a.value = prefix + a.value;
      else if ((a.name === 'href' || a.name === 'xlink:href') && a.value.startsWith('#') && ids.has(a.value.slice(1))) a.value = `#${prefix}${a.value.slice(1)}`;
      else if (a.value.includes('url(')) a.value = fix(a.value);
    }
    if (el.localName === 'style') el.textContent = fix(el.textContent);
  }
}

/** The customer's own SVG, placed on the page by the browser's own viewBox fitting. Ids are prefixed so files cannot clash. */
function nestedSvg(parsed, rect, prefix) {
  const clone = parsed.svg.cloneNode(true);
  for (const el of clone.querySelectorAll('[data-mp-hide]')) el.remove(); // guides are not part of the artwork
  for (const g of [...clone.querySelectorAll('g')].reverse()) if (!g.firstElementChild && !g.textContent.trim()) g.remove(); // groups the guides left empty
  prefixIds(clone, prefix);
  for (const a of ['width', 'height', 'x', 'y', 'style']) clone.removeAttribute(a);
  clone.setAttribute('x', num(rect.x0));
  clone.setAttribute('y', num(rect.y0));
  clone.setAttribute('width', num(rect.w));
  clone.setAttribute('height', num(rect.h));
  clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return new XMLSerializer().serializeToString(clone);
}

/* -------------------------------------------------------------- the job */

/**
 * @param src      layers.exportSources() + { paperId, material, coatingId, finishId }
 * @param options  { colorMode, cropMarks, jobPage }
 * @param kind     'pdf' | 'svg'
 */
export async function buildExportJob(src, options, kind) {
  const plan = buildProductionPlan({
    spec: src.spec,
    params: src.params,
    cut: src.cut,
    paperId: src.paperId,
    material: src.material,
    coatingId: src.coatingId,
    finishId: src.finishId,
    art: src.art,
    mask: src.mask,
    options,
  });
  if (plan.blocking) throw new Error(plan.checks.find((c) => c.level === 'error').text);
  const colorMode = plan.options.colorMode;
  const wantDataUrl = kind === 'svg';
  const report = [];
  const images = {};
  let seq = 0;
  const nextId = () => `im${++seq}`;
  const frame = plan.frameRect;

  /* ---- Layer 1 */
  let artItems = [];
  let artSvgInner = null;
  const { art } = src;
  if (art.kind === 'svg') {
    if (kind === 'svg') {
      artSvgInner = nestedSvg(art.parsed, frame, 'a-');
      report.push('Layer 1: ฝังไฟล์ SVG เดิมทั้งหมด (ข้อความและ Gradient ยังแก้ไขได้)');
    } else {
      const conv = await convertSvg(art.parsed, frame, { mode: 'print', nextId });
      if (conv.ok) {
        artItems = conv.items;
        for (const im of conv.images) {
          const e = await embedRaster(new File([im.bytes], 'embedded', { type: im.mime }), im.mime.split('/')[1], colorMode, false);
          images[im.id] = e.res;
        }
        report.push(`Layer 1: เวกเตอร์ ${conv.items.length} ชิ้น${conv.images.length ? ` (รูปฝัง ${conv.images.length})` : ''}`);
      } else {
        const id = nextId();
        const r = await rasterizeSvg(art.parsed, frame, colorMode, false);
        images[id] = r.res;
        artItems = [{ type: 'image', id, matrix: imageMatrix({ x: frame.x0, y: frame.y0, w: frame.w, h: frame.h }), alpha: 1 }];
        report.push(`Layer 1: ส่งออกเป็นภาพ ${r.dpi} dpi เพราะไฟล์ใช้ ${conv.reasons.join(', ')} ที่ PDF เก็บเป็นเวกเตอร์ไม่ได้ (แก้ไฟล์ให้เป็น Outline / สีทึบ ถ้าต้องการเวกเตอร์)`);
      }
    }
  } else {
    const e = await embedRaster(art.file, art.info.type, colorMode, wantDataUrl);
    const id = nextId();
    images[id] = e.res;
    const r = containRect(e.width, e.height, frame.w, frame.h);
    artItems = [{ type: 'image', id, matrix: imageMatrix({ x: frame.x0 + r.x, y: frame.y0 + r.y, w: r.w, h: r.h }), alpha: 1 }];
    report.push(`Layer 1: รูป ${e.width}×${e.height} px — ${e.note}`);
  }

  /* ---- Layer 3 */
  let finishItems = [];
  let finishInner = null; // the SVG export can carry the customer's shapes as they are
  const { mask } = src;
  if (plan.finish?.hasShape) {
    const key = plan.finish.id;
    if (mask.kind === 'svg') {
      const conv = await convertSvg(mask.parsed, frame, { mode: 'shape', spotKey: key, nextId });
      if (conv.ok) {
        finishItems = conv.items;
        report.push(`Layer 3: เวกเตอร์ ${conv.items.length} ชิ้น สีพิเศษ ${plan.finish.spot.name}`);
      } else if (kind === 'svg') {
        finishInner = nestedSvg(mask.parsed, frame, 'm-');
        report.push(`Layer 3: ฝังไฟล์ SVG เดิม (ไฟล์ใช้ ${conv.reasons.join(', ')})`);
      } else {
        let W = Math.round((frame.w / 25.4) * EXPORT.fallbackDpi);
        let H = Math.round((frame.h / 25.4) * EXPORT.fallbackDpi);
        const s = Math.min(1, MASK_TRACE_MAX_SIDE / Math.max(W, H));
        W = Math.round(W * s);
        H = Math.round(H * s);
        const canvas = await renderSvgLayer(mask.parsed, W, H);
        const t = traceSilhouette(pixelsOf(canvas), W, H, frame, key, { alphaOnly: true });
        finishItems = t.items;
        report.push(`Layer 3: ไฟล์ใช้ ${conv.reasons.join(', ')} จึงสกัดเส้นจากภาพ (${t.points} จุด) — ความแม่นยำประมาณ ±${(frame.w / W / 2).toFixed(2)} mm`);
      }
    } else {
      const info = mask.info;
      const decoded = await decodeRaster(mask.file, info);
      try {
        const canvas = newCanvas(decoded.width, decoded.height);
        canvas.getContext('2d').drawImage(decoded.source, 0, 0);
        const t = traceSilhouette(pixelsOf(canvas), canvas.width, canvas.height, frame, key, { invert: mask.invert });
        finishItems = t.items;
        report.push(`Layer 3: สกัดเส้นจาก PNG เป็นเวกเตอร์ ${t.pieces} ชิ้น ${t.points} จุด — ความแม่นยำประมาณ ±${(frame.w / canvas.width / 2).toFixed(2)} mm`);
      } finally {
        decoded.close();
      }
    }
  }

  const job = assembleJob({ plan, artItems, artSvgInner, finishItems, images });
  if (finishInner) job.layers.find((l) => l.name === plan.finish.layerName).svgInner = finishInner;
  report.push(`สีงานพิมพ์: ${colorMode === 'cmyk' ? 'CMYK แบบง่าย' : 'RGB'} · ไดไลน์ ${plan.dieline.exact ? 'เส้นโค้งสมบูรณ์' : 'เส้นหลายจุดจากไฟล์'}`);
  return { plan, job, report };
}

/** @returns {Promise<{blob: Blob, filename: string, report: string[], bytes: number, plan: object, pdf?: object}>} */
export async function exportFile(kind, src, options) {
  const { plan, job, report } = await buildExportJob(src, options, kind);
  if (kind === 'pdf') {
    const bytes = await buildPdf(job);
    const check = await inspectPdf(bytes); // never hand out a file we cannot read back ourselves
    if (!check.ok) throw new Error(`สร้างไฟล์ PDF ไม่สมบูรณ์: ${check.problems[0]}`);
    return { blob: new Blob([bytes], { type: 'application/pdf' }), filename: `${plan.fileBase}.pdf`, report, bytes: bytes.length, plan, pdf: { pages: check.pages.length, layers: check.layers, spots: check.spots } };
  }
  const text = buildSvg(job);
  return { blob: new Blob([text], { type: 'image/svg+xml' }), filename: `${plan.fileBase}.svg`, report, bytes: text.length, plan };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
