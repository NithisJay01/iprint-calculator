import assert from 'node:assert/strict';
import worker from './index.js';
import { NotionQueueRepository } from './repositories/notion-queue-repository.js';

const originalFetch = globalThis.fetch;

const queueSchema = {
  Name: { type: 'title' }, 'Allocation Key': { type: 'rich_text' }, 'Order Key': { type: 'rich_text' },
  'Quote No': { type: 'rich_text' }, 'Item Key': { type: 'rich_text' }, Customer: { type: 'rich_text' },
  Brief: { type: 'rich_text' }, Specs: { type: 'rich_text' }, 'Production Date': { type: 'date' },
  'Delivery Deadline': { type: 'date' }, 'Allocated Points': { type: 'number' }, 'Total Points': { type: 'number' },
  'Allocation Index': { type: 'number' }, 'Allocation Count': { type: 'number' },
  'Order Ticket': { type: 'relation' }, 'Order Item': { type: 'relation' }, 'Ticket URL': { type: 'url' },
  Status: { type: 'status' }, Priority: { type: 'select' }
};

const rt = value => ({ rich_text: value ? [{ plain_text: value }] : [] });
const compactId = n => n.toString(16).padStart(32, '0');

function allocationPage({ order, title, index, count, orderKey = `order-${order}`, quoteNo = `QT-${order}`, customer = `Customer ${order % 10}`, ticket = `ticket-${order}`, edited }) {
  return {
    id: `alloc-${orderKey || ticket}-${index}`,
    last_edited_time: edited || new Date(Date.UTC(2026, 8, 1) + order * 60000 + index * 1000).toISOString(),
    properties: {
      Name: { title: [{ plain_text: `${quoteNo} • ${title} • ${index}/${count}` }] },
      'Allocation Key': rt(`${orderKey || ticket}:${index}`), 'Order Key': rt(orderKey), 'Quote No': rt(quoteNo),
      'Item Key': rt(`item-${index}`), Customer: rt(customer), Brief: rt(''), Specs: rt(''),
      'Production Date': { date: { start: '2026-09-20' } }, 'Delivery Deadline': { date: { start: '2026-09-30' } },
      'Allocated Points': { number: 2 }, 'Total Points': { number: 6 },
      'Allocation Index': { number: index }, 'Allocation Count': { number: count },
      'Order Ticket': { relation: [{ id: ticket }] }, 'Order Item': { relation: [{ id: `item-${index}` }] },
      'Ticket URL': { url: `https://www.notion.so/Job-${compactId(order)}` },
      Status: { status: { name: 'QUEUED' } }, Priority: { select: { name: 'NORMAL' } }
    }
  };
}

function buildRows() {
  const rows = [];
  for (let order = 0; order < 240; order += 1) {
    const titles = [`Sticker ${order}`, order === 5 ? 'Zebra Special' : `Card ${order}`, `Label ${order}`];
    titles.forEach((title, i) => rows.push(allocationPage({ order, title, index: i + 1, count: 3 })));
  }
  // Legacy allocation: no Order Key, identified only by its ticket relation.
  rows.push(allocationPage({ order: 300, title: 'Legacy job', index: 1, count: 1, orderKey: '', quoteNo: 'QT-OLD', customer: 'Legacy Co', ticket: 'ticket-old', edited: '2026-01-01T00:00:00.000Z' }));
  return rows;
}

const dateOf = row => row.properties['Production Date']?.date?.start || '';
const textOf = property => (property?.rich_text || property?.title || []).map(item => item.plain_text).join('').toLowerCase();

function matches(row, filter) {
  if (!filter) return true;
  if (filter.or) return filter.or.some(condition => matches(row, condition));
  if (filter.and) return filter.and.every(condition => matches(row, condition));
  const property = row.properties[filter.property];
  if (filter.rich_text) {
    if ('contains' in filter.rich_text) return textOf(property).includes(filter.rich_text.contains.toLowerCase());
    if ('equals' in filter.rich_text) return textOf(property) === filter.rich_text.equals.toLowerCase();
  }
  if (filter.title && 'contains' in filter.title) return textOf(property).includes(filter.title.contains.toLowerCase());
  if (filter.url && 'contains' in filter.url) return String(property?.url || '').toLowerCase().includes(filter.url.contains.toLowerCase());
  throw new Error(`Fake Notion does not support filter ${JSON.stringify(filter)}`);
}

// Minimal Notion data source: filtering, sorting and 100-row pagination like the real API.
function createFakeNotion(rows) {
  const state = { queries: [], rowsReturned: 0 };
  const fetcher = async (url, options = {}) => {
    const requestUrl = String(url);
    const method = options.method || 'GET';
    if (requestUrl.endsWith('/data_sources/queue-id') && method === 'GET') return Response.json({ properties: queueSchema });
    if (requestUrl.endsWith('/data_sources/queue-id/query') && method === 'POST') {
      const body = JSON.parse(options.body);
      state.queries.push(body);
      let selected = rows.filter(row => matches(row, body.filter));
      const sort = body.sorts?.[0];
      selected = [...selected].sort((a, b) => sort?.timestamp === 'last_edited_time'
        ? b.last_edited_time.localeCompare(a.last_edited_time)
        : dateOf(a).localeCompare(dateOf(b)));
      const start = Number(body.start_cursor || 0);
      const page = selected.slice(start, start + body.page_size);
      state.rowsReturned += page.length;
      const hasMore = start + body.page_size < selected.length;
      return Response.json({ results: page, has_more: hasMore, next_cursor: hasMore ? String(start + body.page_size) : null });
    }
    throw new Error(`Unexpected Notion request: ${method} ${requestUrl}`);
  };
  return { state, fetcher };
}

const env = {
  NOTION_TOKEN: 'notion-token', WRITE_API_KEY: 'staff-key',
  NOTION_DATA_SOURCE_ID: 'presets-id', NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id',
  NOTION_SERVICES_DATA_SOURCE_ID: 'services-id', NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id',
  NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id', NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id',
  NOTION_CAPACITY_DATA_SOURCE_ID: 'capacity-id', NOTION_PRODUCTION_ALLOCATIONS_DATA_SOURCE_ID: 'queue-id'
};
const headers = { 'X-API-Key': 'staff-key' };
const search = async (fake, query = '', limit) => {
  globalThis.fetch = fake.fetcher;
  fake.state.queries.length = 0;
  fake.state.rowsReturned = 0;
  const suffix = `?query=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ''}`;
  const response = await worker.fetch(new Request(`https://worker.test/staff/orders${suffix}`, { headers }), env);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body.orders;
};

try {
  const fake = createFakeNotion(buildRows());

  globalThis.fetch = fake.fetcher;
  assert.equal((await worker.fetch(new Request('https://worker.test/staff/orders'), env)).status, 401);
  assert.equal(fake.state.queries.length, 0, 'anonymous request must not reach Notion');

  // No query: newest orders first, without reading the 720+ allocations in the queue.
  let orders = await search(fake, '');
  assert.equal(orders.length, 15);
  assert.equal(orders[0].identifier, 'order-239', 'most recently edited order first');
  assert.ok(orders.every(order => order.allocationCount === 3 && order.reservedPoints === 6));
  assert.ok(fake.state.queries.length <= 2, `expected <= 2 queue queries, got ${fake.state.queries.length}`);
  assert.ok(fake.state.rowsReturned <= 200, `read ${fake.state.rowsReturned} rows for a 15-order page`);
  assert.equal(fake.state.queries[0].sorts[0].timestamp, 'last_edited_time');

  // Match on customer (case-insensitive), honouring limit.
  orders = await search(fake, 'customer 3', 5);
  assert.equal(orders.length, 5);
  assert.ok(orders.every(order => order.customer === 'Customer 3'));
  assert.deepEqual(orders.map(order => order.identifier), ['order-233', 'order-223', 'order-213', 'order-203', 'order-193']);

  // Match on a single allocation title: totals still cover the whole order (step 2).
  orders = await search(fake, 'ZEBRA');
  assert.equal(orders.length, 1);
  assert.equal(orders[0].identifier, 'order-5');
  assert.equal(orders[0].allocationCount, 3, 'all allocations of the order are loaded, not only the matching one');
  assert.equal(orders[0].reservedPoints, 6);

  // Match on quote number and on order key.
  orders = await search(fake, 'qt-42');
  assert.deepEqual(orders.map(order => order.identifier), ['order-42']);
  orders = await search(fake, 'order-239');
  assert.deepEqual(orders.map(order => order.identifier), ['order-239']);
  // Substring semantics are unchanged: 'order-17' also matches order-170 ... order-179.
  orders = await search(fake, 'order-17');
  assert.equal(orders.length, 11);
  assert.ok(orders.every(order => order.identifier.startsWith('order-17')));

  // Pasted ticket ID (dashed UUID form) matches through the ticket URL.
  const dashed = compactId(42).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  orders = await search(fake, dashed);
  assert.deepEqual(orders.map(order => order.identifier), ['order-42']);

  // Legacy allocation without an Order Key is still returned (grouped by ticket).
  orders = await search(fake, 'legacy co');
  assert.equal(orders.length, 1);
  assert.equal(orders[0].identifier, 'ticket-old');
  assert.equal(orders[0].quoteNo, 'QT-OLD');

  // No match: a single discovery query, no completion query.
  orders = await search(fake, 'no-such-order-xyz');
  assert.deepEqual(orders, []);
  assert.equal(fake.state.queries.length, 1);

  // Discovery is bounded to 5 pages even when a search keeps matching rows of few orders.
  const bigOrder = Array.from({ length: 650 }, (_, i) => allocationPage({ order: 7, title: `Bulk ${i}`, index: i + 1, count: 650 }));
  const bounded = createFakeNotion(bigOrder);
  const repository = new NotionQueueRepository({ fetcher: bounded.fetcher, headers: {}, dataSourceId: 'queue-id' });
  await repository.searchOrderAllocations({ query: 'bulk', limit: 15 });
  const discovery = bounded.state.queries.filter(body => body.sorts[0].timestamp === 'last_edited_time');
  assert.equal(discovery.length, 5, `discovery must stop at 5 pages, ran ${discovery.length}`);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Staff orders search test passed');
