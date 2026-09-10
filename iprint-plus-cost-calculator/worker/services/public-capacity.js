import { allocateOrderCapacity, normalizeCapacityDay } from '../domain/capacity.js';

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
      if (boostDays > 4) boostDays = 0;
    }
    const availability = closed ? 'CLOSED'
      : normalized.availablePoints <= 0 ? 'FULL'
        : bookable ? (remainingRatio <= 0.25 ? 'LIMITED' : 'AVAILABLE')
          : boostDays ? 'BOOST' : 'TOO_SOON';
    result.push({ date, availability, bookable, boostDays, boostMultiplier: boostDays ? boostDays * 0.5 : 0 });
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
