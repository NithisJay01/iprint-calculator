import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from './index.js';

// Authorization matrix for every Worker route.
//   public: reachable without X-API-Key (must be listed here on purpose)
//   staff : requires the shared staff key; anonymous callers must get 401 and never reach Notion
// Adding a route to index.js without adding it here fails the completeness check below.

const UUID = '3cc1a0ce-e8bd-8068-acd1-000bcaea0f4a';
const ROUTES = [
  // ---- public ----
  { access: 'public', method: 'GET', path: '/' },
  { access: 'public', method: 'GET', path: '/pricing-settings' },
  { access: 'public', method: 'GET', path: '/flow-settings' },
  { access: 'public', method: 'GET', path: '/presets' },
  { access: 'public', method: 'GET', path: '/materials' },
  { access: 'public', method: 'GET', path: '/services' },
  { access: 'public', method: 'GET', path: '/public/capacity' },
  { access: 'public', method: 'GET', path: `/public/orders/${UUID}` },
  { access: 'public', method: 'POST', path: '/public/orders' }, // guarded by Turnstile, not by the staff key
  { access: 'public', method: 'POST', path: '/line/webhook' }, // guarded by the LINE signature, not by the staff key
  // ---- staff ----
  { access: 'staff', method: 'GET', path: '/auth/check' },
  { access: 'staff', method: 'PUT', path: '/staff/pricing-settings' },
  { access: 'staff', method: 'GET', path: '/staff/pricing-settings/draft' },
  { access: 'staff', method: 'PUT', path: '/staff/pricing-settings/draft' },
  { access: 'staff', method: 'DELETE', path: '/staff/pricing-settings/draft' },
  { access: 'staff', method: 'PUT', path: '/staff/flow-settings' },
  { access: 'staff', method: 'POST', path: '/presets' },
  { access: 'staff', method: 'DELETE', path: '/presets?id=preset-1' },
  { access: 'staff', method: 'GET', path: '/staff/materials' },
  { access: 'staff', method: 'POST', path: '/staff/materials' },
  { access: 'staff', method: 'GET', path: '/staff/services' },
  { access: 'staff', method: 'POST', path: '/staff/services' },
  { access: 'staff', method: 'PATCH', path: '/staff/materials/item-1' },
  { access: 'staff', method: 'PATCH', path: '/staff/services/item-1' },
  { access: 'staff', method: 'GET', path: '/staff/capacity' },
  { access: 'staff', method: 'PUT', path: '/staff/capacity/2026-09-20' },
  { access: 'staff', method: 'GET', path: '/staff/orders' },
  { access: 'staff', method: 'GET', path: '/staff/queue' },
  { access: 'staff', method: 'PATCH', path: '/staff/queue/allocation-1' },
  { access: 'staff', method: 'DELETE', path: '/staff/queue/allocation-1' },
  { access: 'staff', method: 'POST', path: '/staff/orders/ticket-1/cancel' },
  { access: 'staff', method: 'GET', path: '/staff/system-check' },
  { access: 'staff', method: 'GET', path: '/customers' },
  { access: 'staff', method: 'POST', path: '/customers' },
  { access: 'staff', method: 'POST', path: '/orders' },
  { access: 'staff', method: 'GET', path: `/orders/${UUID}` },
  { access: 'staff', method: 'PATCH', path: '/order-items/item-1/status' },
  { access: 'staff', method: 'POST', path: '/tickets' },
  { access: 'staff', method: 'GET', path: '/staff/line/conversations' },
  { access: 'staff', method: 'POST', path: '/staff/briefs/draft' },
  { access: 'staff', method: 'POST', path: '/staff/briefs/ticket' },
  { access: 'staff', method: 'POST', path: '/quotes' },
  { access: 'staff', method: 'POST', path: '/quotes/quote-1/preview' }
];

const env = {
  NOTION_TOKEN: 'notion-token', WRITE_API_KEY: 'staff-key', PUBLIC_ORDER_ENABLED: 'true',
  NOTION_DATA_SOURCE_ID: 'presets-id', NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id',
  NOTION_SERVICES_DATA_SOURCE_ID: 'services-id', NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id',
  NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id', NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-id',
  NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id', NOTION_CAPACITY_DATA_SOURCE_ID: 'capacity-id',
  NOTION_PRODUCTION_ALLOCATIONS_DATA_SOURCE_ID: 'queue-id'
};

const originalFetch = globalThis.fetch;
let outboundCalls = [];
globalThis.fetch = async url => {
  outboundCalls.push(String(url));
  return new Response(JSON.stringify({ object: 'error', message: 'mock upstream failure' }), { status: 500 });
};

async function call({ method, path }, { key, environment = env } = {}) {
  outboundCalls = [];
  const headers = key === undefined ? {} : { 'X-API-Key': key };
  const init = { method, headers };
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    init.headers = { ...headers, 'Content-Type': 'application/json' };
    init.body = '{}';
  }
  const response = await worker.fetch(new Request(`https://worker.test${path}`, init), environment);
  const text = await response.text();
  let body = {};
  try { body = JSON.parse(text); } catch (error) { /* non-JSON body */ }
  return { status: response.status, body, calls: [...outboundCalls] };
}

const isRouteNotFound = result => result.status === 404 && result.body.error === 'Endpoint not found';
const label = route => `${route.method} ${route.path}`;

try {
  // ---------- 1. staff routes: anonymous / wrong key -> 401 and Notion is never contacted ----------
  const wrongKeys = [undefined, '', 'wrong-key', 'STAFF-KEY', 'staff-ke', 'staff-keyx', 'Bearer staff-key'];
  for (const route of ROUTES.filter(item => item.access === 'staff')) {
    for (const key of wrongKeys) {
      const result = await call(route, { key });
      assert.equal(result.status, 401, `${label(route)} with key ${JSON.stringify(key)} returned ${result.status}, expected 401`);
      assert.equal(result.calls.length, 0, `${label(route)} contacted Notion before authorizing`);
    }
  }

  // ---------- 2. staff routes: the right key passes authorization and reaches a real handler ----------
  for (const route of ROUTES.filter(item => item.access === 'staff')) {
    const result = await call(route, { key: 'staff-key' });
    assert.notEqual(result.status, 401, `${label(route)} rejected the valid staff key`);
    assert.ok(!isRouteNotFound(result), `${label(route)} is not a route the Worker handles; fix the matrix`);
  }

  // ---------- 3. public routes: reachable without a key (no 401) and really exist ----------
  for (const route of ROUTES.filter(item => item.access === 'public')) {
    const result = await call(route);
    assert.notEqual(result.status, 401, `${label(route)} is declared public but demanded a key`);
    assert.ok(!isRouteNotFound(result), `${label(route)} is not a route the Worker handles; fix the matrix`);
  }

  // ---------- 4. method sweep: anything not declared public must not run for an anonymous caller ----------
  const routeKey = ({ method, path }) => `${method} ${path.split('?')[0]}`;
  const declaredPublic = new Set(ROUTES.filter(item => item.access === 'public').map(routeKey));
  const paths = [...new Set(ROUTES.map(item => item.path.split('?')[0]))];
  for (const path of paths) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const route = { method, path };
      if (declaredPublic.has(routeKey(route))) continue;
      const result = await call(route);
      assert.ok(
        result.status === 401 || isRouteNotFound(result),
        `${label(route)} ran for an anonymous caller (status ${result.status}); declare it in the matrix or protect it`
      );
      assert.equal(result.calls.length, 0, `${label(route)} contacted Notion for an anonymous caller`);
    }
  }

  // ---------- 5. fail closed when the staff key is not configured ----------
  for (const badEnv of [{ ...env, WRITE_API_KEY: undefined }, { ...env, WRITE_API_KEY: '' }, { ...env, WRITE_API_KEY: '   ' }]) {
    for (const route of ROUTES.filter(item => item.access === 'staff')) {
      for (const key of ['anything', '', '   ']) {
        const result = await call(route, { key, environment: badEnv });
        assert.equal(result.status, 500, `${label(route)} must fail closed without WRITE_API_KEY, got ${result.status}`);
        assert.equal(result.calls.length, 0);
      }
    }
  }

  // ---------- 6. completeness: every route defined in index.js is covered by the matrix ----------
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const literalPaths = new Set([...source.matchAll(/url\.pathname === ["']([^"']+)["']/g)].map(match => match[1]));
  for (const match of source.matchAll(/\[((?:\s*["']\/[^"']*["']\s*,?)+)\]\.includes\(url\.pathname\)/g)) {
    for (const path of match[1].matchAll(/["'](\/[^"']*)["']/g)) literalPaths.add(path[1]);
  }
  const patterns = [...source.matchAll(/url\.pathname\.match\(\/(\^.*?\$)\/\)/g)].map(match => new RegExp(match[1]));
  assert.ok(literalPaths.size >= 15 && patterns.length >= 8, `route extraction looks broken (${literalPaths.size} literals, ${patterns.length} patterns)`);

  const matrixPaths = ROUTES.map(item => item.path.split('?')[0]);
  for (const path of literalPaths) {
    assert.ok(matrixPaths.includes(path), `route ${path} exists in index.js but is missing from the authorization matrix`);
  }
  for (const pattern of patterns) {
    assert.ok(matrixPaths.some(path => pattern.test(path)), `route pattern ${pattern} exists in index.js but is missing from the authorization matrix`);
  }
  for (const path of matrixPaths) {
    assert.ok(literalPaths.has(path) || patterns.some(pattern => pattern.test(path)), `matrix path ${path} is not a route in index.js (stale entry)`);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Authorization matrix test passed');
