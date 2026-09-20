import { LOCAL, API_ROOT } from './pricing-client.js';

// Talks to the Worker's public order routes:
//   POST /public/orders        multipart: order (JSON) + turnstileToken
//   GET  /public/orders/:id    status for the customer (no prices, no personal data)
// On localhost the Worker refuses the browser (CORS), so a local preview answers with a clearly marked test order.

export const SUBMIT_TIMEOUT_MS = 60000;

// What the page should do after a failure:
//   retry    the same order can be sent again (same order key, so no duplicate)
//   reprice  prices or products changed: reload the cart and show the new prices
//   redate   the chosen date is no longer possible: pick another date
//   turnstile the security check failed: ask again
//   contact  nothing the customer can fix: contact the shop
export class OrderError extends Error {
  constructor(message, { code = '', status = 0, action = 'retry', details = [] } = {}) {
    super(message);
    this.name = 'OrderError';
    Object.assign(this, { code, status, action, details });
  }
}

const REPRICE = { message: 'ราคาหรือรายการสินค้ามีการเปลี่ยนแปลง ระบบจะคำนวณราคาใหม่ให้ กรุณาตรวจสอบก่อนยืนยันอีกครั้ง', action: 'reprice' };
const REDATE = { message: 'วันที่เลือกเต็มแล้วหรือกำลังผลิตเปลี่ยนไป กรุณาเลือกวันรับงานใหม่', action: 'redate' };
const FAILURES = Object.freeze({
  PUBLIC_ORDER_DISABLED: { message: 'ตอนนี้ยังไม่เปิดรับออร์เดอร์ออนไลน์ กรุณาติดต่อทีมงาน', action: 'contact' },
  TURNSTILE_REQUIRED: { message: 'กรุณาผ่านการตรวจสอบความปลอดภัยก่อนยืนยัน', action: 'turnstile' },
  TURNSTILE_FAILED: { message: 'การตรวจสอบความปลอดภัยไม่ผ่าน กรุณาลองใหม่', action: 'turnstile' },
  TURNSTILE_UNAVAILABLE: { message: 'ระบบตรวจสอบความปลอดภัยไม่พร้อมชั่วคราว กรุณาลองใหม่อีกครั้ง', action: 'turnstile' },
  TURNSTILE_NOT_CONFIGURED: { message: 'ระบบรับออร์เดอร์ออนไลน์ยังตั้งค่าไม่เสร็จ กรุณาติดต่อทีมงาน', action: 'contact' },
  INVALID_ORDER: { message: 'ข้อมูลออร์เดอร์ไม่ถูกต้อง กรุณาตรวจสอบตะกร้าอีกครั้ง หากยังไม่หายให้ติดต่อทีมงาน', action: 'contact' },
  CATALOG_CHANGED: REPRICE,
  PRICING_CHANGED: REPRICE,
  CAPACITY_DEADLINE_UNAVAILABLE: REDATE,
  CAPACITY_PLANNING_FAILED: REDATE,
  CAPACITY_WRITE_CONFLICT: REDATE,
  QUEUE_SCHEDULE_FAILED: REDATE,
  QUEUE_NOT_CONFIGURED: { message: 'ระบบจัดคิวผลิตยังไม่พร้อม กรุณาติดต่อทีมงาน', action: 'contact' }
});

// Turns a Worker error response into an OrderError. Raw upstream messages are never shown to the customer.
export function orderFailure(data = {}, status = 0) {
  const known = FAILURES[String(data.code || '')];
  if (known) return new OrderError(known.message, { code: data.code, status, action: known.action, details: data.errors || data.changes || [] });
  if (status === 409) return new OrderError(REPRICE.message, { code: data.code || 'CONFLICT', status, action: 'reprice' });
  if (status === 400 || status === 413) return new OrderError('ส่งข้อมูลออร์เดอร์ไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง', { code: data.code || 'BAD_REQUEST', status, action: 'contact' });
  return new OrderError('ส่งออร์เดอร์ไม่สำเร็จชั่วคราว ยังไม่มีการสร้างออร์เดอร์ซ้ำ ลองกดยืนยันอีกครั้งได้', { code: data.code || 'UPSTREAM', status, action: 'retry' });
}

export async function submitOrder({ order, turnstileToken = '', fetcher = fetch, local = LOCAL, timeoutMs = SUBMIT_TIMEOUT_MS }) {
  if (local) {
    return { id: `local-${order.orderKey}`, url: null, duplicate: false, testMode: true, itemIds: order.orderItems.map(item => item.id) };
  }
  const form = new FormData();
  form.append('order', JSON.stringify(order));
  form.append('turnstileToken', turnstileToken);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetcher(`${API_ROOT}/public/orders`, { method: 'POST', body: form, signal: controller.signal });
  } catch (error) {
    // Nothing is known about the outcome: the same order key makes a retry safe.
    throw new OrderError(
      error.name === 'AbortError'
        ? 'ระบบใช้เวลานานกว่าปกติ ออร์เดอร์อาจถูกสร้างแล้ว กรุณารอสักครู่แล้วกดยืนยันอีกครั้ง (ระบบจะไม่สร้างซ้ำ)'
        : 'เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วกดยืนยันอีกครั้ง',
      { code: error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', action: 'retry' }
    );
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) throw orderFailure(data, response.status);
  return { id: data.id, url: data.url || null, duplicate: data.duplicate === true, itemIds: data.itemIds || [], testMode: false };
}

// ---- Tracking -------------------------------------------------------------------------------------------------
export const TICKET_ID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export async function fetchTicketStatus(id, { fetcher = fetch, local = LOCAL } = {}) {
  const ticketId = String(id || '').trim();
  if (!TICKET_ID_PATTERN.test(ticketId) && !local) throw new Error('เลขติดตามไม่ถูกต้อง');
  if (local) {
    return { ticket: { id: ticketId, title: 'ออร์เดอร์ทดสอบ', customerStatus: 'ORDER_RECEIVED', paymentStatus: 'WAITING_PAYMENT', createdAt: new Date().toISOString() }, items: [], testMode: true };
  }
  const response = await fetcher(`${API_ROOT}/public/orders/${encodeURIComponent(ticketId)}`, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (response.status === 404 || response.status === 400) throw new Error('ไม่พบออร์เดอร์นี้ กรุณาตรวจสอบเลขติดตาม');
  if (!response.ok || data.success !== true) throw new Error('โหลดสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  return data;
}

const CUSTOMER_STATUS = Object.freeze({
  ORDER_RECEIVED: 'รับออร์เดอร์แล้ว', WAITING_PAYMENT: 'รอชำระเงิน', PREPARING: 'กำลังเตรียมงาน', IN_PRODUCTION: 'กำลังผลิต',
  READY: 'พร้อมรับสินค้า', COMPLETED: 'เสร็จสมบูรณ์', NEEDS_INFO: 'ทีมงานต้องการข้อมูลเพิ่ม', CANCELLED: 'ยกเลิกแล้ว'
});
const PAYMENT_STATUS = Object.freeze({ WAITING_PAYMENT: 'รอชำระเงิน', VERIFYING: 'กำลังตรวจสอบการชำระเงิน', PAID: 'ชำระเงินแล้ว', REFUNDED: 'คืนเงินแล้ว', CANCELLED: 'ยกเลิกแล้ว' });
const ITEM_STATUS = Object.freeze({
  NEW: 'รับงานแล้ว', GRAPHIC_ACCEPTED: 'กราฟิกรับงานแล้ว', FILE_CHECK: 'กำลังตรวจไฟล์', NEEDS_INFO: 'ต้องการข้อมูลเพิ่ม', DESIGNING: 'กำลังจัดทำ',
  PROOF_READY: 'พร้อมให้ตรวจ Proof', REVISION_REQUESTED: 'รอแก้ไข', APPROVED: 'อนุมัติแล้ว', PRODUCTION_QUEUED: 'เข้าคิวผลิต',
  IN_PRODUCTION: 'กำลังผลิต', QC: 'ตรวจคุณภาพ', REWORK: 'ผลิตซ้ำ', READY: 'พร้อมรับสินค้า', DELIVERED: 'ส่งมอบแล้ว', COMPLETED: 'เสร็จสมบูรณ์', CANCELLED: 'ยกเลิกแล้ว'
});
const label = (table, value) => table[String(value || '').toUpperCase()] || String(value || '-');
export const customerStatusLabel = value => label(CUSTOMER_STATUS, value);
export const paymentStatusLabel = value => label(PAYMENT_STATUS, value);
export const itemStatusLabel = value => label(ITEM_STATUS, value);

// ---- Orders placed from this device (no account yet: only a convenience list) -----------------------------------
export const ORDERS_KEY = 'iprint-orders-v1';
const MAX_REMEMBERED = 20;

export function rememberOrder(entry, { storage = globalThis.localStorage } = {}) {
  try {
    const list = JSON.parse(storage.getItem(ORDERS_KEY) || '[]');
    const next = [entry, ...(Array.isArray(list) ? list : []).filter(item => item.id !== entry.id)].slice(0, MAX_REMEMBERED);
    storage.setItem(ORDERS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [entry];
  }
}

export function rememberedOrders({ storage = globalThis.localStorage } = {}) {
  try {
    const list = JSON.parse(storage.getItem(ORDERS_KEY) || '[]');
    return Array.isArray(list) ? list.filter(item => item && typeof item.id === 'string') : [];
  } catch {
    return [];
  }
}
