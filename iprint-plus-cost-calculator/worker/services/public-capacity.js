import { allocateOrderCapacity, normalizeCapacityDay } from '../domain/capacity.js';
import { RUSH_MAX_DAYS, rushMultiplier } from '../../shared/rush.js';

const isoDate = value => String(value || '').slice(0, 10);
const addDays = (date, amount) => {
  const [year, month, day] = isoDate(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
};
const weekdayOf = date => {
  const [year, month, day] = isoDate(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};
const zonedToday = (now, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export function buildPublicCapacityAvailability({ from, to, points, now = new Date(), policy, capacityDays = [] }) {
  const requiredPoints = Math.max(0.25, Math.min(100000, Number(points) || 1));
  const daysByDate = Object.fromEntries(capacityDays.map(day => [day.date, {
    capacity: day.dailyCapacity,
    reserved: day.reservedPoints,
    closed: day.closed
  }]));
  const schedule = allocateOrderCapacity({ points: requiredPoints, now, policy, days: daysByDate });
  const fastestSchedule = allocateOrderCapacity({ points: requiredPoints, now, policy: { ...policy, largeJobDailyShare: 1 }, days: daysByDate });
  const businessDays = new Set(Array.isArray(policy.businessDays) ? policy.businessDays.map(Number) : [1, 2, 3, 4, 5, 6]);
  const holidays = new Set(Array.isArray(policy.holidays) ? policy.holidays.map(String) : []);
  const defaultCapacity = Math.max(0, Number(policy.dailyCapacity) || 0);
  const today = zonedToday(now, policy.timeZone || 'Asia/Bangkok');
  const result = [];

  for (let date = from; date <= to; date = addDays(date, 1)) {
    const stored = capacityDays.find(day => day.date === date);
    const normalized = normalizeCapacityDay(stored || {
      date, dailyCapacity: defaultCapacity, reservedPoints: 0,
      cutoffTime: policy.cutoffTime || '15:00'
    });
    const nonWorking = !businessDays.has(weekdayOf(date)) || holidays.has(date);
    const closed = normalized.closed || nonWorking;
    const remainingRatio = defaultCapacity > 0 ? normalized.availablePoints / Math.max(1, normalized.dailyCapacity) : 0;
    const deadlineFeasible = schedule.success && Boolean(schedule.estimatedCompletionDate) && date >= schedule.estimatedCompletionDate;
    const bookable = date >= today && !closed && normalized.availablePoints > 0 && deadlineFeasible;
    let boostDays = 0;
    if (!bookable && date >= today && !closed && normalized.availablePoints > 0 && schedule.estimatedCompletionDate &&
        fastestSchedule.success && fastestSchedule.estimatedCompletionDate && date >= fastestSchedule.estimatedCompletionDate && date < schedule.estimatedCompletionDate) {
      for (let cursor = date; cursor < schedule.estimatedCompletionDate;) {
        cursor = addDays(cursor, 1);
        if (businessDays.has(weekdayOf(cursor)) && !holidays.has(cursor)) boostDays += 1;
      }
      if (boostDays > RUSH_MAX_DAYS) boostDays = 0;
    }
    const availability = closed ? 'CLOSED'
      : normalized.availablePoints <= 0 ? 'FULL'
        : bookable ? (remainingRatio <= 0.25 ? 'LIMITED' : 'AVAILABLE')
          : boostDays ? 'BOOST' : 'TOO_SOON';
    result.push({ date, availability, bookable, boostDays, boostMultiplier: boostDays ? rushMultiplier(boostDays) : 0 });
  }

  return {
    requiredPoints,
    earliestProductionDate: schedule.earliestDate || null,
    recommendedDate: schedule.estimatedCompletionDate || null,
    fastestBoostDate: fastestSchedule.estimatedCompletionDate || null,
    schedulable: schedule.success,
    days: result
  };
}

// The same policy the public capacity route uses, so that the dates offered to customers and the dates accepted
// for their orders come from one rule.
export const publicCapacityPolicy = env => ({
  dailyCapacity: Number(env.CAPACITY_DEFAULT_DAILY) || 20,
  cutoffTime: env.CAPACITY_CUTOFF_TIME || '15:00',
  businessDays: String(env.CAPACITY_BUSINESS_DAYS || '1,2,3,4,5,6').split(',').map(Number),
  holidays: String(env.CAPACITY_HOLIDAYS || '').split(',').map(value => value.trim()).filter(Boolean),
  timeZone: env.CAPACITY_TIME_ZONE || 'Asia/Bangkok',
  maxSearchDays: Number(env.CAPACITY_MAX_SEARCH_DAYS) || 180,
  largeJobDailyShare: Number(env.CAPACITY_LARGE_JOB_DAILY_SHARE) || 0.5
});

// A public order is scheduled item by item, but the calendar offered to the customer books the whole order at once.
// A delivery date earlier than the normal completion date of the WHOLE order is a rush date: it is only accepted
// when every item that asks for it carries the matching boost (and so pays the surcharge).
export function checkRushRequirement({ orderItems = [], totalPoints, now = new Date(), policy, capacityDays = [] }) {
  const deadlines = orderItems.map(item => isoDate(item?.deliveryDeadline)).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  if (!deadlines.length) return { success: true };
  const from = zonedToday(now, policy.timeZone || 'Asia/Bangkok');
  const to = deadlines[deadlines.length - 1] < addDays(from, 366) ? deadlines[deadlines.length - 1] : addDays(from, 366);
  if (to < from) return { success: true };
  const availability = buildPublicCapacityAvailability({ from, to, points: totalPoints, now, policy, capacityDays });
  if (!availability.schedulable || !availability.recommendedDate) return { success: true };
  for (const [itemIndex, item] of orderItems.entries()) {
    const deadline = isoDate(item?.deliveryDeadline);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || deadline >= availability.recommendedDate) continue;
    const day = availability.days.find(entry => entry.date === deadline);
    if (day && day.boostDays > 0 && Number(item?.boost?.days) === day.boostDays) continue;
    return { success: false, itemIndex, itemKey: String(item?.id || ''), deadline, normalDate: availability.recommendedDate, boostDays: day?.boostDays || 0 };
  }
  return { success: true };
}
