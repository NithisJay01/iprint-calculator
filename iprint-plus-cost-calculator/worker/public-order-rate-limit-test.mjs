import assert from 'node:assert/strict';
import worker from './index.js';

// A real request past this point would need Turnstile/catalog mocks, but the rate limit check
// runs before any of that (before the body is even parsed), so an unmocked fetch is fine here:
// every request that gets past the rate limiter fails for an unrelated, easy-to-spot reason
// (no Turnstile secret configured), and that's exactly what lets this test isolate the limiter.
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('no Notion/Turnstile call should happen in this test'); };

function makeKv() {
  const store = new Map();
  return { get: async key => store.get(key) ?? null, put: async (key, value) => { store.set(key, value); } };
}

const baseEnv = {
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
  PUBLIC_ORDER_RATE_LIMIT_MAX: '2',
  PUBLIC_ORDER_RATE_LIMIT_WINDOW_SECONDS: '60'
};

const postPublicOrder = (env, ip = '203.0.113.1') => {
  const form = new FormData();
  form.append('order', '{}');
  return worker.fetch(new Request('https://worker.test/public/orders', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip },
    body: form
  }), env);
};

try {
  const env = { ...baseEnv, RATE_LIMIT_KV: makeKv() };

  const first = await postPublicOrder(env);
  const firstBody = await first.json();
  assert.notEqual(firstBody.code, 'RATE_LIMITED', 'request 1/2 is not rate limited');

  const second = await postPublicOrder(env);
  const secondBody = await second.json();
  assert.notEqual(secondBody.code, 'RATE_LIMITED', 'request 2/2 is not rate limited');

  const third = await postPublicOrder(env);
  const thirdBody = await third.json();
  assert.equal(third.status, 429);
  assert.equal(thirdBody.code, 'RATE_LIMITED');
  assert.ok(Number.isFinite(thirdBody.retryAfter));

  // A different IP has its own bucket and is unaffected by the first IP being limited.
  const otherIp = await postPublicOrder(env, '198.51.100.9');
  const otherIpBody = await otherIp.json();
  assert.notEqual(otherIpBody.code, 'RATE_LIMITED', 'a different client IP is not limited by the first one');

  // No RATE_LIMIT_KV bound (e.g. not configured in this environment) -> fails open, never blocks orders.
  const envNoKv = { ...baseEnv };
  for (let i = 0; i < 5; i++) {
    const response = await postPublicOrder(envNoKv);
    const body = await response.json();
    assert.notEqual(body.code, 'RATE_LIMITED', 'without a KV binding the limiter never blocks');
  }

  // Staff orders (/orders, authenticated) are not rate limited by this check.
  const staffForm = new FormData();
  staffForm.append('order', '{}');
  const staffResponse = await worker.fetch(new Request('https://worker.test/orders', {
    method: 'POST',
    headers: { 'X-API-Key': 'staff-key', 'CF-Connecting-IP': '203.0.113.1' },
    body: staffForm
  }), { ...baseEnv, RATE_LIMIT_KV: makeKv() });
  const staffBody = await staffResponse.json();
  assert.notEqual(staffBody.code, 'RATE_LIMITED', 'staff orders are not subject to the public rate limit');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Public order rate limit test passed');
