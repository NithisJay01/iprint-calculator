import { paperMaterials, coatings, finishes, SHAPE_KINDS } from '../material-preview/materials.js';

export const LINE_OA_ID = ''; // Set the verified LINE OA basic ID (including @) when the shop supplies it.
export const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 4 * MAX_ARTWORK_BYTES + 65536;
export function artworkFilename(value, kind, side = 'front') {
  const safe = text => String(text || '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, '-').replace(/[. ]+$/g, '').slice(0, 70) || 'Untitled';
  const cm = mm => Number((mm / 10).toFixed(3));
  const s = value.spec;
  return `(${safe(value.name)})${safe(value.jobName || 'Business-Card')}-(${cm(s.width)}x${cm(s.height)}cm)${safe(value.materialName || paperMaterials[s.paper]?.label)}-(${value.quantity}piece)-${side === 'back' ? 'back' : side === 'dieline' ? 'dieline' : 'front'}.${kind === 'svg' ? 'svg' : 'pdf'}`;
}
export function validatePrintRequest(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return ['ข้อมูลคำขอไม่ถูกต้อง'];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.key || '')) errors.push('รหัสคำขอไม่ถูกต้อง');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120) errors.push('กรุณากรอกชื่อไม่เกิน 120 ตัวอักษร');
  if (typeof value.phone !== 'string' || !/^[+\d ()-]{6,30}$/.test(value.phone || '')) errors.push('กรุณากรอกเบอร์โทรให้ถูกต้อง');
  if (typeof value.lineId !== 'string' || value.lineId.length > 100) errors.push('LINE ID ยาวเกินไป');
  if (!Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > 100000) errors.push('จำนวนต้องอยู่ระหว่าง 1–100,000 ใบ');
  if (value.version !== undefined && value.version !== 2) errors.push('รุ่นคำขอไม่ถูกต้อง');
  if (value.version === 2) {
    for (const key of ['jobName', 'materialName']) if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 120) errors.push('กรุณากรอกชื่องานและวัสดุไม่เกิน 120 ตัวอักษร');
    if (typeof value.hasBack !== 'boolean') errors.push('ข้อมูลด้านหลังไม่ถูกต้อง');
  }
  const s = value.spec || {};
  if (!Object.hasOwn(paperMaterials, s.paper) || !Object.hasOwn(coatings, s.coating) || !Object.hasOwn(finishes, s.finish)) errors.push('วัสดุหรือเทคนิคไม่ถูกต้อง');
  if (!SHAPE_KINDS.some(shape => shape.id === s.kind)) errors.push('รูปทรงไม่ถูกต้อง');
  for (const key of ['width', 'height']) if (!Number.isFinite(s[key]) || s[key] < 20 || s[key] > 150) errors.push('ขนาดต้องอยู่ระหว่าง 20–150 mm');
  if (!Number.isFinite(s.bleed) || s.bleed < 0 || s.bleed > 5) errors.push('Bleed ไม่ถูกต้อง');
  if (!Number.isFinite(s.radius) || s.radius < 0 || s.radius > 75) errors.push('รัศมีมุมไม่ถูกต้อง');
  return errors;
}
export const REQUEST_SUMMARY_NOTE = 'รอทีมงานยืนยันวัสดุ ราคา และวันผลิตก่อนเริ่มงาน';
// The request as separate facts, one per line ("label: value"): the bullets of the request pop-up.
// (requestSummary below is the text the Worker writes into the Notion brief and sends to LINE: it is not changed.)
export function requestSummaryItems(value) {
  const s = value.spec;
  const kind = SHAPE_KINDS.find(shape => shape.id === s.kind)?.label || s.kind;
  return [
    `งาน: ${value.jobName || 'นามบัตร'}`,
    `จำนวน: ${value.quantity.toLocaleString('th-TH')} ใบ`,
    `การพิมพ์: ${value.hasBack ? 'หน้า–หลัง' : 'ด้านหน้า'}`,
    `ขนาด: ${s.width} × ${s.height} mm`,
    `รูปทรง: ${kind}`,
    ...(s.kind === 'rounded' ? [`มุมโค้ง: ${s.radius} mm`] : []),
    `Bleed: ${s.bleed} mm`,
    `วัสดุ: ${value.materialName || paperMaterials[s.paper]?.label}`,
    `เคลือบ: ${coatings[s.coating]?.label}`,
    `เทคนิคด้านหน้า: ${finishes[s.finish]?.label}`,
    ...(value.hasBack ? ['ด้านหลัง: พิมพ์สี ไม่มีเทคนิคพิเศษ'] : [])
  ];
}
export function requestSummary(value) {
  const s = value.spec;
  return [
    `งาน ${value.jobName || 'นามบัตร'} · ${value.quantity.toLocaleString('th-TH')} ใบ · ${value.hasBack ? 'พิมพ์หน้า–หลัง' : 'พิมพ์ด้านหน้า'}`,
    `${s.width} × ${s.height} mm · ${SHAPE_KINDS.find(shape => shape.id === s.kind)?.label || s.kind} · Bleed ${s.bleed} mm${s.kind === 'rounded' ? ` · มุม ${s.radius} mm` : ''}`,
    `วัสดุ ${value.materialName || paperMaterials[s.paper]?.label} · เคลือบ ${coatings[s.coating]?.label} · เทคนิคด้านหน้า ${finishes[s.finish]?.label}${value.hasBack ? ' · ด้านหลังพิมพ์สี ไม่มีเทคนิคพิเศษ' : ''}`,
    'รอทีมงานยืนยันวัสดุ ราคา และวันผลิตก่อนเริ่มงาน'
  ].join('\n');
}
export function lineRequestUrl(ticketId, summary, oaId = LINE_OA_ID) {
  if (!/^@[A-Za-z0-9._-]+$/.test(oaId)) return '';
  return `https://line.me/R/oaMessage/${encodeURIComponent(oaId)}/?${encodeURIComponent(`สอบถามงานนามบัตร รหัส ${ticketId}\n${summary}`)}`;
}
