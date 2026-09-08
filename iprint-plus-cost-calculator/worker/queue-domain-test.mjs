import assert from 'node:assert/strict';
import { canMoveQueueAllocation, normalizeQueueAllocation, queueStatusAllowsReservation, validateQueueAllocation } from './domain/queue.js';

const normalized = normalizeQueueAllocation({
  allocationKey: 'order-1:item-1:1', orderKey: 'order-1', itemKey: 'item-1',
  date: '2026-09-09', points: 4.256, totalPoints: 9, allocationIndex: 1,
  allocationCount: 2, status: 'queued', priority: 'urgent'
});
assert.equal(normalized.points, 4.26);
assert.equal(normalized.status, 'QUEUED');
assert.equal(normalized.priority, 'URGENT');
assert.equal(validateQueueAllocation(normalized).success, true);
assert.equal(validateQueueAllocation({}).success, false);
assert.equal(queueStatusAllowsReservation('IN_PROGRESS'), true);
assert.equal(queueStatusAllowsReservation('COMPLETED'), true);
assert.equal(queueStatusAllowsReservation('CANCELLED'), false);
assert.equal(canMoveQueueAllocation({ status: 'QUEUED' }), true);
assert.equal(canMoveQueueAllocation({ status: 'CANCELLED' }), false);

console.log('Queue domain test passed');
