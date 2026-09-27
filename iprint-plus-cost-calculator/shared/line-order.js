export const LINE_OA_ID = '@683amlxt';

export function lineOrderMessage({ quoteNo, id }) {
  return `ส่งออร์เดอร์ให้ทีมงานตรวจสอบ\nเลขอ้างอิง: ${quoteNo || '-'}\nรหัสติดตาม: ${id}`;
}

export function lineOrderUrl(order) {
  return `https://line.me/R/oaMessage/${encodeURIComponent(LINE_OA_ID)}/?${encodeURIComponent(lineOrderMessage(order))}`;
}

// LINE supports the oaMessage URL scheme on iOS and Android. Desktop keeps the
// explicit button visible because LINE for Windows and macOS doesn't support it.
export function supportsLineOrderLaunch(navigatorValue = globalThis.navigator) {
  const userAgent = String(navigatorValue?.userAgent || '');
  return /Android|iPhone|iPod/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && Number(navigatorValue?.maxTouchPoints || 0) > 1);
}
