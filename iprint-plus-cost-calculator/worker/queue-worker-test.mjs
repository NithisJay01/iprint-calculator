import assert from 'node:assert/strict';
import worker from './index.js';

const originalFetch = globalThis.fetch;
const capacitySchema = {
  Name: { type: 'title' }, Date: { type: 'date' }, 'Daily Capacity': { type: 'number' },
  'Reserved Points': { type: 'number' }, Closed: { type: 'checkbox' },
  'Cutoff Time': { type: 'rich_text' }, Note: { type: 'rich_text' }, Status: { type: 'select' }
};
const queueSchema = {
  Name: { type: 'title' }, 'Allocation Key': { type: 'rich_text' }, 'Order Key': { type: 'rich_text' },
  'Quote No': { type: 'rich_text' }, 'Item Key': { type: 'rich_text' }, Customer: { type: 'rich_text' },
  Brief: { type: 'rich_text' }, Specs: { type: 'rich_text' }, 'Production Date': { type: 'date' },
  'Delivery Deadline': { type: 'date' }, 'Allocated Points': { type: 'number' }, 'Total Points': { type: 'number' },
  'Allocation Index': { type: 'number' }, 'Allocation Count': { type: 'number' },
  'Order Ticket': { type: 'relation' }, 'Order Item': { type: 'relation' }, 'Ticket URL': { type: 'url' },
  Status: { type: 'status' }, Priority: { type: 'select' }
};
const capacityPage = (date, reserved, edited = '2026-09-08T08:00:00.000Z') => ({
  id: `capacity-${date}`, last_edited_time: edited,
  properties: {
    Name: { title: [{ plain_text: date }] }, Date: { date: { start: date } },
    'Daily Capacity': { number: 20 }, 'Reserved Points': { number: reserved }, Closed: { checkbox: false },
    'Cutoff Time': { rich_text: [{ plain_text: '15:00' }] }, Note: { rich_text: [] }, Status: { select: { name: 'OPEN' } }
  }
});
const capacities = new Map([
  ['2026-09-09', capacityPage('2026-09-09', 4)],
  ['2026-09-10', capacityPage('2026-09-10', 0)]
]);
let allocation = {
  id: 'allocation-1', last_edited_time: '2026-09-08T08:00:00.000Z',
  properties: {
    Name: { title: [{ plain_text: 'QT-1 • Sticker • 1/1' }] },
    'Allocation Key': { rich_text: [{ plain_text: 'order-1:item-1:1' }] },
    'Order Key': { rich_text: [{ plain_text: 'order-1' }] }, 'Quote No': { rich_text: [{ plain_text: 'QT-1' }] },
    'Item Key': { rich_text: [{ plain_text: 'item-1' }] }, Customer: { rich_text: [{ plain_text: 'Customer' }] },
    Brief: { rich_text: [] }, Specs: { rich_text: [] }, 'Production Date': { date: { start: '2026-09-09' } },
    'Delivery Deadline': { date: { start: '2026-09-12' } }, 'Allocated Points': { number: 4 }, 'Total Points': { number: 4 },
    'Allocation Index': { number: 1 }, 'Allocation Count': { number: 1 }, 'Order Ticket': { relation: [{ id: 'ticket-1' }] },
    'Order Item': { relation: [{ id: 'item-1' }] }, 'Ticket URL': { url: 'https://notion.test/ticket-1' },
    Status: { status: { name: 'QUEUED' } }, Priority: { select: { name: 'NORMAL' } }
  }
};

globalThis.fetch = async (url, options = {}) => {
  const requestUrl = String(url);
  const method = options.method || 'GET';
  if (requestUrl.endsWith('/data_sources/capacity-id') && method === 'GET') return Response.json({ properties: capacitySchema });
  if (requestUrl.endsWith('/data_sources/queue-id') && method === 'GET') return Response.json({ properties: queueSchema });
  if (requestUrl.endsWith('/data_sources/queue-id/query') && method === 'POST') return Response.json({ results: allocation ? [allocation] : [], has_more: false });
  if (requestUrl.endsWith('/pages/allocation-1') && method === 'GET') return Response.json(allocation);
  if (requestUrl.endsWith('/data_sources/capacity-id/query') && method === 'POST') {
    const body = JSON.parse(options.body);
    const date = body.filter?.date?.equals || body.filter?.date?.on_or_after || body.filter?.and?.[0]?.date?.on_or_after;
    return Response.json({ results: capacities.has(date) ? [capacities.get(date)] : [], has_more: false });
  }
  if (requestUrl.includes('/pages/capacity-') && method === 'PATCH') {
    const body = JSON.parse(options.body);
    const date = body.properties.Date.date.start;
    const next = { id: `capacity-${date}`, last_edited_time: `${date}T10:00:00.000Z`, properties: body.properties };
    capacities.set(date, next);
    return Response.json(next);
  }
  if (requestUrl.endsWith('/pages/allocation-1') && method === 'PATCH') {
    const body = JSON.parse(options.body);
    if (body.archived) { allocation = null; return Response.json({ id: 'allocation-1', archived: true }); }
    allocation = { ...allocation, last_edited_time: '2026-09-08T09:00:00.000Z', properties: body.properties };
    return Response.json(allocation);
  }
  throw new Error(`Unexpected Notion request: ${method} ${requestUrl}`);
};

const env = {
  NOTION_TOKEN: 'notion-token', WRITE_API_KEY: 'staff-key',
  NOTION_DATA_SOURCE_ID: 'presets-id', NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id',
  NOTION_SERVICES_DATA_SOURCE_ID: 'services-id', NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id',
  NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id', NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id',
  NOTION_CAPACITY_DATA_SOURCE_ID: 'capacity-id', NOTION_PRODUCTION_ALLOCATIONS_DATA_SOURCE_ID: 'queue-id'
};
const headers = { 'X-API-Key': 'staff-key', 'Content-Type': 'application/json' };

try {
  const unauthorized = await worker.fetch(new Request('https://worker.test/staff/queue'), env);
  assert.equal(unauthorized.status, 401);

  const list = await worker.fetch(new Request('https://worker.test/staff/queue?from=2026-09-01&to=2026-09-30', { headers }), env);
  const listed = await list.json();
  assert.equal(list.status, 200, JSON.stringify(listed));
  assert.equal(listed.jobs[0].date, '2026-09-09');

  const moved = await worker.fetch(new Request('https://worker.test/staff/queue/allocation-1', {
    method: 'PATCH', headers,
    body: JSON.stringify({ date: '2026-09-10', expectedUpdatedAt: '2026-09-08T08:00:00.000Z' })
  }), env);
  const movedResult = await moved.json();
  assert.equal(moved.status, 200, JSON.stringify(movedResult));
  assert.equal(movedResult.allocation.date, '2026-09-10');
  assert.equal(capacities.get('2026-09-09').properties['Reserved Points'].number, 0);
  assert.equal(capacities.get('2026-09-10').properties['Reserved Points'].number, 4);

  const removed = await worker.fetch(new Request('https://worker.test/staff/queue/allocation-1', { method: 'DELETE', headers }), env);
  assert.equal(removed.status, 200, await removed.text());
  assert.equal(capacities.get('2026-09-10').properties['Reserved Points'].number, 0);
  assert.equal(allocation, null);

  console.log('Queue Worker smoke test passed');
} finally {
  globalThis.fetch = originalFetch;
}
