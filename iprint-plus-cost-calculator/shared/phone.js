// Thai phone numbers as customers type them: "081-234-5678", "081 234 5678", "+66 81 234 5678", "02-123-4567".
// Mobile numbers are 0 + 9 digits; Bangkok / provincial landlines are 0 + 8 digits, so both are accepted.
// Used by the cart (browser) and by the Worker for public orders, so both sides accept the same numbers.
export const PHONE_HINT = 'กรอกเบอร์โทร 9-10 หลัก ขึ้นต้นด้วย 0 เช่น 081-234-5678';

export function normalizeThaiPhone(value) {
  let digits = String(value ?? '').trim().replace(/[\s\-().]/g, '');
  if (digits.startsWith('+66')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('66') && digits.length === 11) digits = `0${digits.slice(2)}`;
  return digits;
}

export const isThaiPhone = value => /^0\d{8,9}$/.test(normalizeThaiPhone(value));
