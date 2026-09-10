import assert from 'node:assert/strict';
import { planOrderSchedule } from './domain/scheduling.js';

const policy = { dailyCapacity: 10, cutoffTime: '15:00', businessDays: [1, 2, 3, 4, 5, 6], timeZone: 'Asia/Bangkok', largeJobDailyShare: 0.5 };
const scheduled = planOrderSchedule({
  now: new Date('2026-09-08T03:00:00.000Z'), policy,
  days: { '2026-09-08': { capacity: 10, reserved: 6 } },
  orderItems: [
    { id: 'item-1', capacityPoints: 4, deliveryDeadline: '2026-09-08' },
    { id: 'item-2', capacityPoints: 6, deliveryDeadline: '2026-09-10' }
  ]
});
assert.equal(scheduled.success, true);
assert.equal(scheduled.totalPoints, 10);
assert.equal(scheduled.plans[0].startDate, '2026-09-08');
assert.equal(scheduled.plans[1].startDate, '2026-09-09');
assert.equal(scheduled.days['2026-09-08'].reserved, 10);

const deadlineMiss = planOrderSchedule({
  now: new Date('2026-09-08T03:00:00.000Z'), policy,
  days: { '2026-09-08': { capacity: 10, reserved: 10 } },
  orderItems: [{ id: 'late', capacityPoints: 4, deliveryDeadline: '2026-09-08' }]
});
assert.equal(deadlineMiss.success, false);
assert.equal(deadlineMiss.code, 'CAPACITY_DEADLINE_UNAVAILABLE');

const warningAllowed = planOrderSchedule({
  now: new Date('2026-09-08T03:00:00.000Z'), policy, enforceDeadline: false,
  days: { '2026-09-08': { capacity: 10, reserved: 10 } },
  orderItems: [{ id: 'late', capacityPoints: 4, deliveryDeadline: '2026-09-08' }]
});
assert.equal(warningAllowed.success, true);
assert.equal(warningAllowed.estimatedCompletionDate, '2026-09-09');

const boosted = planOrderSchedule({
  now: new Date('2026-09-08T03:00:00.000Z'), policy,
  orderItems: [{ id: 'boosted', capacityPoints: 15, deliveryDeadline: '2026-09-09', boost: { days: 1, multiplier: 0.5 } }]
});
assert.equal(boosted.success, true);
assert.equal(boosted.estimatedCompletionDate, '2026-09-09');

console.log('Scheduling domain test passed');
