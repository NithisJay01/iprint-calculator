// Pictures are made smaller in the browser before they are uploaded: a phone photo of several MB becomes a
// gallery picture of a few hundred KB (the Worker accepts at most 3 MB), and the photo's metadata (location,
// camera) is dropped because the picture is drawn again on a clean canvas.

export const GALLERY_MAX_SIDE = 1600;

// The size a picture is drawn at so that its longer side is at most `max` (never enlarged).
export function fitWithin(width, height, max = GALLERY_MAX_SIDE) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

const canvasBlob = (canvas, type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality));

// Browser only. Returns a WebP (JPEG where WebP cannot be made) Blob no larger than GALLERY_MAX_SIDE.
export async function resizeImageFile(file, { maxSide = GALLERY_MAX_SIDE, quality = 0.85 } = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('ไฟล์นี้ไม่ใช่รูปภาพ');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (error) {
    throw new Error('เปิดไฟล์ภาพไม่ได้ ลองใช้ไฟล์ JPG, PNG หรือ WebP');
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = (await canvasBlob(canvas, 'image/webp', quality)) || (await canvasBlob(canvas, 'image/jpeg', quality));
  if (!blob || !['image/webp', 'image/jpeg'].includes(blob.type)) throw new Error('ย่อขนาดภาพไม่สำเร็จ');
  return blob;
}
