import { LOCAL, API_ROOT } from './pricing-client.js';

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

// Rush ("boost") days need a price surcharge, which the cart does not offer yet, so only normal days can be picked.
export const isSelectable = day => Boolean(day?.bookable);
export const dayLabel = day => (day.bookable ? 'ว่าง' : day.boostDays ? 'ต้องเร่งด่วน' : day.availability === 'CLOSED' ? 'ปิด' : day.availability === 'AVAILABLE' ? 'ว่าง' : 'เร็วเกินไป');
