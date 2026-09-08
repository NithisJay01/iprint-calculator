import { allocateOrderCapacity, calculateItemCapacity } from './capacity.js';

const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function planOrderSchedule({ orderItems = [], now = new Date(), days = {}, policy = {}, enforceDeadline = true } = {}) {
  const workingDays = Object.fromEntries(Object.entries(days || {}).map(([date, day]) => [date, { ...day }]));
  const plans = [];

  for (const [itemIndex, item] of orderItems.entries()) {
    const capacity = calculateItemCapacity(item);
    const allocation = allocateOrderCapacity({ points: capacity.points, now, policy, days: workingDays });
    if (!allocation.success) {
      return { success: false, code: allocation.code, itemIndex, itemKey: String(item?.id || ''), capacity, allocation, plans };
    }
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(String(item?.deliveryDeadline || '')) ? String(item.deliveryDeadline) : '';
    if (enforceDeadline && deadline && allocation.estimatedCompletionDate > deadline) {
      return { success: false, code: 'CAPACITY_DEADLINE_UNAVAILABLE', itemIndex, itemKey: String(item?.id || ''), deadline, capacity, allocation, plans };
    }
    allocation.allocations.forEach(part => {
      const current = workingDays[part.date] || {};
      workingDays[part.date] = {
        ...current,
        capacity: part.capacity,
        reserved: round((Number(current.reserved) || 0) + part.points)
      };
    });
    plans.push({ itemIndex, itemKey: String(item?.id || ''), capacity, ...allocation, deadline });
  }

  return {
    success: true,
    code: 'ORDER_CAPACITY_ALLOCATED',
    totalPoints: round(plans.reduce((sum, plan) => sum + plan.capacity.points, 0)),
    startDate: plans.map(plan => plan.startDate).filter(Boolean).sort()[0] || null,
    estimatedCompletionDate: plans.map(plan => plan.estimatedCompletionDate).filter(Boolean).sort().at(-1) || null,
    plans,
    days: workingDays
  };
}
