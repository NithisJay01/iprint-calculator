import assert from 'node:assert/strict';
import { cancelOrderProduction } from './services/order-cancellation.js';

const allocations = [
  { id: 'a1', ticketId: 'ticket-1', date: '2026-09-09', points: 2, status: 'QUEUED', updatedAt: 'v1' },
  { id: 'a2', ticketId: 'ticket-1', date: '2026-09-09', points: 1.5, status: 'PAUSED', updatedAt: 'v1' },
  { id: 'a3', ticketId: 'ticket-1', date: '2026-09-10', points: 4, status: 'COMPLETED', updatedAt: 'v1' }
];
const days = new Map([
  ['2026-09-09', { date: '2026-09-09', dailyCapacity: 20, reservedPoints: 6, updatedAt: 'd1' }]
]);
const queueRepository = {
  async listByTicketId(id) { return allocations.filter(item => item.ticketId === id); },
  async listByOrderKey(key) { return allocations.filter(item => item.orderKey === key); },
  async getById(id) { return allocations.find(item => item.id === id) || null; },
  async update(id, patch) {
    const item = allocations.find(entry => entry.id === id);
    Object.assign(item, patch, { updatedAt: `${item.updatedAt}x` });
    return item;
  }
};
const capacityRepository = {
  async list({ from }) { return days.has(from) ? [days.get(from)] : []; },
  async upsert(date, patch) { days.set(date, { ...patch, updatedAt: `${patch.updatedAt}x` }); return days.get(date); }
};

const result = await cancelOrderProduction({ ticketId: 'ticket-1', queueRepository, capacityRepository });
assert.equal(result.cancelledAllocations, 2);
assert.equal(result.refundedPoints, 3.5);
assert.equal(days.get('2026-09-09').reservedPoints, 2.5);
assert.deepEqual(allocations.map(item => item.status), ['CANCELLED', 'CANCELLED', 'COMPLETED']);

const repeated = await cancelOrderProduction({ ticketId: 'ticket-1', queueRepository, capacityRepository });
assert.equal(repeated.alreadyCancelled, true);
assert.equal(repeated.refundedPoints, 0);
assert.equal(days.get('2026-09-09').reservedPoints, 2.5);

console.log('Order cancellation test passed');
