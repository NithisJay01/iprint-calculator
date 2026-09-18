import assert from 'node:assert/strict';
import worker from './index.js';
import { newProduct } from '../shared/product-pricing.js';

const originalFetch = globalThis.fetch;
const NOTION_SECRET_TEXT = 'notion-internal-detail';

// Minimal Notion data source holding the settings/draft rows of the presets database.
const rows = [];
let failNotion = false;
const schema = { Name: { type: 'title' }, Active: { type: 'checkbox' }, Type: { type: 'select' }, 'Usable Width': { type: 'number' } };
let nextId = 1;
const titleOf = row => (row.properties.Name?.title || []).map(item => item.text?.content || item.plain_text || '').join('');

globalThis.fetch = async (url, options = {}) => {
  const requestUrl = String(url);
  const method = options.method || 'GET';
  if (failNotion) return new Response(JSON.stringify({ message: NOTION_SECRET_TEXT }), { status: 500 });
  if (requestUrl.endsWith('/data_sources/presets-id') && method === 'GET') return Response.json({ properties: schema });
  if (requestUrl.endsWith('/data_sources/presets-id') && method === 'PATCH') {
    Object.assign(schema, JSON.parse(options.body).properties);
    return Response.json({ properties: schema });
  }
  if (requestUrl.endsWith('/data_sources/presets-id/query') && method === 'POST') {
    const filter = JSON.parse(options.body).filter;
    const results = rows.filter(row => !filter?.title?.equals || titleOf(row) === filter.title.equals);
    return Response.json({ results, has_more: false });
  }
  if (requestUrl.endsWith('/v1/pages') && method === 'POST') {
    const body = JSON.parse(options.body);
    const row = { id: `row-${nextId++}`, properties: body.properties };
    rows.push(row);
    return Response.json(row);
  }
  const patch = requestUrl.match(/\/v1\/pages\/(row-\d+)$/);
  if (patch && method === 'PATCH') {
    const row = rows.find(item => item.id === patch[1]);
    Object.assign(row.properties, JSON.parse(options.body).properties);
    return Response.json(row);
  }
  throw new Error(`Unexpected Notion request: ${method} ${requestUrl}`);
};

const env = {
  NOTION_TOKEN: 'notion-token', WRITE_API_KEY: 'staff-key',
  NOTION_DATA_SOURCE_ID: 'presets-id', NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id',
  NOTION_SERVICES_DATA_SOURCE_ID: 'services-id', NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id',
  NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id', NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id'
};
const call = async (method, path, body, key = 'staff-key') => {
  const response = await worker.fetch(new Request(`https://worker.test${path}`, {
    method,
    headers: { ...(key ? { 'X-API-Key': key } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  }), env);
  return { status: response.status, body: await response.json() };
};
const product = (id, name) => ({ ...newProduct(id, name), mode: 'packages', packages: [{ id: 'starter', name: 'Starter', quantity: 100, price: 99, optionIds: [] }] });
const settingsWith = (...products) => ({ version: '', products });

try {
  // No draft yet.
  let result = await call('GET', '/staff/pricing-settings/draft');
  assert.equal(result.status, 200);
  assert.equal(result.body.draft, null);

  // Publish once: this defines the customer-facing version.
  result = await call('PUT', '/staff/pricing-settings', settingsWith(product('business-card', 'นามบัตร')));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const publishedVersion = result.body.settings.version;
  assert.ok(publishedVersion);

  // Saving a draft stores it in its own hidden row and never changes the published settings.
  const draftSettings = settingsWith(product('business-card', 'นามบัตร (แก้ไข)'), product('sticker', 'สติกเกอร์'));
  result = await call('PUT', '/staff/pricing-settings/draft', { baseVersion: publishedVersion, settings: draftSettings });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const firstSavedAt = result.body.draft.savedAt;
  assert.ok(firstSavedAt);
  assert.equal(result.body.draft.baseVersion, publishedVersion);
  const draftRow = rows.find(row => titleOf(row) === '__IPRINT_PRICING_DRAFT__');
  assert.ok(draftRow, 'draft row created');
  assert.equal(draftRow.properties.Active.checkbox, false, 'draft row must stay inactive so /presets hides it');
  assert.equal(rows.length, 2);

  result = await call('GET', '/pricing-settings', undefined, '');
  assert.equal(result.body.settings.version, publishedVersion, 'a draft must not change the published version');
  assert.equal(result.body.settings.products.length, 1);
  assert.equal(result.body.settings.products[0].name, 'นามบัตร');

  result = await call('GET', '/presets', undefined, '');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.presets, [], 'settings and draft rows must not be listed as paper presets');

  // Reading the draft back.
  result = await call('GET', '/staff/pricing-settings/draft');
  assert.equal(result.body.draft.settings.products.length, 2);
  assert.equal(result.body.draft.settings.products[0].name, 'นามบัตร (แก้ไข)');

  // Drafts may be incomplete (published settings are fully validated, drafts are not).
  const incomplete = settingsWith({ id: 'x', name: '', enabled: true, packages: [] });
  result = await call('PUT', '/staff/pricing-settings/draft', { baseVersion: publishedVersion, settings: incomplete, expectedSavedAt: firstSavedAt });
  assert.equal(result.status, 200, 'an unfinished draft can be saved');
  const secondSavedAt = result.body.draft.savedAt;
  assert.equal(rows.length, 2, 'saving again updates the same row');

  // Optimistic concurrency between staff members.
  result = await call('PUT', '/staff/pricing-settings/draft', { baseVersion: publishedVersion, settings: draftSettings, expectedSavedAt: 'stale-timestamp' });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'DRAFT_CONFLICT');
  assert.equal(result.body.current.savedAt, secondSavedAt, 'conflict response carries the newer draft');
  result = await call('PUT', '/staff/pricing-settings/draft', { baseVersion: publishedVersion, settings: draftSettings, expectedSavedAt: '' });
  assert.equal(result.status, 409, 'a client that never loaded the existing draft must not overwrite it silently');
  result = await call('PUT', '/staff/pricing-settings/draft', { baseVersion: publishedVersion, settings: draftSettings, expectedSavedAt: 'stale-timestamp', force: true });
  assert.equal(result.status, 200, 'force overwrites after the user confirms');

  // Bad input.
  result = await call('PUT', '/staff/pricing-settings/draft', '{not json');
  assert.equal(result.status, 400);
  result = await call('PUT', '/staff/pricing-settings/draft', { baseVersion: 'v', settings: { products: 'nope' } });
  assert.equal(result.status, 400);
  result = await call('PUT', '/staff/pricing-settings/draft', { baseVersion: 'v', settings: { products: [{ id: 'big', notes: 'x'.repeat(160000) }] } });
  assert.equal(result.status, 413);
  assert.equal(rows.length, 2, 'rejected drafts write nothing');

  // Discard.
  result = await call('DELETE', '/staff/pricing-settings/draft');
  assert.equal(result.status, 200);
  assert.equal(result.body.discarded, true);
  result = await call('GET', '/staff/pricing-settings/draft');
  assert.equal(result.body.draft, null);
  result = await call('DELETE', '/staff/pricing-settings/draft');
  assert.equal(result.body.discarded, true, 'the row still exists (cleared), so discard reports true');
  result = await call('GET', '/pricing-settings', undefined, '');
  assert.equal(result.body.settings.version, publishedVersion, 'discarding a draft leaves the published settings untouched');

  // Auth is required for every method.
  for (const method of ['GET', 'PUT', 'DELETE']) {
    result = await call(method, '/staff/pricing-settings/draft', method === 'PUT' ? { settings: draftSettings } : undefined, '');
    assert.equal(result.status, 401, `${method} without a key`);
  }

  // Upstream failures do not leak Notion details.
  failNotion = true;
  for (const [method, body] of [['GET', undefined], ['PUT', { baseVersion: 'v', settings: draftSettings }], ['DELETE', undefined]]) {
    result = await call(method, '/staff/pricing-settings/draft', body);
    assert.ok(result.status >= 500, `${method} upstream failure status ${result.status}`);
    assert.ok(!JSON.stringify(result.body).includes(NOTION_SECRET_TEXT), `${method} leaked upstream detail`);
    assert.ok(!('detail' in result.body));
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Pricing draft test passed');
