import assert from 'node:assert/strict';
import worker from './index.js';
import { verifyPlainItemPrice } from './domain/product-pricing.js';

// ---------------------------------------------------------------------------
// Unit tests: verifyPlainItemPrice (pure function, no network)
// ---------------------------------------------------------------------------
// Uses the same fixed defaults the calculator UI shows every customer:
// PRICING.panelCost = 2.5, PRICING.marginPercent = 30 (business-card/logic.js).
const baseItem = {
  sheets: 20, quantity: 500,
  material: { price: 1.2, unit: 'piece' },
  services: [{ price: 0.5, unit: 'sheet' }]
};
// (sheets*panelCost + materialCost + serviceCost) * (1 + margin/100)
// = (20*2.5 + 1.2*500 + 0.5*20) * 1.3 = (50 + 600 + 10) * 1.3 = 858
const expected = (20 * 2.5 + 1.2 * 500 + 0.5 * 20) * 1.3;
assert.ok(Math.abs(expected - 858) < 1e-9);

assert.doesNotThrow(() => verifyPlainItemPrice({ ...baseItem, basePrice: expected }));
assert.doesNotThrow(() => verifyPlainItemPrice({ ...baseItem, basePrice: expected + 0.005 }), 'small float noise is tolerated');

assert.throws(() => verifyPlainItemPrice({ ...baseItem, basePrice: 1 }), /ราคาคำนวณไม่ตรง/, 'a tampered basePrice is rejected');
assert.throws(() => verifyPlainItemPrice({ ...baseItem, basePrice: undefined }), /ราคาคำนวณไม่ตรง/, 'a missing basePrice is rejected');

// No material/services and no sheets (e.g. a pure job-scoped line) costs nothing.
assert.doesNotThrow(() => verifyPlainItemPrice({ sheets: 0, quantity: 1, material: null, services: [], basePrice: 0 }));

console.log('verifyPlainItemPrice unit tests passed');

// ---------------------------------------------------------------------------
// Integration: POST /public/orders rejects a tampered non-business-card item
// ---------------------------------------------------------------------------
const originalFetch = globalThis.fetch;

const env = {
  NOTION_TOKEN: 'notion-token',
  WRITE_API_KEY: 'staff-key',
  NOTION_DATA_SOURCE_ID: 'presets-id',
  NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id',
  NOTION_SERVICES_DATA_SOURCE_ID: 'services-id',
  NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id',
  NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id',
  NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-id',
  NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id',
  PUBLIC_ORDER_ENABLED: 'true',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  TURNSTILE_EXPECTED_HOSTNAME: 'iprint.tchl.online'
};

// A material that legitimately costs ฿2/piece, active in the catalog, matching the order's snapshot.
const materialMock = () => Response.json({
  id: 'material-1',
  last_edited_time: '2026-09-01T00:00:00.000Z',
  properties: { Price: { number: 2 }, Unit: { select: { name: 'piece' } }, Active: { checkbox: true } }
});

const mockNotion = () => {
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    const method = options.method || 'GET';
    if (requestUrl === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      return Response.json({ success: true, hostname: 'iprint.tchl.online', action: 'create_order' });
    }
    if (requestUrl.endsWith('/v1/pages/material-1') && method === 'GET') return materialMock();
    // Anything past the price check (ticket/queue creation) is out of scope here; fail loudly
    // and distinctly so a test that reaches this point is easy to tell apart from PRICING_CHANGED.
    return new Response(JSON.stringify({ message: 'unmocked-notion-call', url: requestUrl }), { status: 500 });
  };
};

const buildOrder = ({ basePrice, price }) => ({
  orderKey: 'ORD-PLAIN-1', quoteNo: 'QT-PLAIN-1', customer: 'Plain Item Test',
  total: price, vat: 0, grandTotal: price,
  orderItems: [{
    id: 'item-1', name: 'สติกเกอร์ทดสอบ', quantity: 1000, sheets: 50,
    material: { id: 'material-1', name: 'PP Sticker', price: 2, unit: 'piece' }, services: [],
    basePrice, price
    // no productId -> goes through verifyPlainItemPrice, not verifyConfiguredPrice
  }]
});

const postPublicOrder = async order => {
  const form = new FormData();
  form.append('order', JSON.stringify(order));
  form.append('turnstileToken', 'valid-token');
  const response = await worker.fetch(new Request('https://worker.test/public/orders', { method: 'POST', body: form }), env);
  return { response, data: await response.json() };
};

try {
  // (50*2.5 + 2*1000) * 1.3 = 2762.5 is the only price the server will accept for this item.
  const correctBasePrice = (50 * 2.5 + 2 * 1000) * 1.3;

  mockNotion();
  const tampered = await postPublicOrder(buildOrder({ basePrice: 1, price: 1 }));
  assert.equal(tampered.response.status, 409);
  assert.equal(tampered.data.code, 'PRICING_CHANGED');

  mockNotion();
  const missing = await postPublicOrder(buildOrder({ basePrice: undefined, price: 1 }));
  assert.equal(missing.response.status, 400, 'no boost, so price must equal basePrice - a missing basePrice fails order validation first');

  mockNotion();
  const correct = await postPublicOrder(buildOrder({ basePrice: correctBasePrice, price: correctBasePrice }));
  assert.notEqual(correct.data.code, 'PRICING_CHANGED', 'a correctly priced item must not be rejected for pricing');
  assert.equal(correct.response.status, 500, 'it fails later, at the unmocked ticket-creation call, proving it passed the price check');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Plain item pricing integration test passed');
