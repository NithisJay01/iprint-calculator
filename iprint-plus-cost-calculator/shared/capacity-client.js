import { LOCAL, API_ROOT } from './pricing-client.js';
import { RUSH_MAX_DAYS, rushMultiplier } from './rush.js';

// Delivery-date availability for a whole order: the capacity points of all cart items are booked together.
const pad = value => String(value).padStart(2, '0');
export const isoDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Stand-in used on localhost, where the Worker refuses the request (CORS). Same rule as the old order page.
export function localAvailability(points, now = new Date(), horizon = 45) {
  const days = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  let recommendedDate = '';
  for (let index = 0; index < horizon; index += 1) {
    const date = isoDate(cursor);
    const closed = cursor.getDay() === 0;
    const available = !closed && index >= 2;
    if (available && !recommendedDate) recommendedDate = date;
    days.push({ date, availability: closed ? 'CLOSED' : available ? 'AVAILABLE' : 'TOO_SOON', bookable: available, boostDays: 0, boostMultiplier: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  // Days before the recommended date can be had as a rush order: one boost day per working day earlier.
  for (const day of days) {
    if (day.availability !== 'TOO_SOON' || !recommendedDate) continue;
    const boostDays = days.filter(other => other.date > day.date && other.date <= recommendedDate && other.availability !== 'CLOSED').length;
    if (boostDays >= 1 && boostDays <= RUSH_MAX_DAYS) Object.assign(day, { availability: 'BOOST', boostDays, boostMultiplier: rushMultiplier(boostDays) });
  }
  return { success: true, requiredPoints: points, recommendedDate, schedulable: true, days, testMode: true };
}

export async function loadAvailability({ points, now = new Date(), horizon = 45, fetcher = fetch, local = LOCAL }) {
  const required = Math.max(0.25, Number(points) || 1);
  if (local) return localAvailability(required, now, horizon);
  const from = isoDate(now);
  const end = new Date(now);
  end.setDate(end.getDate() + horizon);
  const response = await fetcher(`${API_ROOT}/public/capacity?from=${from}&to=${isoDate(end)}&points=${encodeURIComponent(required)}`, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `โหลดกำลังผลิตไม่สำเร็จ (${response.status})`);
  return data;
}

// Rush ("boost") days carry a price surcharge (shared/rush.js), so they can only be picked when the customer asked for a rush order.
export const isSelectable = (day, { rush = false } = {}) => Boolean(day?.bookable) || Boolean(rush && Number(day?.boostDays) > 0);
export const isRushDay = day => !day?.bookable && Number(day?.boostDays) > 0;
export const dayLabel = day => (day.bookable ? 'ว่าง' : day.boostDays ? 'ต้องเร่งด่วน' : day.availability === 'CLOSED' ? 'ปิด' : day.availability === 'AVAILABLE' ? 'ว่าง' : 'เร็วเกินไป');
