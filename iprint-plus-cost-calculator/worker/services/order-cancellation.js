import { canMoveQueueAllocation } from '../domain/queue.js';

export async function cancelOrderProduction({ ticketId, orderKey = '', queueRepository, capacityRepository }) {
  let allocations = await queueRepository.listByTicketId(ticketId);
  if (!allocations.length && orderKey && typeof queueRepository.listByOrderKey === 'function') {
    allocations = await queueRepository.listByOrderKey(orderKey);
  }
  const active = allocations.filter(canMoveQueueAllocation);
  if (!active.length) return { ticketId, cancelledAllocations: 0, refundedPoints: 0, alreadyCancelled: true };

  const capacityBefore = new Map();
  const refundedByDate = new Map();
  for (const allocation of active) refundedByDate.set(allocation.date, (refundedByDate.get(allocation.date) || 0) + allocation.points);

  const changedAllocations = [];
  try {
    for (const allocation of active) {
      await queueRepository.update(allocation.id, { status: 'CANCELLED' }, allocation.updatedAt || '');
      changedAllocations.push(allocation);
    }
    for (const [date, points] of refundedByDate) {
      const day = (await capacityRepository.list({ from: date, to: date }))[0];
      if (!day) throw Object.assign(new Error(`Capacity day ${date} was not found`), { status: 409, code: 'CAPACITY_DAY_MISSING' });
      capacityBefore.set(date, day);
      await capacityRepository.upsert(date, { ...day, reservedPoints: Math.max(0, day.reservedPoints - points) }, day.updatedAt || '');
    }
  } catch (error) {
    for (const [date, day] of [...capacityBefore].reverse()) {
      const latest = (await capacityRepository.list({ from: date, to: date }))[0];
      if (latest) await capacityRepository.upsert(date, { ...latest, reservedPoints: day.reservedPoints }, latest.updatedAt || '').catch(() => {});
    }
    for (const allocation of changedAllocations.reverse()) {
      const latest = await queueRepository.getById(allocation.id).catch(() => null);
      if (latest) await queueRepository.update(allocation.id, { status: allocation.status }, latest.updatedAt || '').catch(() => {});
    }
    throw error;
  }

  return {
    ticketId,
    cancelledAllocations: active.length,
    refundedPoints: [...refundedByDate.values()].reduce((sum, points) => sum + points, 0),
    refundedByDate: Object.fromEntries(refundedByDate),
    alreadyCancelled: false
  };
}
