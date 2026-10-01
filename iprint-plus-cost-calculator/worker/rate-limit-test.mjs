import assert from 'node:assert/strict';
import { checkRateLimit, rateLimitKeyForIp } from './services/rate-limit.js';

// ---------------------------------------------------------------------------
// Unit tests: checkRateLimit (pure-ish; takes `now` so windows are deterministic)
// ---------------------------------------------------------------------------
function makeKv() {
  const store = new Map();
  return {
    store,
    get: async key => store.has(key) ? store.get(key).value : null,
    put: async (key, value, options) => { store.set(key, { value, options }); }
  };
}

// No KV bound (e.g. the binding was never configured) -> fail open, never blocks orders.
{
  const result = await checkRateLimit({ kv: null, key: 'k', max: 1, windowSeconds: 60 });
  assert.equal(result.allowed, true);
}

// max/windowSeconds not configured (<=0 or NaN) -> fail open.
{
  const kv = makeKv();
  assert.equal((await checkRateLimit({ kv, key: 'k', max: 0, windowSeconds: 60 })).allowed, true);
  assert.equal((await checkRateLimit({ kv, key: 'k', max: 5, windowSeconds: 0 })).allowed, true);
  assert.equal(kv.store.size, 0, 'a disabled limit never touches KV');
}

// Within the limit: allowed, and the KV write carries a sane TTL.
{
  const kv = makeKv();
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  const r1 = await checkRateLimit({ kv, key: 'ip-1', max: 2, windowSeconds: 60, now });
  assert.equal(r1.allowed, true);
  assert.equal(r1.count, 1);
  assert.equal(r1.remaining, 1);
  const r2 = await checkRateLimit({ kv, key: 'ip-1', max: 2, windowSeconds: 60, now: now + 1000 });
  assert.equal(r2.allowed, true);
  assert.equal(r2.count, 2);
  assert.equal(r2.remaining, 0);
  const [[, entry]] = kv.store;
  assert.ok(entry.options.expirationTtl >= 60);
}

// The 3rd request in the same window is blocked, with a retryAfter hint.
{
  const kv = makeKv();
  const now = Date.UTC(2026, 0, 1, 0, 0, 10); // 10s into a 60s window
  await checkRateLimit({ kv, key: 'ip-1', max: 2, windowSeconds: 60, now });
  await checkRateLimit({ kv, key: 'ip-1', max: 2, windowSeconds: 60, now });
  const blocked = await checkRateLimit({ kv, key: 'ip-1', max: 2, windowSeconds: 60, now });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfter, 50, 'window started at :00, we are at :10, 50s left');
}

// A different key (different IP) has its own, independent bucket.
{
  const kv = makeKv();
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  await checkRateLimit({ kv, key: 'ip-1', max: 1, windowSeconds: 60, now });
  const blockedSameIp = await checkRateLimit({ kv, key: 'ip-1', max: 1, windowSeconds: 60, now });
  assert.equal(blockedSameIp.allowed, false);
  const otherIp = await checkRateLimit({ kv, key: 'ip-2', max: 1, windowSeconds: 60, now });
  assert.equal(otherIp.allowed, true);
}

// A new window (time moved past windowSeconds) resets the count.
{
  const kv = makeKv();
  const windowStart = Date.UTC(2026, 0, 1, 0, 0, 0);
  await checkRateLimit({ kv, key: 'ip-1', max: 1, windowSeconds: 60, now: windowStart });
  const blocked = await checkRateLimit({ kv, key: 'ip-1', max: 1, windowSeconds: 60, now: windowStart + 1000 });
  assert.equal(blocked.allowed, false);
  const nextWindow = await checkRateLimit({ kv, key: 'ip-1', max: 1, windowSeconds: 60, now: windowStart + 61000 });
  assert.equal(nextWindow.allowed, true, 'a fresh window is not affected by the previous one');
}

// rateLimitKeyForIp: distinct IPs/routes produce distinct keys; no header falls back to a shared bucket.
{
  const req = ip => new Request('https://w.test/x', { headers: ip ? { 'CF-Connecting-IP': ip } : {} });
  assert.equal(rateLimitKeyForIp('public-orders', req('1.2.3.4')), 'ratelimit:public-orders:1.2.3.4');
  assert.notEqual(rateLimitKeyForIp('public-orders', req('1.2.3.4')), rateLimitKeyForIp('public-orders', req('5.6.7.8')));
  assert.notEqual(rateLimitKeyForIp('public-orders', req('1.2.3.4')), rateLimitKeyForIp('other-route', req('1.2.3.4')));
  assert.equal(rateLimitKeyForIp('public-orders', req()), 'ratelimit:public-orders:unknown');
}

console.log('Rate limit unit tests passed');
