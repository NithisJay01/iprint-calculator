import { FIELD_KEYS, STATUS, sanitizeBrief } from '../../shared/brief-model.js';

// Brief Button V1 domain rules. The model proposes a brief; these functions decide how much of it to trust.
// Nothing here talks to LINE, Claude or Notion.

export const DEFAULT_MESSAGE_LIMIT = 40;
export const MAX_MESSAGE_LIMIT = 100;
export const DEFAULT_WINDOW_DAYS = 14;
export const MAX_OWNER_NOTE = 2000;

export function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const THAI_OFFSET_MS = 7 * 60 * 60 * 1000;
export const formatBangkokTime = timestamp =>
  new Date(Number(timestamp) + THAI_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');

// Chat lines the model reads. The owner's own note is labelled so it is never mistaken for the customer.
export function buildChatMessages(lineMessages, ownerNote = '') {
  const messages = lineMessages.map(item => ({
    role: 'customer',
    at: Number(item.sentAt),
    text: String(item.text || '')
  }));
  const note = String(ownerNote || '').trim().slice(0, MAX_OWNER_NOTE);
  if (note) messages.push({ role: 'owner', at: messages.at(-1)?.at ?? Date.now(), text: note });
  return messages;
}

export function formatTranscript(chatMessages) {
  return chatMessages
    .map(message => `[${formatBangkokTime(message.at)}] ${message.role === 'owner' ? 'เจ้าของร้าน' : 'ลูกค้า'}: ${message.text.replace(/\n/g, ' / ')}`)
    .join('\n');
}

// ---------- evidence guards ----------

const normalizeForMatch = text => String(text ?? '')
  .replace(/[​‌‍﻿]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

// "Same as before" wording. V1 has no customer history, so a field that only says this is never confirmed.
const REFERENCE_PATTERNS = [
  /(?:เหมือน|แบบ|ตาม)(?:เดิม|รอบก่อน|ครั้งก่อน|ครั้งที่แล้ว|ที่แล้ว|งานเก่า|งานเดิม|ที่เคยทำ|ที่เคยสั่ง|ล่าสุด)/g,
  /(?:วัสดุ|ขนาด|ไฟล์|กระดาษ|แบบ|สี)เดิม/g,
  /same as (?:before|last time|previous|usual|the last)|as (?:before|usual)|like (?:before|last time)/g
];
const FILLER = /(?:ครับ|ค่ะ|คะ|นะครับ|นะคะ|นะ|จ้า|จ้ะ|ด้วย|เอา|ใช้|เป็น|แบบ|[\s.,!?:;()"'\-–—/])/g;

export function isReferenceOnly(text) {
  const lowered = normalizeForMatch(text);
  if (!lowered) return false;
  let hasReference = false;
  let rest = lowered;
  for (const pattern of REFERENCE_PATTERNS) {
    rest = rest.replace(pattern, () => { hasReference = true; return ' '; });
  }
  if (!hasReference) return false;
  return rest.replace(FILLER, '').length < 2;
}

export const REASONS = Object.freeze({
  noEvidence: 'ไม่พบข้อความอ้างอิงในแชท กรุณาตรวจสอบก่อนยืนยัน',
  reference: 'ลูกค้าอ้างถึงงานเดิม แต่ระบบยังไม่มีข้อมูลงานเดิม'
});

const joinReasons = (...parts) => [...new Set(parts.filter(Boolean))].join(' · ').slice(0, 300);

// Turns the model output into a trustworthy Draft Brief.
//  - status "confirmed" needs a verbatim quote that really is in the chat, otherwise it drops to need_confirmation
//  - a field that only says "same as before" cannot be confirmed
//  - a quote that is not in the chat is discarded rather than shown as if the customer had said it
//  - a field the model called missing carries no value
export function normalizeAiBrief(raw, { chatMessages, customer }) {
  const brief = sanitizeBrief({ customer, note: raw?.note, fields: raw?.fields }, { mode: 'ai' });
  const haystack = normalizeForMatch(chatMessages.map(message => message.text).join('\n'));

  for (const key of FIELD_KEYS) {
    const field = brief.fields[key];
    if (field.status === STATUS.MISSING) continue;

    const evidence = normalizeForMatch(field.evidence);
    const found = evidence.length > 0 && haystack.includes(evidence);
    if (!found) field.evidence = '';

    if (field.status === STATUS.CONFIRMED && !found) {
      field.status = STATUS.NEED_CONFIRMATION;
      field.reason = joinReasons(field.reason, REASONS.noEvidence);
    }
    if (field.status === STATUS.CONFIRMED && (isReferenceOnly(field.evidence) || isReferenceOnly(field.value))) {
      field.status = STATUS.NEED_CONFIRMATION;
      field.reason = joinReasons(field.reason, REASONS.reference);
    }
  }
  return brief;
}
