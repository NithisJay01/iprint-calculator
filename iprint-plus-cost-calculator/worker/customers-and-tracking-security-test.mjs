import assert from 'node:assert/strict';
import worker from './index.js';

const originalFetch = globalThis.fetch;

const TICKETS_DS = '4001a0ce-e8bd-8312-a136-07db4162080f';
const TICKET_ID = '3cc1a0ce-e8bd-8068-acd1-000bcaea0f4a';
const CUSTOMER_PAGE_ID = '3ca1a0ce-e8bd-805d-a279-000b9b7152c1';

const baseEnv = {
  NOTION_TOKEN: 'notion-token',
  WRITE_API_KEY: 'staff-key',
  NOTION_DATA_SOURCE_ID: 'presets-id',
  NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id',
  NOTION_SERVICES_DATA_SOURCE_ID: 'services-id',
  NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id',
  NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id',
  NOTION_TICKETS_DATA_SOURCE_ID: TICKETS_DS,
  NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id'
};

const itemSchema = { properties: { Name: { type: 'title' }, 'Order Ticket': { type: 'relation' } } };
const ticketPage = parent => ({
  id: TICKET_ID,
  parent,
  properties: { Name: { type: 'title', title: [{ plain_text: 'QT-1' }] } }
});
const NOTION_SECRET_TEXT = 'notion-internal-schema-detail';

let calls = [];
const mockNotion = handlers => {
  calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    calls.push(requestUrl);
    for (const [matcher, respond] of handlers) {
      if (matcher(requestUrl, options.method || 'GET')) return respond(requestUrl, options);
    }
    return new Response(JSON.stringify({ message: NOTION_SECRET_TEXT }), { status: 500 });
  };
};
const ok = body => () => Response.json(body);
const endsWith = suffix => url => url.endsWith(suffix);

const trackingHandlers = ({ page, itemsStatus = 200 } = {}) => [
  [endsWith('/v1/data_sources/items-id'), ok(itemSchema)],
  [endsWith(`/v1/pages/${TICKET_ID}`), () => (page instanceof Response ? page : Response.json(page))],
  [endsWith('/v1/data_sources/items-id/query'), () => (
    itemsStatus === 200
      ? Response.json({ results: [] })
      : new Response(JSON.stringify({ message: NOTION_SECRET_TEXT }), { status: itemsStatus })
  )]
];

const getPublic = (id, env = baseEnv) => worker.fetch(new Request(`https://worker.test/public/orders/${id}`), env);
const assertNoUpstreamDetail = async response => {
  const text = await response.text();
  assert.ok(!text.includes(NOTION_SECRET_TEXT), `response leaked upstream detail: ${text}`);
  assert.ok(!('detail' in JSON.parse(text)), 'response must not contain a detail field');
};

try {
  // ---------- GET /customers requires staff auth ----------
  mockNotion([[endsWith('/v1/data_sources/customers-id/query'), ok({
    results: [{
      id: 'c1',
      created_time: '2026-09-01T00:00:00.000Z',
      properties: {
        Name: { title: [{ plain_text: 'Somchai' }] },
        Phone: { phone_number: '0812345678' },
        Email: { email: 'somchai@example.com' },
        'Tax ID': { rich_text: [{ plain_text: '1234567890123' }] },
        Active: { checkbox: true }
      }
    }]
  })]]);

  let response = await worker.fetch(new Request('https://worker.test/customers'), baseEnv);
  assert.equal(response.status, 401);
  assert.ok(!(await response.text()).includes('0812345678'));
  assert.equal(calls.length, 0, 'anonymous request must not reach Notion');

  response = await worker.fetch(
    new Request('https://worker.test/customers', { headers: { 'X-API-Key': 'wrong-key' } }),
    baseEnv
  );
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);

  response = await worker.fetch(
    new Request('https://worker.test/customers', { headers: { 'X-API-Key': 'staff-key' } }),
    baseEnv
  );
  assert.equal(response.status, 200);
  const customers = (await response.json()).customers;
  assert.equal(customers.length, 1);
  assert.equal(customers[0].phone, '0812345678');

  // ---------- ticketId must be a bare Notion UUID ----------
  for (const badId of [
    '..%2Fusers%3Fpage_size%3D100',
    '..%2F..%2Fv1%2Fusers',
    'ticket-page-id',
    `${TICKET_ID}%2F..%2Fusers`,
    `${TICKET_ID}%3Fx%3D1`,
    '%E0%A4%A'
  ]) {
    mockNotion(trackingHandlers({ page: ticketPage({ data_source_id: TICKETS_DS }) }));
    response = await getPublic(badId);
    assert.equal(response.status, 400, `expected 400 for ${badId}`);
    assert.equal(calls.length, 0, `invalid id ${badId} must not reach Notion`);
  }

  mockNotion(trackingHandlers({ page: ticketPage({ data_source_id: TICKETS_DS }) }));
  response = await worker.fetch(new Request('https://worker.test/orders/..%2Fusers'), baseEnv);
  assert.equal(response.status, 401, 'staff route still requires auth first');
  response = await worker.fetch(
    new Request('https://worker.test/orders/..%2Fusers', { headers: { 'X-API-Key': 'staff-key' } }),
    baseEnv
  );
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);

  // ---------- page must belong to the Tickets data source ----------
  mockNotion(trackingHandlers({ page: ticketPage({ type: 'data_source_id', data_source_id: CUSTOMER_PAGE_ID }) }));
  response = await getPublic(TICKET_ID);
  assert.equal(response.status, 404);
  assert.ok(!calls.some(url => url.endsWith('/query')), 'foreign page must not trigger the items query');

  mockNotion(trackingHandlers({ page: ticketPage({ type: 'page_id', page_id: CUSTOMER_PAGE_ID }) }));
  assert.equal((await getPublic(TICKET_ID)).status, 404);

  mockNotion(trackingHandlers({ page: { id: TICKET_ID, properties: {} } }));
  assert.equal((await getPublic(TICKET_ID)).status, 404, 'page without a parent is rejected');

  // Same page, dash-insensitive ID and matching parent -> allowed.
  mockNotion(trackingHandlers({ page: ticketPage({ type: 'data_source_id', data_source_id: TICKETS_DS.replace(/-/g, '').toUpperCase() }) }));
  response = await getPublic(TICKET_ID);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ticket.id, TICKET_ID);

  // Configured ID is a database ID: resolve it and compare with the page's data source.
  const DATABASE_ID = '5001a0ce-e8bd-8312-a136-07db4162080f';
  mockNotion([
    ...trackingHandlers({ page: ticketPage({ type: 'data_source_id', data_source_id: TICKETS_DS, database_id: DATABASE_ID }) }),
    [endsWith(`/v1/data_sources/${DATABASE_ID}`), () => new Response('{}', { status: 404 })],
    [endsWith(`/v1/databases/${DATABASE_ID}`), ok({ data_sources: [{ id: TICKETS_DS }] })],
    [endsWith(`/v1/data_sources/${TICKETS_DS}`), ok({ properties: {} })]
  ]);
  response = await getPublic(TICKET_ID, { ...baseEnv, NOTION_TICKETS_DATA_SOURCE_ID: DATABASE_ID });
  assert.equal(response.status, 200);

  // ---------- public responses never expose upstream Notion detail ----------
  mockNotion(trackingHandlers({ page: new Response(JSON.stringify({ message: NOTION_SECRET_TEXT }), { status: 404 }) }));
  response = await getPublic(TICKET_ID);
  assert.equal(response.status, 404);
  await assertNoUpstreamDetail(response);

  mockNotion(trackingHandlers({ page: new Response(JSON.stringify({ message: NOTION_SECRET_TEXT }), { status: 429 }) }));
  response = await getPublic(TICKET_ID);
  assert.equal(response.status, 502);
  await assertNoUpstreamDetail(response);

  mockNotion(trackingHandlers({ page: ticketPage({ data_source_id: TICKETS_DS }), itemsStatus: 500 }));
  response = await getPublic(TICKET_ID);
  assert.equal(response.status, 502);
  await assertNoUpstreamDetail(response);

  mockNotion([[endsWith('/v1/data_sources/items-id'), () => new Response(JSON.stringify({ message: NOTION_SECRET_TEXT }), { status: 500 })]]);
  response = await getPublic(TICKET_ID);
  assert.equal(response.status, 502);
  await assertNoUpstreamDetail(response);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Customers and tracking security test passed');
