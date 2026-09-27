import { LINE_ADD_URL, LINE_OA_ID } from './print-request.js';

export function inquiryMessage(product, pack) {
  return ['(สอบถาม)', `สินค้า/บริการ: ${product?.name || 'นามบัตร'}`, `เซต: ${pack.name}`,
    pack.description || pack.tagline || '', ...(pack.bullets || []),
    'ต้องการสอบถามรายละเอียด ราคา และเงื่อนไขการผลิต รบกวนทีมงานแนะนำเพิ่มเติม'].filter(Boolean).join('\n');
}
// LINE's oaMessage deep link opens a prepared message in the mobile LINE app, but
// LINE redirects desktop browsers to its generic English page. Use the shop's
// add-friend URL on desktop so every contact button reaches the actual store.
export function inquiryUrl(product, pack, userAgent = typeof navigator === 'undefined' ? 'Android' : navigator.userAgent) {
  const id = String(pack.lineOaId || LINE_OA_ID).trim();
  if (!/^@[A-Za-z0-9._-]+$/.test(id)) return '';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(String(userAgent || ''));
  if (!isMobile) {
    if (id === LINE_OA_ID && /^https:\/\/(?:lin\.ee|line\.me)\//.test(LINE_ADD_URL)) return LINE_ADD_URL;
    return `https://line.me/R/ti/p/${encodeURIComponent(id)}`;
  }
  return `https://line.me/R/oaMessage/${encodeURIComponent(id)}/?${encodeURIComponent(inquiryMessage(product, pack))}`;
}
