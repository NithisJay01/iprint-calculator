import assert from 'node:assert/strict';
import { NotionQueueRepository } from './repositories/notion-queue-repository.js';

const schema = {
  Name: { type: 'title' }, 'Allocation Key': { type: 'rich_text' }, 'Order Key': { type: 'rich_text' },
  'Quote No': { type: 'rich_text' }, 'Item Key': { type: 'rich_text' }, Customer: { type: 'rich_text' },
  'Production Date': { type: 'date' }, 'Delivery Deadline': { type: 'date' },
  'Allocated Points': { type: 'number' }, 'Total Points': { type: 'number' },
  'Allocation Index': { type: 'number' }, 'Allocation Count': { type: 'number' },
  'Order Ticket': { type: 'relation' }, 'Order Item': { type: 'relation' }, 'Ticket URL': { type: 'url' },
  Status: { type: 'status' }, Priority: { type: 'select' }
};
const page = {
  id: 'allocation-1', last_edited_time: '2026-09-08T08:00:00.000Z',
  properties: {
    Name: { title: [{ plain_text: 'QT-1 • Sticker • 1/1' }] },
    'Allocation Key': { rich_text: [{ plain_text: 'order-1:item-1:1' }] },
    'Order Key': { rich_text: [{ plain_text: 'order-1' }] }, 'Quote No': { rich_text: [{ plain_text: 'QT-1' }] },
    'Item Key': { rich_text: [{ plain_text: 'item-1' }] }, Customer: { rich_text: [{ plain_text: 'Customer' }] },
    'Production Date': { date: { start: '2026-09-09' } }, 'Delivery Deadline': { date: { start: '2026-09-10' } },
    'Allocated Points': { number: 4 }, 'Total Points': { number: 4 }, 'Allocation Index': { number: 1 }, 'Allocation Count': { number: 1 },
    'Order Ticket': { relation: [{ id: 'ticket-1' }] }, 'Order Item': { relation: [{ id: 'item-page-1' }] },
    'Ticket URL': { url: 'https://notion.test/ticket-1' }, Status: { status: { name: 'QUEUED' } }, Priority: { select: { name: 'NORMAL' } }
  }
};
let stored = null;
let archived = false;
const fetcher = async function (url, options = {}) {
  assert.equal(this, undefined, 'fetcher must not be invoked as a repository method');
  const method = options.method || 'GET';
  if (String(url).endsWith('/data_sources/queue-id') && method === 'GET') return Response.json({ properties: schema });
  if (String(url).endsWith('/data_sources/queue-id/query')) {
    const body = JSON.parse(options.body);
    if (body.filter?.property === 'Allocation Key') return Response.json({ results: stored ? [stored] : [] });
    return Response.json({ results: stored ? [stored] : [] });
  }
  if (String(url).endsWith('/pages/allocation-1') && method === 'GET') return stored ? Response.json(stored) : new Response('', { status: 404 });
  if (String(url).endsWith('/pages') && method === 'POST') {
    const body = JSON.parse(options.body);
    assert.equal(body.parent.data_source_id, 'queue-id');
    assert.equal(body.properties['Allocated Points'].number, 4);
    stored = { ...page, properties: body.properties };
    return Response.json(stored);
  }
  if (String(url).endsWith('/pages/allocation-1') && method === 'PATCH') {
    const body = JSON.parse(options.body);
    if (body.archived) { archived = true; return Response.json({ ...stored, archived: true }); }
    stored = { ...stored, last_edited_time: '2026-09-08T09:00:00.000Z', properties: body.properties };
    return Response.json(stored);
  }
  throw new Error(`Unexpected request ${method} ${url}`);
};

const repository = new NotionQueueRepository({ fetcher, headers: {}, dataSourceId: 'queue-id' });
const created = await repository.create({ allocationKey: 'order-1:item-1:1', orderKey: 'order-1', quoteNo: 'QT-1', itemKey: 'item-1', itemId: 'item-page-1', ticketId: 'ticket-1', title: 'Sticker', customer: 'Customer', date: '2026-09-09', deliveryDeadline: '2026-09-10', points: 4, totalPoints: 4 });
assert.equal(created.id, 'allocation-1');
assert.equal((await repository.findByKey('order-1:item-1:1')).id, 'allocation-1');
assert.equal((await repository.listByTicketId('ticket-1'))[0].ticketId, 'ticket-1');
const updated = await repository.update('allocation-1', { date: '2026-09-10', status: 'IN_PROGRESS' }, page.last_edited_time);
assert.equal(updated.date, '2026-09-10');
assert.equal(updated.status, 'IN_PROGRESS');
await assert.rejects(() => repository.update('allocation-1', { date: '2026-09-11' }, 'stale'), error => error.code === 'QUEUE_WRITE_CONFLICT');
await repository.archive('allocation-1');
assert.equal(archived, true);

console.log('Queue repository test passed');
