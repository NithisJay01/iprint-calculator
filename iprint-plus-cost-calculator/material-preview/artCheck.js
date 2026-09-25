/**
 * artCheck.js — the "check the cut" pop-up shown when the customer picks a file for the front or back, before it is used.
 *
 * It draws the file exactly as it will be printed on the sheet (placeArtwork: the same placement the preview and the
 * export use), then
 *   · darkens everything outside the cut line — that part is trimmed off
 *   · draws the cut line (the real outline: rounded corners, oval, die-cut and its holes) and a 3 mm safe line inside it
 * and says in words what will happen. The customer can change the size / position here (placement) before using the file.
 */
import { artworkFit, presetOutline, placeArtwork, coversFrame } from './shape.js';
import { placeOnTrim } from './bleed.js';

export const SAFE_MM = 3; // keep text and logos this far inside the cut line
export const EXTEND_BG_ASK = `กรุณาขยาย BG ของคุณออกอย่างน้อยด้านละ ${SAFE_MM} mm`;
const MAX_W = 640;
const MAX_H = 320; // keeps the whole pop-up on a laptop screen
const SOURCE_MAX = 1400; // px on the long side of the file's one-time render (sharp at up to ~200 % zoom)

/** Render the file once, at its own aspect; every redraw (zoom / drag) then only scales this picture. */
export async function renderArtCheckSource(layer) {
  const a = layer.aspect || 1;
  const w = a >= 1 ? SOURCE_MAX : Math.round(SOURCE_MAX * a);
  const h = a >= 1 ? Math.round(SOURCE_MAX / a) : SOURCE_MAX;
  return layer.render(Math.max(1, w), Math.max(1, h));
}

/** The check-picture size for a frame: px per mm and the canvas size. */
export function artCheckSize(spec) {
  const k = Math.min(MAX_W / spec.frame.w, MAX_H / spec.frame.h);
  return { k, W: Math.round(spec.frame.w * k), H: Math.round(spec.frame.h * k) };
}

/**
 * Draw the check picture into `out` (a canvas, resized here). `src` from renderArtCheckSource, `shape` = shape params
 * (kind, radius), `placement` = null (automatic) or the customer's choice. Returns the placed rect (frame fractions).
 */
export function drawArtCheck(out, src, aspect, spec, shape = {}, placement = null) {
  const f = spec.frame;
  const { k, W, H } = artCheckSize(spec);
  out.width = W;
  out.height = H;
  const g = out.getContext('2d');
  g.fillStyle = '#ffffff'; // paper (white shows where the file leaves the sheet empty)
  g.fillRect(0, 0, W, H);

  // the file, placed as it will be printed
  const { rect, extend } = placeArtwork(aspect, spec, placement);
  g.drawImage(placeOnTrim(src, W, H, { x: rect.x * W, y: rect.y * H, w: rect.w * W, h: rect.h * H }, { extend }), 0, 0);

  // mm (y up, card centred) → canvas px
  const left = f.cx - f.w / 2;
  const top = f.cy + f.h / 2;
  const trace = (rings) => {
    for (const ring of rings) {
      ring.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, (p.x - left) * k, (top - p.y) * k));
      g.closePath();
    }
  };

  // everything outside the cut line is trimmed off (the sheet minus the outline; die-cut holes are cut off too)
  g.beginPath();
  g.rect(0, 0, W, H);
  trace(spec.rings);
  g.fillStyle = 'rgba(20, 22, 28, 0.55)';
  g.fill('evenodd');

  // lines get a thin white halo underneath, so they stay visible on any artwork colour
  const halo = (width) => {
    g.setLineDash([]);
    g.lineWidth = width + 2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.stroke();
  };

  // cut line
  g.beginPath();
  trace(spec.rings);
  halo(2);
  g.setLineDash([8, 5]);
  g.lineWidth = 2;
  g.strokeStyle = '#e5322d';
  g.stroke();

  // safe line: SAFE_MM inside the cut (preset shapes only; a die-cut outline has no simple inset)
  const safeW = spec.bounds.w - 2 * SAFE_MM;
  const safeH = spec.bounds.h - 2 * SAFE_MM;
  if (spec.kind !== 'custom' && safeW > 0 && safeH > 0) {
    const radius = spec.kind === 'rounded' ? Math.max(0, (Number(shape.radius) || 0) - SAFE_MM) : 0;
    g.beginPath();
    trace(presetOutline(spec.kind, safeW, safeH, radius)); // presetOutline returns a list of rings
    halo(1.5);
    g.setLineDash([4, 4]);
    g.lineWidth = 1.5;
    g.strokeStyle = '#1f7ae0';
    g.stroke();
  }
  g.setLineDash([]);
  return { rect, k };
}

/**
 * What will happen to this file, in plain words. `ask` = paper would show / the file has no bleed of its own, so the
 * customer is asked to extend their background (EXTEND_BG_ASK).
 */
export function artCheckMessage(aspect, spec, placement, rect) {
  const bleed = +spec.bleed.toFixed(1);
  const covers = coversFrame(rect);
  if (spec.kind === 'custom') return { text: 'งานจะถูกตัดตามเส้นไดคัท (เส้นประสีแดง) — ส่วนที่แรเงาจะถูกตัดทิ้ง รวมถึงรูเจาะ', ask: !covers };
  if (placement) {
    return covers
      ? { text: 'ภาพเต็มแผ่นแล้ว — ส่วนที่แรเงาจะถูกตัดทิ้ง ตรวจว่าข้อความและโลโก้อยู่ด้านในเส้นประสีฟ้า', ask: false }
      : { text: 'ยังมีพื้นที่ว่างบนแผ่น จะเป็นขอบขาวหลังตัด — ขยายภาพ เลื่อนภาพ หรือเลือก "เต็มแผ่น"', ask: true };
  }
  if (artworkFit(aspect, spec) === 'trim') {
    return { text: `ไฟล์นี้ขนาดเท่างานตัด (ไม่มี Bleed) — ตอนนี้ระบบยืดขอบภาพออกไปเป็น Bleed ${bleed} mm ให้ชั่วคราว ส่วนที่แรเงาคือส่วนที่ถูกตัดทิ้งหลังพิมพ์`, ask: true };
  }
  if (covers) return { text: `ไฟล์นี้มี Bleed มาแล้ว — ขอบรอบนอก ${bleed} mm (ส่วนที่แรเงา) จะถูกตัดทิ้งหลังพิมพ์`, ask: false };
  return { text: 'สัดส่วนไฟล์ไม่ตรงกับขนาดบัตร — ภาพถูกวางไว้กลางแผ่นโดยไม่ยืด ส่วนที่แรเงาจะถูกตัดทิ้ง และอาจมีขอบขาว ปรับขนาดภาพด้านบนได้', ask: true };
}
