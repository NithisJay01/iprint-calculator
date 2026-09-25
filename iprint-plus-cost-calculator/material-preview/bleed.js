/**
 * bleed.js — "full sheet + bleed" for artwork that is exactly the trim size (no bleed of its own).
 *
 * The picture is drawn over the trim area, and — for printed artwork — its outermost row / column of pixels is
 * stretched outwards to fill the bleed, the way Auto Bleed extends a background in Illustrator. The design is not
 * enlarged, so nothing at the trim edge is lost, and no white can show after cutting. Finish shapes (Layer 3) are
 * only placed on the trim area, never extended: foil must not run into the bleed.
 */

const newCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

/**
 * Draw `src` (canvas / ImageBitmap) into a W × H canvas at `rect` (px, the trim area) and, with `extend`, fill the
 * margins around it with its stretched edge pixels.
 */
export function placeOnTrim(src, W, H, rect, { extend = true } = {}) {
  const out = newCanvas(W, H);
  const g = out.getContext('2d', { willReadFrequently: true });
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const w = Math.round(rect.w);
  const h = Math.round(rect.h);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, x, y, w, h);
  if (!extend) return out;
  const sw = src.width;
  const sh = src.height;
  const right = out.width - (x + w);
  const bottom = out.height - (y + h);
  g.imageSmoothingEnabled = false; // a 1-px strip: no sampling across its border
  // sides: the edge column / row stretched over the margin
  if (x > 0) g.drawImage(src, 0, 0, 1, sh, 0, y, x, h);
  if (right > 0) g.drawImage(src, sw - 1, 0, 1, sh, x + w, y, right, h);
  if (y > 0) g.drawImage(src, 0, 0, sw, 1, x, 0, w, y);
  if (bottom > 0) g.drawImage(src, 0, sh - 1, sw, 1, x, y + h, w, bottom);
  // corners: the corner pixel
  if (x > 0 && y > 0) g.drawImage(src, 0, 0, 1, 1, 0, 0, x, y);
  if (right > 0 && y > 0) g.drawImage(src, sw - 1, 0, 1, 1, x + w, 0, right, y);
  if (x > 0 && bottom > 0) g.drawImage(src, 0, sh - 1, 1, 1, 0, y + h, x, bottom);
  if (right > 0 && bottom > 0) g.drawImage(src, sw - 1, sh - 1, 1, 1, x + w, y + h, right, bottom);
  return out;
}

/** `src` (iw × ih px, the trim) with `bx` / `by` px of stretched edge added on each side. */
export const extendBleed = (src, iw, ih, bx, by) => placeOnTrim(src, iw + 2 * bx, ih + 2 * by, { x: bx, y: by, w: iw, h: ih });
