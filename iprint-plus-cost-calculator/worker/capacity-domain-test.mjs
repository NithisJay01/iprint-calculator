import assert from "node:assert/strict";
import {
  allocateOrderCapacity,
  calculateItemCapacity,
  calculateOrderCapacity,
  validateCapacityPolicy
} from "./domain/capacity.js";
import { buildPublicCapacityAvailability } from './services/public-capacity.js';

const item = calculateItemCapacity({
  id: "item-1",
  quantity: 250,
  sheets: 25,
  material: { capacityPoints: 0.5 },
  services: [
    { id: "print", name: "พิมพ์", capacityPoints: 2 },
    { id: "diecut", name: "ไดคัท", capacityPoints: 1, capacityBasis: "piece", capacityStep: 100 }
  ]
});
assert.equal(item.basePoints, 1);
assert.equal(item.materialPoints, 0.5);
assert.equal(item.services[1].points, 3);
assert.equal(item.points, 6.5);

const rushOrder = calculateOrderCapacity({
  rush: true,
  orderItems: [
    { ...item, id: "snapshot-item", capacityPoints: item.points },
    { id: "simple-item", services: [{ capacityPoints: 1 }] }
  ]
});
assert.equal(rushOrder.rawPoints, 8.5);
assert.equal(rushOrder.multiplier, 1.5);
assert.equal(rushOrder.points, 12.75);

const validPolicy = validateCapacityPolicy({ dailyCapacity: 20 });
assert.equal(validPolicy.success, true);
assert.deepEqual(validPolicy.value.businessDays, [1, 2, 3, 4, 5, 6]);
assert.equal(validPolicy.value.largeJobDailyShare, 0.5);

const invalidPolicy = validateCapacityPolicy({ dailyCapacity: 0, cutoffTime: "25:00", businessDays: [] });
assert.equal(invalidPolicy.success, false);
assert.equal(invalidPolicy.errors.length, 3);

const sameDay = allocateOrderCapacity({
  points: 10,
  now: "2026-09-04T06:00:00.000Z",
  policy: { dailyCapacity: 20, cutoffTime: "15:00" },
  days: { "2026-09-04": { reserved: 4 } }
});
assert.equal(sameDay.success, true);
assert.equal(sameDay.startDate, "2026-09-04");
assert.equal(sameDay.estimatedCompletionDate, "2026-09-04");
assert.equal(sameDay.allocations[0].points, 10);

const multiDay = allocateOrderCapacity({
  points: 25,
  now: "2026-09-04T06:00:00.000Z",
  policy: { dailyCapacity: 20, cutoffTime: "15:00" },
  days: { "2026-09-04": { reserved: 3 } }
});
assert.equal(multiDay.success, true);
assert.deepEqual(multiDay.allocations.map(day => [day.date, day.points]), [
  ["2026-09-04", 10],
  ["2026-09-05", 10],
  ["2026-09-07", 5]
]);

const largeOrder = allocateOrderCapacity({
  points: 46,
  now: "2026-09-04T06:00:00.000Z",
  policy: { dailyCapacity: 20, cutoffTime: "15:00" }
});
assert.equal(largeOrder.success, true);
assert.equal(largeOrder.totalPoints, 46);
assert.equal(largeOrder.isLargeJob, true);
assert.equal(largeOrder.largeJobDailyShare, 0.5);
assert.equal(largeOrder.estimatedCompletionDate, "2026-09-09");
assert.deepEqual(largeOrder.allocations.map(day => [day.date, day.points]), [
  ["2026-09-04", 10],
  ["2026-09-05", 10],
  ["2026-09-07", 10],
  ["2026-09-08", 10],
  ["2026-09-09", 6]
]);

const afterCutoff = allocateOrderCapacity({
  points: 5,
  now: "2026-09-04T09:00:00.000Z",
  policy: {
    dailyCapacity: 20,
    cutoffTime: "15:00",
    businessDays: [1, 2, 3, 4, 5],
    holidays: ["2026-09-07"]
  }
});
assert.equal(afterCutoff.earliestDate, "2026-09-05");
assert.equal(afterCutoff.startDate, "2026-09-08");

const override = allocateOrderCapacity({
  points: 12,
  now: "2026-09-04T06:00:00.000Z",
  policy: { dailyCapacity: 20 },
  requestedDate: "2026-09-05",
  days: {
    "2026-09-05": { closed: true },
    "2026-09-07": { capacity: 8, reserved: 3 }
  }
});
assert.deepEqual(override.allocations.map(day => [day.date, day.points]), [
  ["2026-09-07", 5],
  ["2026-09-08", 7]
]);

const unavailable = allocateOrderCapacity({
  points: 10,
  now: "2026-09-04T06:00:00.000Z",
  policy: { dailyCapacity: 20, maxSearchDays: 2, businessDays: [1] }
});
assert.equal(unavailable.success, false);
assert.equal(unavailable.code, "CAPACITY_UNAVAILABLE");
assert.equal(unavailable.unallocatedPoints, 10);

const publicAvailability = buildPublicCapacityAvailability({
  from: '2026-09-04', to: '2026-09-10', points: 25,
  now: new Date('2026-09-04T06:00:00.000Z'),
  policy: { dailyCapacity: 20, cutoffTime: '15:00', businessDays: [1, 2, 3, 4, 5, 6], timeZone: 'Asia/Bangkok' },
  capacityDays: [{ date: '2026-09-04', dailyCapacity: 20, reservedPoints: 3, closed: false }]
});
assert.equal(publicAvailability.recommendedDate, '2026-09-07');
assert.equal(publicAvailability.days.find(day => day.date === '2026-09-05').bookable, false);
assert.equal(publicAvailability.days.find(day => day.date === '2026-09-05').availability, 'BOOST');
assert.equal(publicAvailability.days.find(day => day.date === '2026-09-05').boostDays, 1);
assert.equal(publicAvailability.days.find(day => day.date === '2026-09-05').boostMultiplier, 0.5);
assert.equal(publicAvailability.days.find(day => day.date === '2026-09-07').bookable, true);
assert.equal(publicAvailability.days.find(day => day.date === '2026-09-06').availability, 'CLOSED');

console.log("Capacity domain test passed");
