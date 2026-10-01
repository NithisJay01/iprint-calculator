// Fixed-window request counter, backed by a KV binding. Good enough to blunt spam/bot abuse of a
// public endpoint; it is NOT exact under concurrency (KV reads/writes are not atomic, so a burst
// of simultaneous requests can all read the same count before any of them writes it back and a
// few extra requests can slip through a window). That tradeoff is fine here: the goal is cutting
// off sustained abuse, not enforcing a hard quota.
export async function checkRateLimit({ kv, key, max, windowSeconds, now = Date.now() }) {
  if (!kv) return { allowed: true, count: 0, max, remaining: max };
  if (!(max > 0) || !(windowSeconds > 0)) return { allowed: true, count: 0, max, remaining: max };

  const window = Math.floor(now / 1000 / windowSeconds);
  const storageKey = `${key}:${window}`;
  const current = Number(await kv.get(storageKey)) || 0;
  const next = current + 1;

  if (current >= max) {
    const retryAfter = windowSeconds - (Math.floor(now / 1000) % windowSeconds);
    return { allowed: false, count: current, max, remaining: 0, retryAfter };
  }

  // expirationTtl must be at least 60s; round up so the key always outlives its own window.
  await kv.put(storageKey, String(next), { expirationTtl: Math.max(60, windowSeconds * 2) });
  return { allowed: true, count: next, max, remaining: Math.max(0, max - next) };
}

// IP-based key for a named route. Requests with no discoverable IP (e.g. local dev) share one
// bucket rather than bypassing the limit entirely.
export function rateLimitKeyForIp(route, request) {
  const ip = String(request.headers.get('CF-Connecting-IP') || '').trim() || 'unknown';
  return `ratelimit:${route}:${ip}`;
}
