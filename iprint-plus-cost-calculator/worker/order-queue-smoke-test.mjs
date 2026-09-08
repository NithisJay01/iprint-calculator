import assert from 'node:assert/strict';
import worker from './index.js';

const originalFetch = globalThis.fetch;
const queuePages = [];
const capacityPages = new Map();
let itemPayload = null;

const ticketSchema = { properties: { Name: { type: 'title' }, 'Order Key': { type: 'rich_text' }, 'Presentation/Proof': { type: 'rich_text' } } };
const itemSchema = { properties: {
  Name: { type: 'title' }, 'Order Ticket': { type: 'relation' }, 'Item Key': { type: 'rich_text' },
  'Capacity Points': { type: 'number' }, 'Scheduled Start': { type: 'date' }, 'Estimated Completion': { type: 'date' },
  'Queue Status': { type: 'select' }, Snapshot: { type: 'rich_text' }
} };
const capacitySchema = { properties: {
  Name: { type: 'title' }, Date: { type: 'date' }, 'Daily Capacity': { type: 'number' },
  'Reserved Points': { type: 'number' }, Closed: { type: 'checkbox' }, 'Cutoff Time': { type: 'rich_text' }, Status: { type: 'select' }
} };
const queueSchema = { properties: {
  Name: { type: 'title' }, 'Allocation Key': { type: 'rich_text' }, 'Order Key': { type: 'rich_text' },
  'Quote No': { type: 'rich_text' }, 'Item Key': { type: 'rich_text' }, Customer: { type: 'rich_text' },
  'Production Date': { type: 'date' }, 'Delivery Deadline': { type: 'date' }, 'Allocated Points': { type: 'number' },
  'Total Points': { type: 'number' }, 'Allocation Index': { type: 'number' }, 'Allocation Count': { type: 'number' },
  'Order Ticket': { type: 'relation' }, 'Order Item': { type: 'relation' }, Status: { type: 'status' }, Priority: { type: 'select' }
} };

globalThis.fetch = async (url, options = {}) => {
  const value = String(url);
  const method = options.method || 'GET';
  if (value.endsWith('/data_sources/tickets-id') && method === 'GET') return Response.json(ticketSchema);
  if (value.endsWith('/data_sources/items-id') && method === 'GET') return Response.json(itemSchema);
  if (value.endsWith('/data_sources/capacity-id') && method === 'GET') return Response.json(capacitySchema);
  if (value.endsWith('/data_sources/queue-id') && method === 'GET') return Response.json(queueSchema);
  if (/\/pages\/(material-1|service-1)$/.test(value) && method === 'GET') return Response.json({ id: value.split('/').pop(), properties: { Price: { number: 0 }, Unit: { select: null }, Active: { checkbox: true } } });
  if (value.endsWith('/data_sources/tickets-id/query')) return Response.json({ results: [] });
  if (value.endsWith('/data_sources/items-id/query')) return Response.json({ results: [] });
  if (value.endsWith('/data_sources/capacity-id/query')) {
    const body = JSON.parse(options.body);
    const date = body.filter?.date?.equals;
    return Response.json({ results: date && capacityPages.has(date) ? [capacityPages.get(date)] : [] });
  }
  if (value.endsWith('/data_sources/queue-id/query')) {
    const body = JSON.parse(options.body);
    const key = body.filter?.rich_text?.equals;
    const results = key
      ? queuePages.filter(page => page.properties['Allocation Key'].rich_text[0].text.content === key)
      : queuePages;
    return Response.json({ results });
  }
  if (value === 'https://api.notion.com/v1/pages' && method === 'POST') {
    const body = JSON.parse(options.body);
    if (body.parent.data_source_id === 'tickets-id') return Response.json({ id: 'ticket-1', url: 'https://notion.test/ticket-1', properties: body.properties });
    if (body.parent.data_source_id === 'items-id') { itemPayload = body; return Response.json({ id: 'item-page-1', properties: body.properties }); }
    if (body.parent.data_source_id === 'capacity-id') {
      const date = body.properties.Date.date.start;
      const page = { id: `capacity-${date}`, last_edited_time: `${date}T08:00:00.000Z`, properties: body.properties };
      capacityPages.set(date, page); return Response.json(page);
    }
    if (body.parent.data_source_id === 'queue-id') {
      const page = { id: `allocation-${queuePages.length + 1}`, last_edited_time: '2026-09-08T08:00:00.000Z', properties: body.properties };
      queuePages.push(page); return Response.json(page);
    }
  }
  if (value.endsWith('/blocks/ticket-1/children') && method === 'PATCH') return Response.json({ results: [] });
  if (value.endsWith('/pages/ticket-1') && method === 'PATCH') return Response.json({ id: 'ticket-1' });
  throw new Error(`Unexpected request ${method} ${value}`);
};

try {
  const order = {
    orderKey: 'order-queue-1', quoteNo: 'QT-QUEUE-1', customer: 'Queue Customer', phone: '0800000000', total: 100, vat: 7, grandTotal: 107,
    orderItems: [{ id: 'item-1', name: 'Sticker', quantity: 500, sheets: 20, price: 100, capacityPoints: 4, material: { id: 'material-1', name: 'PP' }, services: [{ id: 'service-1', name: 'Cut' }], deliveryDeadline: '2099-12-31' }]
  };
  const form = new FormData(); form.append('order', JSON.stringify(order));
  const response = await worker.fetch(new Request('https://worker.test/orders', { method: 'POST', headers: { 'X-API-Key': 'key' }, body: form }), {
    NOTION_TOKEN: 'token', WRITE_API_KEY: 'key', NOTION_DATA_SOURCE_ID: 'presets-id', NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id',
    NOTION_SERVICES_DATA_SOURCE_ID: 'services-id', NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id', NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id',
    NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-id', NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id', NOTION_CAPACITY_DATA_SOURCE_ID: 'capacity-id',
    NOTION_PRODUCTION_ALLOCATIONS_DATA_SOURCE_ID: 'queue-id', CAPACITY_DEFAULT_DAILY: '20'
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.queue.status, 'SCHEDULED');
  assert.equal(result.queue.totalPoints, 4);
  assert.equal(result.queue.allocations.length, 1);
  assert.equal(queuePages.length, 1);
  assert.equal([...capacityPages.values()][0].properties['Reserved Points'].number, 4);
  assert.equal(itemPayload.properties['Capacity Points'].number, 4);
  assert.equal(itemPayload.properties['Queue Status'].select.name, 'QUEUED');
  assert.ok(itemPayload.properties['Scheduled Start'].date.start);
  console.log('Order queue smoke test passed');
} finally {
  globalThis.fetch = originalFetch;
}
