import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const workerSource = await fs.readFile(new URL('./index.js', import.meta.url), 'utf8');
const workerModule = await import(
  'data:text/javascript;base64,' + Buffer.from(workerSource).toString('base64')
);
const originalFetch = globalThis.fetch;

const itemSchema = {
  properties: {
    Name: { type: 'title' },
    'Order Ticket': { type: 'relation' },
    'Line No': { type: 'number' },
    Status: { type: 'select' },
    'Workflow Phase': { type: 'select' },
    'Proof Status': { type: 'select' },
    'Production Status': { type: 'select' },
    Size: { type: 'rich_text' },
    Quantity: { type: 'number' },
    Unit: { type: 'select' },
    Brief: { type: 'rich_text' },
    'Brief Deadline': { type: 'date' },
    'Delivery Deadline': { type: 'date' },
    'Updated At': { type: 'date' }
  }
};
const ticketSchema = {
  properties: {
    Name: { type: 'title' },
    'สถานะ': { type: 'select' }
  }
};

const richText = value => ({
  type: 'rich_text',
  rich_text: [{ plain_text: value, text: { content: value } }]
});
const title = value => ({
  type: 'title',
  title: [{ plain_text: value, text: { content: value } }]
});
const itemPage = status => ({
  id: 'item-page-id',
  url: 'https://notion.test/item-page-id',
  last_edited_time: '2026-08-30T10:00:00.000Z',
  properties: {
    Name: title('#01 • Sticker PP'),
    'Order Ticket': { type: 'relation', relation: [{ id: 'ticket-page-id' }] },
    'Line No': { type: 'number', number: 1 },
    Status: { type: 'select', select: { name: status } },
    'Workflow Phase': { type: 'select', select: { name: 'GRAPHIC' } },
    Size: richText('10.00 × 15.00 cm'),
    Quantity: { type: 'number', number: 500 },
    Unit: { type: 'select', select: { name: 'ดวง' } },
    Brief: richText('เว้นพื้นที่โลโก้'),
    'Brief Deadline': { type: 'date', date: { start: '2026-09-01' } },
    'Delivery Deadline': { type: 'date', date: { start: '2026-09-03' } }
  }
});
const ticketPage = {
  id: 'ticket-page-id',
  url: 'https://notion.test/ticket-page-id',
  last_edited_time: '2026-08-30T10:00:00.000Z',
  properties: {
    Name: title('QT-TEST • ลูกค้าทดสอบ'),
    'สถานะ': { type: 'select', select: { name: 'NEW' } }
  }
};

let itemStatus = 'NEW';
let itemPatch = null;
let ticketPatch = null;
let auditText = '';

globalThis.fetch = async (url, options = {}) => {
  const requestUrl = String(url);
  const method = options.method || 'GET';

  if (requestUrl.endsWith('/v1/data_sources/items-id') && method === 'GET') {
    return Response.json(itemSchema);
  }
  if (requestUrl.endsWith('/v1/data_sources/tickets-id') && method === 'GET') {
    return Response.json(ticketSchema);
  }
  if (requestUrl.endsWith('/v1/pages/ticket-page-id') && method === 'GET') {
    return Response.json(ticketPage);
  }
  if (requestUrl.endsWith('/v1/pages/item-page-id') && method === 'GET') {
    return Response.json(itemPage(itemStatus));
  }
  if (requestUrl.endsWith('/v1/data_sources/items-id/query') && method === 'POST') {
    const payload = JSON.parse(options.body);
    assert.equal(payload.filter.property, 'Order Ticket');
    assert.equal(payload.filter.relation.contains, 'ticket-page-id');
    return Response.json({ results: [itemPage(itemStatus)] });
  }
  if (requestUrl.endsWith('/v1/pages/item-page-id') && method === 'PATCH') {
    itemPatch = JSON.parse(options.body);
    itemStatus = itemPatch.properties.Status.select.name;
    return Response.json(itemPage(itemStatus));
  }
  if (requestUrl.endsWith('/v1/blocks/item-page-id/children') && method === 'PATCH') {
    const payload = JSON.parse(options.body);
    auditText = payload.children[0].paragraph.rich_text[0].text.content;
    return Response.json({ results: [] });
  }
  if (requestUrl.endsWith('/v1/pages/ticket-page-id') && method === 'PATCH') {
    ticketPatch = JSON.parse(options.body);
    return Response.json({ id: 'ticket-page-id' });
  }

  throw new Error(`Unexpected Notion request: ${method} ${requestUrl}`);
};

const env = {
  NOTION_TOKEN: 'notion-token',
  WRITE_API_KEY: 'test-key',
  NOTION_DATA_SOURCE_ID: 'presets-id',
  NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id',
  NOTION_SERVICES_DATA_SOURCE_ID: 'services-id',
  NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id',
  NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id',
  NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-id',
  NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id'
};

try {
  const readResponse = await workerModule.default.fetch(
    new Request('https://worker.test/orders/ticket-page-id', {
      headers: { 'X-API-Key': 'test-key' }
    }),
    env
  );
  const order = await readResponse.json();

  assert.equal(readResponse.status, 200);
  assert.equal(order.success, true);
  assert.equal(order.ticket.id, 'ticket-page-id');
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].status, 'NEW');
  assert.deepEqual(order.items[0].allowedTransitions, ['GRAPHIC_ACCEPTED']);
  assert.equal(order.items[0].briefDeadline, '2026-09-01');

  const updateResponse = await workerModule.default.fetch(
    new Request('https://worker.test/order-items/item-page-id/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key'
      },
      body: JSON.stringify({ status: 'GRAPHIC_ACCEPTED', note: 'ตรวจรับบรีฟแล้ว' })
    }),
    env
  );
  const updated = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updated.success, true);
  assert.equal(updated.status, 'GRAPHIC_ACCEPTED');
  assert.equal(updated.ticketStatus, 'IN_PROGRESS');
  assert.equal(itemPatch.properties['Workflow Phase'].select.name, 'GRAPHIC');
  assert.ok(auditText.includes('NEW → GRAPHIC_ACCEPTED'));
  assert.ok(auditText.includes('ตรวจรับบรีฟแล้ว'));
  assert.equal(ticketPatch.properties['สถานะ'].select.name, 'IN_PROGRESS');

  const invalidResponse = await workerModule.default.fetch(
    new Request('https://worker.test/order-items/item-page-id/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key'
      },
      body: JSON.stringify({ status: 'READY' })
    }),
    env
  );
  assert.equal(invalidResponse.status, 409);

  console.log('Workflow Worker smoke test passed');
} finally {
  globalThis.fetch = originalFetch;
}
