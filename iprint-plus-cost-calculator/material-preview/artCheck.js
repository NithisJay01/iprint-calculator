/**
 * artCheck.js — the "check the cut" pop-up shown when the customer picks a file for the front or back, before it is used.
 *
 * It draws the file exactly as it will be printed on the sheet (same placement as the preview and the export: a
 * trim-sized file sits on the trim with its edges stretched into the bleed, anything else fills the frame), then
 *   · darkens everything outside the cut line — that part is trimmed off
 *   · draws the cut line (the real outline: rounded corners, oval, die-cut and its holes) and a 3 mm safe line inside it
 * and says in words what will happen. The customer then uses the file or picks another one.
 */
import { artworkFit, trimFraction, presetOutline } from './shape.js';
import { placeOnTrim } from './bleed.js';

export const SAFE_MM = 3; // keep text and logos this far inside the cut line
const MAX_W = 640;
const MAX_H = 320; // keeps the whole pop-up on a laptop screen

/** Draw the check picture of `layer` on `spec` (real mm) into a canvas. `shape` = the shape params (kind, radius). */
export async function drawArtCheck(layer, spec, shape = {}) {
  const f = spec.frame;
  const k = Math.min(MAX_W / f.w, MAX_H / f.h); // px per mm
  const W = Math.round(f.w * k);
  const H = Math.round(f.h * k);
  const fit = artworkFit(layer.aspect, spec);

  // the file, placed as it will be printed
  let art;
  if (fit === 'trim') {
    const t = trimFraction(spec);
    const r = { x: t.x * W, y: t.y * H, w: t.w * W, h: t.h * H };
    art = placeOnTrim(await layer.render(Math.round(r.w), Math.round(r.h)), W, H, r);
  } else art = await layer.render(W, H);

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const g = out.getContext('2d');
  g.fillStyle = '#ffffff'; // paper (white shows where the file leaves the sheet empty)
  g.fillRect(0, 0, W, H);
  g.drawImage(art, 0, 0, W, H);

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
    g.strokeStyle = "rgba(255, 255, 255, 0.85)";
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
  return { canvas: out, fit };
}

export const EXTEND_BG_ASK = `กรุณาขยาย BG ของคุณออกอย่างน้อยด้านละ ${SAFE_MM} mm`;

/**
 * What will happen to this file, in plain words. `ask` = the file has no bleed of its own, so the customer is asked to
 * extend their background (EXTEND_BG_ASK).
 */
export function artCheckMessage(fit, spec, matchesFrame) {
  const bleed = +spec.bleed.toFixed(1);
  if (spec.kind === 'custom') return { text: 'งานจะถูกตัดตามเส้นไดคัท (เส้นประสีแดง) — ส่วนที่แรเงาจะถูกตัดทิ้ง รวมถึงรูเจาะ', ask: false };
  if (fit === 'trim') {
    return { text: `ไฟล์นี้ขนาดเท่างานตัด (ไม่มี Bleed) — ตอนนี้ระบบยืดขอบภาพออกไปเป็น Bleed ${bleed} mm ให้ชั่วคราว ส่วนที่แรเงาคือส่วนที่ถูกตัดทิ้งหลังพิมพ์`, ask: true };
  }
  if (matchesFrame) return { text: `ไฟล์นี้มี Bleed มาแล้ว — ขอบรอบนอก ${bleed} mm (ส่วนที่แรเงา) จะถูกตัดทิ้งหลังพิมพ์`, ask: false };
  return { text: 'สัดส่วนไฟล์ไม่ตรงกับขนาดบัตร — ภาพถูกวางไว้กลางแผ่นโดยไม่ยืด ส่วนที่แรเงาจะถูกตัดทิ้ง และอาจมีขอบขาวหรือเนื้องานหายตรงขอบ', ask: true };
}
