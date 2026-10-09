// Customer-facing text for a failed request. Browser network errors ("Failed to fetch", "NetworkError…",
// "Load failed") and other English technical messages are never shown as they are.
export const NETWORK_MESSAGE = 'เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วกด “ลองใหม่”';
export const GENERIC_MESSAGE = 'โหลดข้อมูลไม่สำเร็จ กรุณากด “ลองใหม่” หากยังไม่ได้ให้ติดต่อทีมงาน';

const NETWORK_PATTERN = /failed to fetch|networkerror|network request failed|load failed|err_/i;
const THAI = /[฀-๿]/;

export function friendlyError(error, fallback = GENERIC_MESSAGE) {
  const message = String(error?.message ?? error ?? '').trim();
  if (error?.name === 'TypeError' && NETWORK_PATTERN.test(message)) return NETWORK_MESSAGE;
  if (NETWORK_PATTERN.test(message)) return NETWORK_MESSAGE;
  if (error?.name === 'AbortError') return NETWORK_MESSAGE;
  return THAI.test(message) ? message : fallback;
}
