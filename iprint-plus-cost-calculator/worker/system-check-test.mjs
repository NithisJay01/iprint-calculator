import assert from 'node:assert/strict';
import worker from './index.js';

const originalFetch = globalThis.fetch;
const ids = {
  NOTION_DATA_SOURCE_ID: 'presets-id', NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id',
  NOTION_SERVICES_DATA_SOURCE_ID: 'services-id', NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id',
  NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id', NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-id',
  NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id', NOTION_CAPACITY_DATA_SOURCE_ID: 'capacity-id',
  NOTION_PRODUCTION_ALLOCATIONS_DATA_SOURCE_ID: 'queue-id'
};
const base = { Name: { type: 'title' } };
const schemas = {
  'items-id': { ...base, 'Order Ticket': { type: 'relation' }, 'Capacity Points': { type: 'number' }, 'Scheduled Start': { type: 'date' }, 'Estimated Completion': { type: 'date' }, 'Queue Status': { type: 'status' } },
  'capacity-id': { ...base, Date: { type: 'date' }, 'Daily Capacity': { type: 'number' }, 'Reserved Points': { type: 'number' }, Closed: { type: 'checkbox' }, 'Cutoff Time': { type: 'rich_text' } },
  'queue-id': { ...base, 'Allocation Key': { type: 'rich_text' }, 'Order Key': { type: 'rich_text' }, 'Production Date': { type: 'date' }, 'Allocated Points': { type: 'number' }, Status: { type: 'status' } }
};

globalThis.fetch = async (url, options = {}) => {
  assert.equal(options.method, 'GET');
  const id = String(url).match(/\/data_sources\/([^/?]+)/)?.[1];
  if (!id) throw new Error(`Unexpected request ${url}`);
  return Response.json({ properties: schemas[id] || base });
};

const env = { NOTION_TOKEN: 'notion-token', WRITE_API_KEY: 'staff-key', PUBLIC_ORDER_ENABLED: 'false', ...ids };
try {
  const unauthorized = await worker.fetch(new Request('https://worker.test/staff/system-check'), env);
  assert.equal(unauthorized.status, 401);

  const response = await worker.fetch(new Request('https://worker.test/staff/system-check', { headers: { 'X-API-Key': 'staff-key' } }), env);
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.ready, true);
  assert.equal(result.staffOrdering.ready, true);
  assert.equal(result.publicOrdering.ready, false);
  assert.equal(result.sources.queue.schemaValid, true);
  assert.equal(result.sources.capacity.schemaValid, true);
  assert.equal(result.sources.orderItems.schemaValid, true);

  console.log('System check test passed');
} finally {
  globalThis.fetch = originalFetch;
}
