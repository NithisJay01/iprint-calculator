const DEFAULT_BUSINESS_DAYS = Object.freeze([1, 2, 3, 4, 5, 6]);
const DEFAULT_TIME_ZONE = "Asia/Bangkok";

const roundPoints = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const positiveNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

function componentCapacity(component, item) {
  const pointsPerStep = positiveNumber(component?.capacityPoints);
  if (!pointsPerStep) return 0;

  const basis = String(component?.capacityBasis || "job").trim().toLowerCase();
  const step = positiveNumber(component?.capacityStep, 1);
  const workload = basis === "piece"
    ? positiveNumber(item?.quantity)
    : basis === "sheet"
      ? positiveNumber(item?.sheets)
      : 1;

  return roundPoints(Math.ceil(workload / step) * pointsPerStep);
}

export function calculateItemCapacity(item) {
  const explicitPoints = positiveNumber(item?.capacityPoints);
  if (explicitPoints) {
    return {
      itemId: String(item?.id || ""),
      points: roundPoints(explicitPoints),
      basePoints: roundPoints(explicitPoints),
      materialPoints: 0,
      services: [],
      source: "snapshot"
    };
  }

  const basePoints = positiveNumber(item?.baseCapacityPoints, 1);
  const materialPoints = componentCapacity(item?.material, item);
  const services = (Array.isArray(item?.services) ? item.services : []).map(service => ({
    id: String(service?.id || ""),
    name: String(service?.name || ""),
    points: componentCapacity(service, item)
  }));
  const servicePoints = services.reduce((sum, service) => sum + service.points, 0);

  return {
    itemId: String(item?.id || ""),
    points: roundPoints(basePoints + materialPoints + servicePoints),
    basePoints: roundPoints(basePoints),
    materialPoints,
    services,
    source: "calculated"
  };
}

export function calculateOrderCapacity(order) {
  const items = (Array.isArray(order?.orderItems) ? order.orderItems : [])
    .map(calculateItemCapacity);
  const rawPoints = items.reduce((sum, item) => sum + item.points, 0);
  const configuredMultiplier = positiveNumber(order?.capacityMultiplier, 1);
  const multiplier = order?.rush === true && !order?.capacityMultiplier
    ? 1.5
    : configuredMultiplier;

  return {
    points: roundPoints(rawPoints * multiplier),
    rawPoints: roundPoints(rawPoints),
    multiplier: roundPoints(multiplier),
    items
  };
}

export function validateCapacityPolicy(input = {}) {
  const errors = [];
  const dailyCapacity = Number(input.dailyCapacity);
  const cutoffTime = String(input.cutoffTime || "15:00").trim();
  const businessDays = Array.isArray(input.businessDays)
    ? [...new Set(input.businessDays.map(Number))]
    : [...DEFAULT_BUSINESS_DAYS];
  const maxSearchDays = Number(input.maxSearchDays ?? 180);
  const largeJobDailyShare = Number(input.largeJobDailyShare ?? 0.5);

  if (!Number.isFinite(dailyCapacity) || dailyCapacity <= 0) {
    errors.push("dailyCapacity must be greater than 0");
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoffTime)) {
    errors.push("cutoffTime must use HH:mm in 24-hour time");
  }
  if (!businessDays.length || businessDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    errors.push("businessDays must contain weekday numbers from 0 to 6");
  }
  if (!Number.isInteger(maxSearchDays) || maxSearchDays < 1 || maxSearchDays > 730) {
    errors.push("maxSearchDays must be an integer from 1 to 730");
  }
  if (!Number.isFinite(largeJobDailyShare) || largeJobDailyShare <= 0 || largeJobDailyShare > 1) {
    errors.push("largeJobDailyShare must be greater than 0 and no more than 1");
  }

  return {
    success: errors.length === 0,
    errors,
    value: {
      dailyCapacity: positiveNumber(dailyCapacity),
      cutoffTime,
      businessDays,
      holidays: new Set((Array.isArray(input.holidays) ? input.holidays : []).map(String)),
      timeZone: String(input.timeZone || DEFAULT_TIME_ZONE),
      maxSearchDays: Number.isInteger(maxSearchDays) ? maxSearchDays : 180,
      largeJobDailyShare: Number.isFinite(largeJobDailyShare) && largeJobDailyShare > 0 && largeJobDailyShare <= 1
        ? largeJobDailyShare
        : 0.5
    }
  };
}

export function normalizeCapacityDay(input = {}) {
  const dailyCapacity = Math.max(0, Number(input.dailyCapacity) || 0);
  const reservedPoints = Math.max(0, Number(input.reservedPoints) || 0);
  const closed = input.closed === true;
  const availablePoints = closed ? 0 : roundPoints(Math.max(0, dailyCapacity - reservedPoints));
  return {
    id: String(input.id || ''), date: String(input.date || ''),
    dailyCapacity: roundPoints(dailyCapacity), reservedPoints: roundPoints(reservedPoints),
    availablePoints, closed, cutoffTime: String(input.cutoffTime || '15:00'),
    note: String(input.note || '').trim().slice(0, 1000),
    status: closed ? 'CLOSED' : availablePoints <= 0 ? 'FULL' : 'OPEN',
    updatedAt: String(input.updatedAt || '')
  };
}

export function validateCapacityDayMutation(input = {}) {
  const value = normalizeCapacityDay(input);
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) errors.push('date must use YYYY-MM-DD');
  if (!Number.isFinite(Number(input.dailyCapacity)) || Number(input.dailyCapacity) < 0) errors.push('dailyCapacity must be zero or greater');
  if (!Number.isFinite(Number(input.reservedPoints)) || Number(input.reservedPoints) < 0) errors.push('reservedPoints must be zero or greater');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.cutoffTime)) errors.push('cutoffTime must use HH:mm');
  return { success: errors.length === 0, errors, value };
}

export function allocateOrderCapacity({
  points,
  now = new Date(),
  requestedDate = "",
  policy,
  days = {}
}) {
  const validation = validateCapacityPolicy(policy);
  if (!validation.success) {
    return { success: false, code: "INVALID_CAPACITY_POLICY", errors: validation.errors };
  }

  const totalPoints = positiveNumber(points);
  if (!totalPoints) {
    return { success: false, code: "INVALID_CAPACITY_POINTS", errors: ["points must be greater than 0"] };
  }

  const normalizedPolicy = validation.value;
  const localNow = zonedDateParts(now, normalizedPolicy.timeZone);
  let earliestDate = localNow.date;
  if (minutesOfDay(localNow.time) >= minutesOfDay(normalizedPolicy.cutoffTime)) {
    earliestDate = addDays(earliestDate, 1);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(requestedDate)) && requestedDate > earliestDate) {
    earliestDate = requestedDate;
  }

  let remaining = roundPoints(totalPoints);
  const isLargeJob = totalPoints > normalizedPolicy.dailyCapacity;
  const allocations = [];
  for (let offset = 0; offset < normalizedPolicy.maxSearchDays && remaining > 0; offset += 1) {
    const date = addDays(earliestDate, offset);
    const weekday = weekdayOf(date);
    const override = days?.[date] || {};
    const isClosed = override.closed === true ||
      normalizedPolicy.holidays.has(date) ||
      !normalizedPolicy.businessDays.includes(weekday);
    const capacity = Number.isFinite(Number(override.capacity))
      ? Math.max(0, Number(override.capacity))
      : normalizedPolicy.dailyCapacity;
    const reserved = Math.max(0, Number(override.reserved) || 0);
    const available = isClosed ? 0 : roundPoints(Math.max(0, capacity - reserved));
    if (!available) continue;

    const jobDailyLimit = isLargeJob
      ? roundPoints(capacity * normalizedPolicy.largeJobDailyShare)
      : capacity;
    const allocated = roundPoints(Math.min(available, jobDailyLimit, remaining));
    allocations.push({
      date,
      points: allocated,
      capacity: roundPoints(capacity),
      reserved: roundPoints(reserved),
      remainingAfter: roundPoints(remaining - allocated)
    });
    remaining = roundPoints(remaining - allocated);
  }

  return {
    success: remaining === 0,
    code: remaining === 0 ? "CAPACITY_ALLOCATED" : "CAPACITY_UNAVAILABLE",
    totalPoints: roundPoints(totalPoints),
    isLargeJob,
    largeJobDailyShare: isLargeJob ? normalizedPolicy.largeJobDailyShare : 1,
    allocatedPoints: roundPoints(totalPoints - remaining),
    unallocatedPoints: remaining,
    earliestDate,
    startDate: allocations[0]?.date || null,
    estimatedCompletionDate: remaining === 0 ? allocations.at(-1)?.date || null : null,
    allocations
  };
}

function zonedDateParts(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("now must be a valid date");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

function minutesOfDay(value) {
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
}

function addDays(date, amount) {
  const [year, month, day] = String(date).split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + amount));
  return value.toISOString().slice(0, 10);
}

function weekdayOf(date) {
  const [year, month, day] = String(date).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
