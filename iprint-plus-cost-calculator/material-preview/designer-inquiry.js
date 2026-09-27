import { LINE_ADD_URL } from '../shared/print-request.js';

export const DESIGNER_INQUIRY_MESSAGE = [
  '(สอบถามบริการออกแบบ)',
  'สินค้า/บริการ: ออกแบบนามบัตร',
  'ฉันยังไม่มี Artwork และต้องการให้ทีมดีไซน์เนอร์ช่วยออกแบบ',
  'กรุณาแนะนำรายละเอียด ราคา และขั้นตอนด้วยครับ/ค่ะ'
].join('\n');

export function designerInquiryUrl(addUrl = LINE_ADD_URL) {
  try {
    const url = new URL(String(addUrl || ''));
    return url.protocol === 'https:' && ['lin.ee', 'line.me'].includes(url.hostname) ? url.href : '';
  } catch {
    return '';
  }
}

export function initDesignerInquiry(root = document) {
  const link = root.getElementById('designerContact');
  if (!link) return;
  const url = designerInquiryUrl();
  if (url) link.href = url;
  else {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    link.textContent = 'ช่องทาง LINE ยังไม่พร้อม';
  }
}
