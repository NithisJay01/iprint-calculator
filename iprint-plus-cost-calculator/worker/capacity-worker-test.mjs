import assert from 'node:assert/strict';
import worker from './index.js';

const originalFetch = globalThis.fetch;
const schema = {
  Name: { type: 'title' },
  Date: { type: 'date' },
  'Daily Capacity': { type: 'number' },
  'Reserved Points': { type: 'number' },
  Closed: { type: 'checkbox' },
  'Cutoff Time': { type: 'rich_text' },
  Note: { type: 'rich_text' },
  Status: { type: 'select' }
};
let current = {
  id: 'capacity-page-1',
  last_edited_time: '2026-09-04T08:00:00.000Z',
  properties: {
    Name: { title: [{ plain_text: '2026-09-05' }] },
    Date: { date: { start: '2026-09-05' } },
    'Daily Capacity': { number: 20 },
    'Reserved Points': { number: 8 },
    Closed: { checkbox: false },
    'Cutoff Time': { rich_text: [{ plain_text: '15:00' }] },
    Note: { rich_text: [] },
    Status: { select: { name: 'OPEN' } }
  }
};

globalThis.fetch = async (url, options = {}) => {
  const requestUrl = String(url);
  const method = options.method || 'GET';

  if (requestUrl.endsWith('/data_sources/capacity-id') && method === 'GET') {
    return Response.json({ properties: schema });
  }
  if (requestUrl.endsWith('/data_sources/capacity-id/query') && method === 'POST') {
    const body = JSON.parse(options.body);
    if (body.filter?.date?.equals) {
      assert.equal(body.filter.date.equals, '2026-09-05');
    } else {
      assert.equal(body.filter.and[0].date.on_or_after, '2026-09-01');
      assert.equal(body.filter.and[1].date.on_or_before, '2026-09-14');
    }
    return Response.json({ results: [current] });
  }
  if (requestUrl.endsWith('/pages/capacity-page-1') && method === 'PATCH') {
    const body = JSON.parse(options.body);
    assert.equal(body.properties['Daily Capacity'].number, 24);
    assert.equal(body.properties['Reserved Points'].number, 6);
    assert.equal(body.properties.Status.select.name, 'OPEN');
    current = {
      id: 'capacity-page-1',
      last_edited_time: '2026-09-04T09:00:00.000Z',
      properties: body.properties
    };
    return Response.json(current);
  }
  throw new Error(`Unexpected Notion request: ${method} ${requestUrl}`);
};

const env = {
  NOTION_TOKEN: 'notion-token',
  WRITE_API_KEY: 'staff-key',
  NOTION_DATA_SOURCE_ID: 'presets-id',
  NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id',
  NOTION_SERVICES_DATA_SOURCE_ID: 'services-id',
  NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id',
  NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id',
  NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id',
  NOTION_CAPACITY_DATA_SOURCE_ID: 'capacity-id'
};
const staffHeaders = { 'X-API-Key': 'staff-key' };

try {
  const unauthorized = await worker.fetch(
    new Request('https://worker.test/staff/capacity?from=2026-09-01&to=2026-09-14'),
    env
  );
  assert.equal(unauthorized.status, 401);

  const listResponse = await worker.fetch(
    new Request('https://worker.test/staff/capacity?from=2026-09-01&to=2026-09-14', { headers: staffHeaders }),
    env
  );
  const listResult = await listResponse.json();
  assert.equal(listResponse.status, 200, JSON.stringify(listResult));
  assert.equal(listResult.days[0].availablePoints, 12);

  const updateResponse = await worker.fetch(
    new Request('https://worker.test/staff/capacity/2026-09-05', {
      method: 'PUT',
      headers: { ...staffHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dailyCapacity: 24,
        reservedPoints: 6,
        cutoffTime: '16:00',
        note: 'เพิ่มกะ',
        expectedUpdatedAt: '2026-09-04T08:00:00.000Z'
      })
    }),
    env
  );
  const updateResult = await updateResponse.json();
  assert.equal(updateResponse.status, 200, JSON.stringify(updateResult));
  assert.equal(updateResult.day.availablePoints, 18);
  assert.equal(updateResult.day.cutoffTime, '16:00');

  const conflictResponse = await worker.fetch(
    new Request('https://worker.test/staff/capacity/2026-09-05', {
      method: 'PUT',
      headers: { ...staffHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dailyCapacity: 20,
        reservedPoints: 0,
        cutoffTime: '15:00',
        expectedUpdatedAt: '2026-09-04T08:00:00.000Z'
      })
    }),
    env
  );
  const conflictResult = await conflictResponse.json();
  assert.equal(conflictResponse.status, 409, JSON.stringify(conflictResult));
  assert.equal(conflictResult.code, 'CAPACITY_WRITE_CONFLICT');
  assert.equal(conflictResult.current.availablePoints, 18);

  console.log('Capacity Worker smoke test passed');
} finally {
  globalThis.fetch = originalFetch;
}
