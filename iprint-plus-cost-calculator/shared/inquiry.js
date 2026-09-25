import { LINE_OA_ID } from './print-request.js';

export function inquiryMessage(product, pack) {
  return ['(สอบถาม)', `สินค้า/บริการ: ${product?.name || 'นามบัตร'}`, `เซต: ${pack.name}`,
    pack.description || pack.tagline || '', ...(pack.bullets || []),
    'ต้องการสอบถามรายละเอียด ราคา และเงื่อนไขการผลิต กรุณาแนะนำด้วยครับ/ค่ะ'].filter(Boolean).join('\n');
}
export function inquiryUrl(product, pack) {
  const id = String(pack.lineOaId || LINE_OA_ID).trim();
  if (!/^@[A-Za-z0-9._-]+$/.test(id)) return '';
  return `https://line.me/R/oaMessage/${encodeURIComponent(id)}/?${encodeURIComponent(inquiryMessage(product, pack))}`;
}
