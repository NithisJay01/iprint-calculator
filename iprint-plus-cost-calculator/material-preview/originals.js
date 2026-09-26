/**
 * originals.js — artwork files too big for a request (over MAX_ARTWORK_BYTES) travel in two parts:
 *   · a small "reference" picture inside the request (the export PDF / SVG the shop reads), and
 *   · the customer's own original, uploaded separately right after the request is saved (worker/routes/originals.js).
 * The preview only ever works from a decoded, size-capped copy, so a big file costs nothing extra to look at.
 */
import { MAX_ARTWORK_BYTES, ORIGINAL_SLOTS } from '../shared/print-request.js';

const SLOT_LAYER = { front: 'art', back: 'backArt' };
const REFERENCE_SIDES = [3000, 2200, 1600]; // long side in px, tried in this order
const REFERENCE_LIMIT = Math.floor(MAX_ARTWORK_BYTES * 0.8); // the export wraps the picture; stay clear of the 10 MB limit

/** The file the customer chose (a PDF layer keeps its PDF here; its `file` is the picture drawn from page 1). */
export const originalOf = (layer) => layer?.original || layer?.file || null;

/** [{ slot, file }] for every side whose original is over the request limit. */
export function largeOriginals(sources, hasBack = Boolean(sources?.backArt)) {
  return ORIGINAL_SLOTS
    .filter((slot) => slot === 'front' || hasBack)
    .map((slot) => ({ slot, file: originalOf(sources?.[SLOT_LAYER[slot]]) }))
    .filter((item) => item.file && item.file.size > MAX_ARTWORK_BYTES);
}

/** The metadata the request announces: what the Worker will accept afterwards. */
export const announceOriginals = (large) => large.map(({ slot, file }) => ({ slot, name: file.name, size: file.size }));

async function shrinkRaster(file, info) {
  const type = info?.type === 'png' ? 'image/png' : 'image/jpeg';
  const long = Math.max(info.width, info.height);
  for (const side of REFERENCE_SIDES) {
    const k = Math.min(1, side / long);
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: Math.max(1, Math.round(info.width * k)), resizeQuality: 'high' });
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
      if (blob && blob.size <= REFERENCE_LIMIT) {
        return { file: new File([blob], file.name, { type }), info: { type: type === 'image/png' ? 'png' : 'jpeg', width: bitmap.width, height: bitmap.height } };
      }
    } finally {
      bitmap.close?.();
    }
  }
  throw new Error('ย่อไฟล์ให้เล็กพอสำหรับไฟล์ตัวอย่างไม่สำเร็จ กรุณาลดขนาดภาพต้นฉบับ');
}

/**
 * The same sources, but a picture whose own file is over the limit is swapped for a smaller copy (its pixel width is kept
 * for the resolution check, which is about the customer's file, not the reference). `shrink` is injectable for tests.
 */
export async function referenceSources(sources, shrink = shrinkRaster) {
  const out = { ...sources };
  for (const key of Object.values(SLOT_LAYER)) {
    const layer = sources?.[key];
    if (layer?.kind === 'raster' && layer.file && layer.file.size > REFERENCE_LIMIT) {
      const small = await shrink(layer.file, layer.info);
      out[key] = { ...layer, file: small.file, info: small.info };
    }
  }
  return out;
}

const upload = (url, file, token, onProgress) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open('PUT', url);
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded, event.total); };
  xhr.onload = () => {
    let body = {};
    try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
    if (xhr.status >= 200 && xhr.status < 300) resolve(body);
    else reject(new Error(body.error || `อัปโหลดไม่สำเร็จ (${xhr.status})`));
  };
  xhr.onerror = () => reject(new Error('อัปโหลดไม่สำเร็จ — การเชื่อมต่อขัดข้อง'));
  xhr.send(file);
});

/**
 * Sends each original, one after another. Files that went through are dropped from `items` (so a retry sends only the rest).
 * `send` is injectable for tests. Progress: onProgress({ slot, name, loaded, total }).
 */
export async function uploadOriginals({ apiRoot, token, items, onProgress, send = upload }) {
  for (const item of [...items]) {
    await send(`${apiRoot}/public/print-requests/originals/${item.slot}`, item.file, token, (loaded, total) => onProgress?.({ slot: item.slot, name: item.file.name, loaded, total }));
    items.splice(items.indexOf(item), 1);
  }
}
