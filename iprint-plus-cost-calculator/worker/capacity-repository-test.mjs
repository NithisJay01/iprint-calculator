import assert from 'node:assert/strict';
import { NotionCapacityRepository } from './repositories/notion-capacity-repository.js';

const schema = {
  Name: { type: 'title' }, Date: { type: 'date' },
  'Daily Capacity': { type: 'number' }, 'Reserved Points': { type: 'number' },
  Closed: { type: 'checkbox' }, 'Cutoff Time': { type: 'rich_text' },
  Note: { type: 'rich_text' }, Status: { type: 'select' }
};
const page = {
  id: 'capacity-day-1', last_edited_time: '2026-09-04T08:00:00.000Z',
  properties: {
    Name: { title: [{ plain_text: '2026-09-05' }] }, Date: { date: { start: '2026-09-05' } },
    'Daily Capacity': { number: 20 }, 'Reserved Points': { number: 8 },
    Closed: { checkbox: false }, 'Cutoff Time': { rich_text: [{ plain_text: '15:00' }] },
    Note: { rich_text: [] }, Status: { select: { name: 'OPEN' } }
  }
};
let existing = page;

const fetcher = async (url, options = {}) => {
  const method = options.method || 'GET';
  if (String(url).endsWith('/data_sources/capacity-id') && method === 'GET') return Response.json({ properties: schema });
  if (String(url).endsWith('/data_sources/capacity-id/query')) {
    const body = JSON.parse(options.body);
    if (body.filter?.date?.equals) return Response.json({ results: existing ? [existing] : [] });
    assert.equal(body.filter.and[0].date.on_or_after, '2026-09-01');
    assert.equal(body.filter.and[1].date.on_or_before, '2026-09-14');
    return Response.json({ results: existing ? [existing] : [] });
  }
  if (String(url).endsWith('/pages/capacity-day-1') && method === 'PATCH') {
    const body = JSON.parse(options.body);
    assert.equal(body.properties['Daily Capacity'].number, 24);
    assert.equal(body.properties.Status.select.name, 'OPEN');
    return Response.json({ ...page, last_edited_time: '2026-09-04T09:00:00.000Z', properties: body.properties });
  }
  if (String(url).endsWith('/pages') && method === 'POST') {
    const body = JSON.parse(options.body);
    assert.equal(body.parent.data_source_id, 'capacity-id');
    return Response.json({ id: 'capacity-created', last_edited_time: '2026-09-04T10:00:00.000Z', properties: body.properties });
  }
  throw new Error(`Unexpected request ${method} ${url}`);
};

const repository = new NotionCapacityRepository({ fetcher, headers: {}, dataSourceId: 'capacity-id' });
const days = await repository.list({ from: '2026-09-01', to: '2026-09-14' });
assert.equal(days.length, 1);
assert.equal(days[0].availablePoints, 12);

const updated = await repository.upsert('2026-09-05', { dailyCapacity: 24, reservedPoints: 8, closed: false, cutoffTime: '15:30', note: 'เพิ่มกะ' }, page.last_edited_time);
assert.equal(updated.dailyCapacity, 24);
assert.equal(updated.availablePoints, 16);
assert.equal(updated.note, 'เพิ่มกะ');

await assert.rejects(
  () => repository.upsert('2026-09-05', { dailyCapacity: 20, reservedPoints: 0, cutoffTime: '15:00' }, 'wrong-version'),
  error => error.code === 'CAPACITY_WRITE_CONFLICT' && error.status === 409
);

existing = null;
const created = await repository.upsert('2026-09-06', { dailyCapacity: 0, reservedPoints: 0, closed: true, cutoffTime: '15:00', note: 'วันหยุด' });
assert.equal(created.id, 'capacity-created');
assert.equal(created.status, 'CLOSED');

console.log('Capacity repository test passed');
