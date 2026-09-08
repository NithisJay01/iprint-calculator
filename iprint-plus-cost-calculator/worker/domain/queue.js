const QUEUE_STATUSES = Object.freeze(['QUEUED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED']);

const clean = (value, limit = 1900) => String(value ?? '').trim().slice(0, limit);
const points = value => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
};

export function normalizeQueueAllocation(input = {}) {
  const allocationIndex = Math.max(1, Math.trunc(Number(input.allocationIndex) || 1));
  const allocationCount = Math.max(allocationIndex, Math.trunc(Number(input.allocationCount) || 1));
  const status = QUEUE_STATUSES.includes(clean(input.status).toUpperCase())
    ? clean(input.status).toUpperCase()
    : 'QUEUED';

  return {
    id: clean(input.id, 100),
    allocationKey: clean(input.allocationKey, 200),
    orderKey: clean(input.orderKey, 200),
    quoteNo: clean(input.quoteNo, 100),
    ticketId: clean(input.ticketId, 100),
    ticketUrl: clean(input.ticketUrl),
    itemId: clean(input.itemId, 100),
    itemKey: clean(input.itemKey, 200),
    title: clean(input.title),
    customer: clean(input.customer),
    date: clean(input.date, 10),
    points: points(input.points),
    totalPoints: points(input.totalPoints),
    allocationIndex,
    allocationCount,
    status,
    priority: clean(input.priority, 40).toUpperCase() === 'URGENT' ? 'URGENT' : 'NORMAL',
    deliveryDeadline: clean(input.deliveryDeadline, 10),
    updatedAt: clean(input.updatedAt, 100)
  };
}

export function validateQueueAllocation(input = {}) {
  const value = normalizeQueueAllocation(input);
  const errors = [];
  if (!value.allocationKey) errors.push('allocationKey is required');
  if (!value.orderKey) errors.push('orderKey is required');
  if (!value.itemKey) errors.push('itemKey is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) errors.push('date must use YYYY-MM-DD');
  if (value.points <= 0) errors.push('points must be greater than 0');
  if (!QUEUE_STATUSES.includes(value.status)) errors.push('status is invalid');
  return { success: errors.length === 0, errors, value };
}

export function canMoveQueueAllocation(allocation) {
  return !['COMPLETED', 'CANCELLED'].includes(normalizeQueueAllocation(allocation).status);
}

export function queueStatusAllowsReservation(status) {
  return !['COMPLETED', 'CANCELLED'].includes(clean(status).toUpperCase());
}

export { QUEUE_STATUSES };
