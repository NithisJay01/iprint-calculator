/**
 * rasterArtwork.js — PNG / JPG / WebP as an artwork layer.
 *
 * Nothing is uploaded: the file is checked from its header (type, pixel count — a small file can claim a gigantic
 * size), decoded in the browser at no more than DECODE_MAX_SIDE px on its long side, and fitted into the artwork
 * frame without stretching. Fitting is always "contain", so every layer lands on the same spot.
 */
import { readImageSize, containRect, shapeFieldFromRgba } from './shape.js';
import { MAX_ORIGINAL_BYTES } from '../shared/print-request.js';

// A picture bigger than a request can carry (10 MB) is fine to look at: it is decoded at a capped size, and the original is
// uploaded apart from the request (originals.js).
export const RASTER_MAX_BYTES = MAX_ORIGINAL_BYTES;
export const RASTER_MAX_PIXELS = 40e6;
export const DECODE_MAX_SIDE = 3000;
const SNIFF_BYTES = 256 * 1024;

export const isSvgFile = (file) => file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '');
export const isRasterFile = (file) => /^image\/(png|jpeg|webp)$/.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name || '');

/**
 * Validates a picture from its header alone, before anything is decoded.
 * @returns {{type: string, width: number, height: number}}
 */
export async function inspectRaster(file) {
  if (file.size > RASTER_MAX_BYTES) throw new Error(`ไฟล์ภาพใหญ่เกิน ${RASTER_MAX_BYTES / 1048576} MB`);
  let info = readImageSize(new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer()));
  if (!info && file.size > SNIFF_BYTES) info = readImageSize(new Uint8Array(await file.arrayBuffer())); // a JPEG with a huge EXIF block
  if (!info) throw new Error('อ่านไฟล์ภาพไม่ได้ — รองรับเฉพาะ PNG, JPG, WebP');
  if (!(info.width > 0 && info.height > 0)) throw new Error('ขนาดภาพในไฟล์ไม่ถูกต้อง');
  if (info.width * info.height > RASTER_MAX_PIXELS) {
    throw new Error(`ภาพใหญ่เกินไป (${info.width}×${info.height} px, สูงสุด ${RASTER_MAX_PIXELS / 1e6} ล้านพิกเซล) — ย่อภาพก่อนอัปโหลด`);
  }
  return info;
}

/**
 * Decodes to something drawImage accepts. Returns { source, width, height, close() }.
 * Only resizeWidth is passed so the aspect ratio (and any EXIF rotation) is always respected.
 */
export async function decodeRaster(file, info) {
  const long = Math.max(info.width, info.height);
  if (typeof createImageBitmap === 'function') {
    try {
      const opts = { imageOrientation: 'from-image' };
      if (long > DECODE_MAX_SIDE) {
        opts.resizeWidth = Math.round(info.width * (DECODE_MAX_SIDE / long));
        opts.resizeQuality = 'high';
      }
      const bmp = await createImageBitmap(file, opts);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() };
    } catch {
      // older browsers: fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('อ่านไฟล์ภาพไม่ได้ — ไฟล์อาจเสียหาย'));
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close() {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const newCanvas = (W, H) => {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c;
};

/** Layer 1: the picture, contained in W × H, on a transparent canvas (white areas print as bare paper). */
export function drawRasterLayer(decoded, W, H) {
  const canvas = newCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const r = containRect(decoded.width, decoded.height, W, H);
  ctx.drawImage(decoded.source, r.x, r.y, r.w, r.h);
  return canvas;
}

/**
 * Layer 3: the picture as a finish shape. The result is white where the finish goes and transparent elsewhere.
 * A picture with transparency uses its alpha; an opaque one uses brightness (dark = shape, `invert` flips it).
 */
export function drawRasterMask(decoded, W, H, { invert = false } = {}) {
  const src = newCanvas(W, H);
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingQuality = 'high';
  const r = containRect(decoded.width, decoded.height, W, H);
  sctx.drawImage(decoded.source, r.x, r.y, r.w, r.h);
  const px = sctx.getImageData(0, 0, W, H).data;

  // only the picture's own area counts: the letterbox around it is "no shape", not "opaque white"
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(W, Math.ceil(r.x + r.w));
  const y1 = Math.min(H, Math.ceil(r.y + r.h));
  const w = x1 - x0;
  const h = y1 - y0;
  const inner = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) inner.set(px.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
  const { field, usedBrightness } = shapeFieldFromRgba(inner, w, h, { invert });

  const out = newCanvas(W, H);
  const octx = out.getContext('2d');
  const image = octx.createImageData(W, H);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = ((y0 + y) * W + x0 + x) * 4;
      image.data[o] = image.data[o + 1] = image.data[o + 2] = 255;
      image.data[o + 3] = Math.round(field[y * w + x] * 255);
    }
  }
  octx.putImageData(image, 0, 0);
  return { canvas: out, usedBrightness };
}
