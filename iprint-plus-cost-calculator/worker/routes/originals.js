// Large original artwork files of a print request, parked in R2 until the shop copies them to its own computer.
//
//   1. POST /public/print-requests (Turnstile-verified, unchanged) also names the original files the customer will send
//      (`originals`: slot, name, size). The answer carries `uploadToken`: a signed, 24 hour ticket for exactly those files.
//   2. PUT  /public/print-requests/originals/<slot>   Authorization: Bearer <uploadToken>   body = the file (max 90 MB)
//   3. Staff (X-API-Key):  GET /staff/originals            list what is waiting
//                          GET /staff/originals/file?key=  download one
//                          DELETE /staff/originals/file?key=  remove it after it has been copied (scripts/fetch-originals.mjs)
//
// Nothing here trusts the customer: the token fixes slot, size and label; the size on the wire must match; the first bytes
// must be a PDF / PNG / JPEG / WebP / SVG (checked after the write, a bad file is deleted); names never reach the key.
import { sniffImageType } from './media.js';
import { MAX_ORIGINAL_BYTES, ORIGINAL_SLOTS } from '../../shared/print-request.js';

export const ORIGINAL_PREFIX = 'incoming/';
// The free R2 quota is 10 GB. Uploads stop at the cap (so the bucket can never cost money) and staff see a warning at 80%.
export const DEFAULT_TOTAL_CAP_BYTES = 10 * 1024 ** 3;
export const WARN_RATIO = 0.8;
const totalCap = env => Number(env.ORIGINALS_MAX_TOTAL_BYTES) > 0 ? Number(env.ORIGINALS_MAX_TOTAL_BYTES) : DEFAULT_TOTAL_CAP_BYTES;
const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
// Letters (Thai vowel and tone marks included), digits, "_", "-" and a dot inside a name: never a path or a "..".
const safe = (text, max = 40) => String(text || '').normalize('NFC').replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '-').replace(/\.{2,}/g, '.').replace(/\.(?![\p{L}\p{M}\p{N}])/gu, '').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, max) || 'file';

async function hmacKey(env, usage) {
  // Derived from the Turnstile secret (already a private Worker secret) so no new secret has to be set up.
  return crypto.subtle.importKey('raw', encoder.encode(`originals-v1:${env.TURNSTILE_SECRET_KEY}`), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

/** A signed ticket for the originals a request announced. `files` = [{ slot, name, size }]. */
export async function signUploadToken(env, { ticketId, label, files }, now = Date.now()) {
  const payload = b64url(encoder.encode(JSON.stringify({ t: ticketId, l: label, f: files, e: now + TOKEN_LIFETIME_MS })));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env, 'sign'), encoder.encode(payload)));
  return `${payload}.${b64url(signature)}`;
}

export async function readUploadToken(env, token, now = Date.now()) {
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra !== undefined || !env.TURNSTILE_SECRET_KEY) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(env, 'verify'), fromB64url(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (!(data.e > now) || typeof data.t !== 'string' || !Array.isArray(data.f)) return null;
    return { ticketId: data.t, label: String(data.l || ''), files: data.f, expires: data.e };
  } catch {
    return null;
  }
}

/** Human-readable folder label for the shop: customer and job, no path characters. */
export const originalLabel = value => `${safe(value.name, 24)}-${safe(value.jobName || 'job', 24)}`;

// PDF (also Illustrator .ai), PNG, JPEG, WebP or a plain SVG; anything else is refused.
export function sniffOriginal(bytes, name = '') {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (String.fromCharCode(...b.slice(0, 5)) === '%PDF-') return 'application/pdf';
  const image = sniffImageType(b);
  if (image) return image;
  const head = new TextDecoder().decode(b.slice(0, 512));
  if (/\.svg$/i.test(name) && /<svg\b/i.test(head) && !/<script\b|<foreignObject\b/i.test(head)) return 'image/svg+xml';
  return '';
}

/** Bytes waiting under incoming/ (a handful of objects, so listing them all is cheap). */
export async function storedBytes(env) {
  let total = 0;
  let count = 0;
  let cursor;
  do {
    const page = await env.MEDIA.list({ prefix: ORIGINAL_PREFIX, cursor, limit: 1000 });
    for (const object of page.objects) { total += object.size; count += 1; }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { total, count };
}

const notReady = json => json({ error: 'ระบบรับไฟล์ต้นฉบับยังไม่พร้อม กรุณาส่งไฟล์ทาง LINE' }, 503);

export async function handleUploadOriginal({ request, env, json, slot, allowedOrigins }) {
  if (!env.MEDIA || !env.TURNSTILE_SECRET_KEY) return notReady(json);
  if (!allowedOrigins.includes(request.headers.get('Origin'))) return json({ error: 'Origin not allowed' }, 403);
  const auth = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') || '');
  const ticket = auth && await readUploadToken(env, auth[1]);
  if (!ticket) return json({ error: 'ลิงก์อัปโหลดหมดอายุ กรุณาส่งคำขอใหม่' }, 401);
  const declared = ORIGINAL_SLOTS.includes(slot) ? ticket.files.find(file => file.slot === slot) : null;
  if (!declared) return json({ error: 'ไม่มีไฟล์ด้านนี้ในคำขอ' }, 404);
  const length = Number(request.headers.get('Content-Length'));
  if (!Number.isInteger(length) || length < 8 || length > MAX_ORIGINAL_BYTES) return json({ error: `ไฟล์ต้องไม่เกิน ${MAX_ORIGINAL_BYTES / 1048576} MB` }, 413);
  if (length !== declared.size) return json({ error: 'ขนาดไฟล์ไม่ตรงกับที่แจ้งไว้ในคำขอ' }, 400);
  if (!request.body) return json({ error: 'Missing file' }, 400);
  const { total } = await storedBytes(env);
  if (total + length > totalCap(env)) return json({ error: 'พื้นที่รับไฟล์ต้นฉบับเต็มชั่วคราว กรุณาส่งไฟล์ทาง LINE หรือลองใหม่ภายหลัง' }, 507);
  const key = `${ORIGINAL_PREFIX}${safe(ticket.ticketId, 40)}/${slot}-${safe(declared.name, 80)}`;
  const label = `${ticket.label}-${safe(ticket.ticketId, 8)}`;
  await env.MEDIA.put(key, request.body, { customMetadata: { label, slot, name: String(declared.name).slice(0, 150), ticket: ticket.ticketId } });
  // The bytes are on R2 now: check what they really are, and drop them when they are not what a customer may send.
  const head = await env.MEDIA.get(key, { range: { offset: 0, length: 512 } });
  const bytes = head ? new Uint8Array(await new Response(head.body).arrayBuffer()) : new Uint8Array();
  const type = sniffOriginal(bytes, declared.name);
  const stored = await env.MEDIA.head?.(key);
  if (!type || (stored && stored.size !== length)) {
    await env.MEDIA.delete(key);
    return json({ error: 'ชนิดไฟล์ไม่รองรับ (รับ PDF, PNG, JPG, WebP, SVG)' }, 415);
  }
  return json({ success: true, slot, size: length });
}

// ---- staff side ----

export async function handleListOriginals({ env, json, url }) {
  if (!env.MEDIA) return notReady(json);
  const usage = await storedBytes(env);
  const cap = totalCap(env);
  const listed = await env.MEDIA.list({ prefix: ORIGINAL_PREFIX, limit: 500, cursor: url.searchParams.get('cursor') || undefined, include: ['customMetadata'] });
  return json({
    success: true,
    files: listed.objects.map(object => ({ key: object.key, size: object.size, uploaded: object.uploaded, label: object.customMetadata?.label || '', name: object.customMetadata?.name || object.key.split('/').pop(), slot: object.customMetadata?.slot || '' })),
    cursor: listed.truncated ? listed.cursor : null,
    storage: { bytes: usage.total, files: usage.count, capBytes: cap, warning: usage.total >= cap * WARN_RATIO, full: usage.total >= cap }
  });
}

const originalKey = url => {
  const key = url.searchParams.get('key') || '';
  return key.startsWith(ORIGINAL_PREFIX) && !key.includes('..') && key.length < 300 ? key : '';
};

export async function handleGetOriginal({ env, json, url }) {
  if (!env.MEDIA) return notReady(json);
  const key = originalKey(url);
  const object = key && await env.MEDIA.get(key);
  if (!object) return json({ error: 'Not found' }, 404);
  return new Response(object.body, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(object.size), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
}

export async function handleDeleteOriginal({ env, json, url }) {
  if (!env.MEDIA) return notReady(json);
  const key = originalKey(url);
  if (!key) return json({ error: 'Not found' }, 404);
  await env.MEDIA.delete(key);
  return json({ success: true });
}
