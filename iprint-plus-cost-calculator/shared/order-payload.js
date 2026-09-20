import { VAT_PERCENT, SHIPPING_FEES, roundMoney } from './cart-totals.js';
import { RUSH_MAX_DAYS, rushMultiplier } from './rush.js';

// Builds the order the Worker's POST /public/orders expects from priced cart entries
// (see shared/cart-products.js). Every entry provides its own order item through `toOrderItem`.
const pad = value => String(value).padStart(2, '0');
const isoDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const PAYMENT_LABELS = Object.freeze({ transfer: 'Thai QR / โอนผ่านธนาคาร', cash: 'เงินสด (ชำระที่หน้าร้าน)' });

// The Worker keeps only the customer name, phone and e-mail of a public order, so delivery details travel in
// the brief text of the first item (staff read it in the ticket).
export function deliveryNote({ customer, shipping, rush = null }) {
  const parts = [];
  if (rush) parts.push(`งานด่วน: รับเร็วขึ้น ${rush.days} วัน (+${Math.round(rush.multiplier * 100)}%)`);
  if (shipping === 'ems') {
    parts.push(`จัดส่ง: EMS (ค่าส่ง ฿${SHIPPING_FEES.ems} ชำระแยก)`);
    parts.push(`ผู้รับ: ${customer.name}`);
    parts.push(`ที่อยู่: ${customer.address}`);
  } else {
    parts.push('รับสินค้าที่หน้าร้าน');
  }
  if (customer.lineId) parts.push(`LINE: ${customer.lineId}`);
  return parts.join(' • ');
}

// `rush` is { days, multiplier } when the chosen date is earlier than the normal completion date (see shared/rush.js);
// the multiplier is the one the Worker offered for that date.
export function buildCartOrder({ entries, customer, deliveryDate, shipping = 'pickup', payment = 'transfer', rush = null, orderKey, quoteNo, now = new Date() }) {
  if (!entries.length) throw new Error('ตะกร้ายังว่างอยู่');
  if (entries.some(entry => entry.problems.length || typeof entry.toOrderItem !== 'function')) throw new Error('มีรายการที่ต้องแก้ไขหรือลบก่อนสั่งซื้อ');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(deliveryDate || ''))) throw new Error('กรุณาเลือกวันรับงาน');
  if (!String(customer?.name || '').trim() || !String(customer?.phone || '').trim()) throw new Error('กรุณากรอกชื่อและเบอร์โทร');
  if (shipping === 'ems' && !String(customer.address || '').trim()) throw new Error('กรุณากรอกที่อยู่จัดส่ง');
  if (!orderKey || !quoteNo) throw new Error('missing order identifiers');
  if (rush && (!Number.isInteger(rush.days) || rush.days < 1 || rush.days > RUSH_MAX_DAYS)) throw new Error('งานด่วนเร็วขึ้นได้ 1-4 วัน');
  const boost = rush ? { days: rush.days, multiplier: Number(rush.multiplier) || rushMultiplier(rush.days) } : null;
  if (boost) rush = boost;

  const note = deliveryNote({ customer, shipping, rush });
  const paymentMethod = PAYMENT_LABELS[payment] || payment;
  const orderItems = entries.map((entry, index) => entry.toOrderItem({
    itemId: `${orderKey}-item-${index + 1}`.slice(0, 100),
    deliveryDate,
    note: index === 0 ? note : '',
    paymentMethod,
    boost,
    now
  }));
  const total = roundMoney(orderItems.reduce((sum, item) => sum + item.price, 0));
  const vat = roundMoney(total * VAT_PERCENT / 100);
  return {
    orderKey,
    quoteNo,
    date: isoDay(now),
    createdAt: now.toISOString(),
    customer: customer.name.trim(),
    recipient: customer.name.trim(),
    phone: customer.phone.trim(),
    email: String(customer.email || '').trim(),
    lineId: String(customer.lineId || '').trim(),
    contact: [customer.phone, customer.email, customer.lineId].map(value => String(value || '').trim()).filter(Boolean).join(' • '),
    address: String(customer.address || '').trim() || '-',
    items: orderItems.map(item => ({ id: item.id, name: item.name, size: item.size, qty: item.quantity, unit: item.unit, price: item.price })),
    orderItems,
    total,
    vat,
    grandTotal: roundMoney(total + vat),
    sheets: orderItems.reduce((sum, item) => sum + (Number(item.sheets) || 0), 0),
    pieceCount: orderItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    size: `${orderItems.length} รายการ`,
    paper: ''
  };
}

// ---- Idempotency: one order key per checkout attempt --------------------------------------------------------
// A retry after a timeout or a double click must send the SAME key, so the Worker finds the ticket it already
// created (duplicate:true) instead of creating a second order. The key changes when the cart or date changes.
const KEY_STORAGE = 'iprint-checkout-v1';

export function checkoutFingerprint(entries, deliveryDate, rushDays = 0) {
  return JSON.stringify([deliveryDate, rushDays, entries.map(entry => [entry.id, entry.price, entry.pricingVersion || ''])]);
}

export function checkoutIdentity(entries, deliveryDate, rushDays = 0, { storage = globalThis.sessionStorage, now = new Date(), random = () => globalThis.crypto.randomUUID() } = {}) {
  const fingerprint = checkoutFingerprint(entries, deliveryDate, rushDays);
  try {
    const saved = JSON.parse(storage.getItem(KEY_STORAGE) || 'null');
    if (saved?.fingerprint === fingerprint && saved.orderKey && saved.quoteNo) return saved;
  } catch { /* fall through and create a new one */ }
  const stamp = random().replaceAll('-', '').slice(0, 10);
  const identity = {
    fingerprint,
    orderKey: `cart-${now.getTime()}-${stamp}`,
    quoteNo: `IP-${isoDay(now).replaceAll('-', '').slice(2)}-${stamp.slice(0, 6).toUpperCase()}`
  };
  try { storage.setItem(KEY_STORAGE, JSON.stringify(identity)); } catch { /* the order can still be sent */ }
  return identity;
}

export function clearCheckoutIdentity({ storage = globalThis.sessionStorage } = {}) {
  try { storage.removeItem(KEY_STORAGE); } catch { /* nothing to clear */ }
}
