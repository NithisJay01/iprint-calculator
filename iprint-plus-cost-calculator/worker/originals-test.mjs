import assert from 'node:assert/strict';
import worker from './index.js';
import { signUploadToken, readUploadToken, sniffOriginal, originalLabel, storedBytes, ORIGINAL_PREFIX } from './routes/originals.js';
import { handlePrintRequest, printRequestBrief } from './routes/print-requests.js';
import { validatePrintRequest, MAX_ARTWORK_BYTES, MAX_ORIGINAL_BYTES } from '../shared/print-request.js';

// Large original files: announced with the request, uploaded afterwards with a signed ticket, kept in R2, fetched by staff.

class FakeBucket {
  constructor() { this.objects = new Map(); }
  async put(key, body, options) {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    this.objects.set(key, { bytes, customMetadata: options?.customMetadata, uploaded: new Date('2026-09-26T00:00:00Z') });
  }
  async get(key, options) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    const bytes = options?.range ? stored.bytes.slice(options.range.offset, options.range.offset + options.range.length) : stored.bytes;
    return { body: new Response(bytes).body, size: stored.bytes.length };
  }
  async head(key) { const stored = this.objects.get(key); return stored ? { size: stored.bytes.length } : null; }
  async delete(key) { this.objects.delete(key); }
  async list({ prefix = '' } = {}) {
    const objects = [...this.objects].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, size: value.bytes.length, uploaded: value.uploaded, customMetadata: value.customMetadata }));
    return { objects, truncated: false };
  }
}

const ORIGIN = 'https://iprint.tchl.online';
const workerEnv = () => ({
  NOTION_TOKEN: 'notion-token', WRITE_API_KEY: 'staff-key', CORS_ALLOWED_ORIGINS: ORIGIN, TURNSTILE_SECRET_KEY: 'turnstile-secret',
  NOTION_DATA_SOURCE_ID: 'presets-id', NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id', NOTION_SERVICES_DATA_SOURCE_ID: 'services-id',
  NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id', NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id', NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-id',
  NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id', MEDIA: new FakeBucket()
});
const PDF = new TextEncoder().encode('%PDF-1.7\nlarge file fixture, the rest is padding');
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const withSize = (head, size) => { const bytes = new Uint8Array(size); bytes.set(head); return bytes; };
const MB = 1048576;

// ---------- the ticket ----------
const env = workerEnv();
const files = [{ slot: 'front', name: 'ปก.pdf', size: 30 }, { slot: 'back', name: 'back.png', size: 40 }];
const token = await signUploadToken(env, { ticketId: 'ticket-1', label: 'Nok-Card', files });
assert.deepEqual(await readUploadToken(env, token), { ticketId: 'ticket-1', label: 'Nok-Card', files, expires: (await readUploadToken(env, token)).expires });
assert.equal(await readUploadToken(env, token + 'x'), null, 'a changed signature is refused');
const [payload, signature] = token.split('.');
assert.equal(await readUploadToken(env, `${payload.slice(0, -2)}AA.${signature}`), null, 'a changed payload is refused');
assert.equal(await readUploadToken({ ...env, TURNSTILE_SECRET_KEY: 'another' }, token), null, 'a token from another secret is refused');
assert.equal(await readUploadToken(env, ''), null);
assert.equal(await readUploadToken(env, 'a.b.c'), null);
const old = await signUploadToken(env, { ticketId: 't', label: 'l', files }, Date.now() - 25 * 3600 * 1000);
assert.equal(await readUploadToken(env, old), null, 'a token is good for 24 hours');

// ---------- what is a file a customer may send ----------
assert.equal(sniffOriginal(PDF), 'application/pdf');
assert.equal(sniffOriginal(PNG), 'image/png');
assert.equal(sniffOriginal(new TextEncoder().encode('<svg xmlns="x"></svg>'), 'a.svg'), 'image/svg+xml');
assert.equal(sniffOriginal(new TextEncoder().encode('<svg xmlns="x"></svg>'), 'a.png'), '', 'an SVG must be named .svg');
assert.equal(sniffOriginal(new TextEncoder().encode('<svg><script>alert(1)</script></svg>'), 'a.svg'), '', 'no scripts in an SVG');
assert.equal(sniffOriginal(new TextEncoder().encode('<?php echo 1; ?>'), 'a.pdf'), '');
assert.equal(originalLabel({ name: 'สมชาย ใจดี / ../x', jobName: 'Card:1' }), 'สมชาย-ใจดี-x-Card-1');

// ---------- the request announces the originals ----------
const base = { key: '12345678-1234-1234-1234-123456789012', name: 'Nok', phone: '0812345678', lineId: '', quantity: 100, version: 2, jobName: 'Card', materialName: 'Art', hasBack: true,
  spec: { kind: 'rect', width: 90, height: 54, radius: 0, bleed: 3, paper: 'smooth', coating: 'none', finish: 'none' } };
const big = (slot, size = 30 * MB) => ({ slot, name: `${slot}.pdf`, size });
assert.deepEqual(validatePrintRequest({ ...base, originals: [big('front'), big('back')] }), []);
assert.deepEqual(validatePrintRequest(base), [], 'originals are optional');
for (const [why, originals] of [
  ['empty', []], ['not a list', 'x'], ['three files', [big('front'), big('back'), big('front')]], ['same side twice', [big('front'), big('front')]],
  ['unknown side', [big('mask')]], ['too big', [big('front', MAX_ORIGINAL_BYTES + 1)]], ['not big at all', [big('front', MAX_ARTWORK_BYTES)]],
  ['no name', [{ slot: 'front', name: '', size: 30 * MB }]], ['fractional size', [big('front', 30 * MB + 0.5)]],
]) assert.ok(validatePrintRequest({ ...base, originals }).length, `refused: ${why}`);
assert.ok(validatePrintRequest({ ...base, hasBack: false, originals: [big('back')] }).length, 'a back file without a back side is refused');
assert.match(printRequestBrief({ ...base, originals: [big('front')] }).note, /ไฟล์ต้นฉบับขนาดใหญ่: ด้านหน้า front\.pdf \(30\.0 MB\).*fetch-originals/);
assert.doesNotMatch(printRequestBrief(base).note, /ไฟล์ต้นฉบับขนาดใหญ่/);

// ---------- POST /public/print-requests gives the ticket ----------
const json = (body, status = 200) => Response.json(body, { status });
let stored = null;
const notionFetch = async (url, options) => { if (process.env.DBG) console.error('CALL', url);
  if (url.includes('siteverify')) return Response.json({ success: true, action: 'create_order', hostname: 'iprint.tchl.online' });
  if (url.endsWith('/data_sources/tickets')) return Response.json({ properties: { Name: { type: 'title' }, 'Order Key': { type: 'rich_text' }, 'จำนวนรวม': { type: 'number' } } });
  if (url.endsWith('/query')) return Response.json({ results: stored ? [stored] : [] });
  if (url.endsWith('/file_uploads')) return Response.json({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
  if (url.endsWith('/send')) return Response.json({ status: 'uploaded' });
  if (url.endsWith('/pages')) { stored = { id: 'aaaaaaaa-1111-2222-3333-444444444444', url: 'https://notion.so/x' }; return Response.json(stored); }
  throw new Error('unexpected ' + url);
};
const submit = async (data, testEnv) => {
  stored = null;
  const form = new FormData();
  form.set('request', JSON.stringify(data)); form.set('turnstileToken', 'ok');
  const pdf = '%PDF-1.7\nx\n%%EOF';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1"/></svg>';
  form.set('artworkPdf', new Blob([pdf]), 'a.pdf'); form.set('artworkSvg', new Blob([svg]), 'a.svg');
  if (data.hasBack) { form.set('backArtworkPdf', new Blob([pdf]), 'b.pdf'); form.set('backArtworkSvg', new Blob([svg]), 'b.svg'); }
  const response = await handlePrintRequest({ request: new Request('https://w.test/public/print-requests', { method: 'POST', body: form, headers: { Origin: ORIGIN } }), env: { PUBLIC_ORDER_ENABLED: 'true', ...testEnv, NOTION_TICKETS_DATA_SOURCE_ID: 'tickets' }, json, notionHeaders: { Authorization: 'Bearer t' }, fetchImpl: notionFetch });
  return { status: response.status, body: await response.json() };
};
let answer = await submit({ ...base, originals: [big('front'), big('back')] }, env);
assert.equal(answer.status, 200, JSON.stringify(answer.body));
const issued = await readUploadToken(env, answer.body.uploadToken);
assert.equal(issued.ticketId, 'aaaaaaaa-1111-2222-3333-444444444444');
assert.equal(issued.label, 'Nok-Card');
assert.deepEqual(issued.files.map(f => f.slot), ['front', 'back']);
answer = await submit(base, env);
assert.equal(answer.body.uploadToken, undefined, 'no originals announced: no ticket');
answer = await submit({ ...base, originals: [big('front')] }, { ...env, MEDIA: undefined });
assert.equal(answer.status, 200);
assert.equal(answer.body.uploadToken, undefined, 'no R2 configured: the request still goes through, without a ticket');

// ---------- PUT the file ----------
const put = async ({ testEnv = env, slot = 'front', body, token: bearer, origin = ORIGIN, length }) => {
  const headers = { Origin: origin, 'Content-Length': String(length ?? body.length) };
  if (bearer !== null) headers.Authorization = `Bearer ${bearer ?? token}`;
  const response = await worker.fetch(new Request(`https://w.test/public/print-requests/originals/${slot}`, { method: 'PUT', headers, body }), testEnv);
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const ticket = await signUploadToken(env, { ticketId: 'ticket-1', label: 'Nok-Card', files: [{ slot: 'front', name: 'ปก.pdf', size: 60 }, { slot: 'back', name: 'back.png', size: 40 }] });
const sized = (head, size) => withSize(head, size);
let r = await put({ body: sized(PDF, 60), token: ticket });
assert.equal(r.status, 200, JSON.stringify(r.body));
const key = [...env.MEDIA.objects.keys()][0];
assert.ok(key.startsWith(ORIGINAL_PREFIX + 'ticket-1/front-'), key);
assert.equal(env.MEDIA.objects.get(key).customMetadata.label, 'Nok-Card-ticket-1');
assert.equal(env.MEDIA.objects.get(key).bytes.length, 60);
r = await put({ slot: 'back', body: sized(PNG, 40), token: ticket });
assert.equal(r.status, 200);

const before = env.MEDIA.objects.size;
assert.equal((await put({ body: sized(PDF, 60), token: null })).status, 401, 'no ticket');
assert.equal((await put({ body: sized(PDF, 60), token: 'nonsense' })).status, 401, 'bad ticket');
assert.equal((await put({ body: sized(PDF, 60), token: ticket, origin: 'https://evil.example' })).status, 403, 'other website');
assert.equal((await put({ slot: 'back', body: sized(PNG, 41), token: ticket })).status, 400, 'size must match what the request said');
assert.equal((await put({ body: sized(PDF, 70), token: ticket })).status, 400);
const onlyFront = await signUploadToken(env, { ticketId: 'ticket-2', label: 'x', files: [{ slot: 'front', name: 'a.pdf', size: 60 }] });
assert.equal((await put({ slot: 'back', body: sized(PNG, 60), token: onlyFront })).status, 404, 'a side that was not announced');
const notPdf = await signUploadToken(env, { ticketId: 'ticket-3', label: 'x', files: [{ slot: 'front', name: 'a.pdf', size: 60 }] });
assert.equal((await put({ body: sized(new TextEncoder().encode('<?php echo 1;'), 60), token: notPdf })).status, 415, 'what is not a PDF / picture is refused');
assert.equal(env.MEDIA.objects.size, before, 'and it is not kept');
const huge = await signUploadToken(env, { ticketId: 'ticket-4', label: 'x', files: [{ slot: 'front', name: 'a.pdf', size: MAX_ORIGINAL_BYTES + 1 }] });
assert.equal((await put({ body: new Uint8Array(8), token: huge, length: MAX_ORIGINAL_BYTES + 1 })).status, 413, 'over 90 MB');
assert.equal((await put({ testEnv: { ...env, MEDIA: undefined }, body: sized(PDF, 60), token: ticket })).status, 503);

// ---------- the 10 GB cap ----------
const capped = { ...workerEnv(), ORIGINALS_MAX_TOTAL_BYTES: '100', MEDIA: new FakeBucket() };
const capTicket = await signUploadToken(capped, { ticketId: 'cap-1', label: 'x', files: [{ slot: 'front', name: 'a.pdf', size: 60 }, { slot: 'back', name: 'b.pdf', size: 60 }] });
assert.equal((await put({ testEnv: capped, body: sized(PDF, 60), token: capTicket })).status, 200);
r = await put({ testEnv: capped, slot: 'back', body: sized(PDF, 60), token: capTicket });
assert.equal(r.status, 507, 'no room left: the upload is refused, nothing is written');
assert.match(r.body.error, /LINE/);
assert.deepEqual(await storedBytes(capped), { total: 60, count: 1 });

// ---------- staff ----------
const staff = async (path, { method = 'GET', key = 'staff-key' } = {}) => {
  const response = await worker.fetch(new Request(`https://w.test${path}`, { method, headers: key ? { 'X-API-Key': key } : {} }), env);
  return response;
};
assert.equal((await staff('/staff/originals', { key: null })).status, 401);
assert.equal((await staff('/staff/originals', { key: 'wrong' })).status, 401);
assert.equal((await staff(`/staff/originals/file?key=${encodeURIComponent(key)}`, { key: null })).status, 401);
assert.equal((await staff(`/staff/originals/file?key=${encodeURIComponent(key)}`, { method: 'DELETE', key: null })).status, 401);
const list = await (await staff('/staff/originals')).json();
assert.equal(list.files.length, 2);
assert.deepEqual(list.files.map(f => f.slot).sort(), ['back', 'front']);
assert.equal(list.files.find(f => f.slot === 'front').label, 'Nok-Card-ticket-1');
assert.equal(list.files.find(f => f.slot === 'front').name, 'ปก.pdf');
assert.deepEqual(list.storage, { bytes: 100, files: 2, capBytes: 10 * 1024 ** 3, warning: false, full: false });
const dl = await staff(`/staff/originals/file?key=${encodeURIComponent(key)}`);
assert.equal(dl.status, 200);
assert.equal(dl.headers.get('Content-Length'), '60');
assert.equal((await dl.arrayBuffer()).byteLength, 60);
for (const bad of ['gallery/x.png', '../secret', 'incoming/../gallery/x.png', '']) {
  assert.ok([404].includes((await staff(`/staff/originals/file?key=${encodeURIComponent(bad)}`)).status), `not served: ${bad}`);
  assert.equal((await staff(`/staff/originals/file?key=${encodeURIComponent(bad)}`, { method: 'DELETE' })).status, 404, `not deleted: ${bad}`);
}
assert.equal((await staff(`/staff/originals/file?key=${encodeURIComponent(key)}`, { method: 'DELETE' })).status, 200);
assert.equal((await (await staff('/staff/originals')).json()).files.length, 1);
// the warning at 80% and "full" at 100% of the cap
const near = { ...env, ORIGINALS_MAX_TOTAL_BYTES: '40' };
const nearList = await (await worker.fetch(new Request('https://w.test/staff/originals', { headers: { 'X-API-Key': 'staff-key' } }), near)).json();
assert.deepEqual([nearList.storage.warning, nearList.storage.full], [true, true]);
const roomy = { ...env, ORIGINALS_MAX_TOTAL_BYTES: '100' };
const roomyList = await (await worker.fetch(new Request('https://w.test/staff/originals', { headers: { 'X-API-Key': 'staff-key' } }), roomy)).json();
assert.deepEqual([roomyList.storage.warning, roomyList.storage.full], [false, false], '40 of 100 bytes: no warning yet');
const eighty = { ...env, ORIGINALS_MAX_TOTAL_BYTES: '50' };
assert.equal((await (await worker.fetch(new Request('https://w.test/staff/originals', { headers: { 'X-API-Key': 'staff-key' } }), eighty)).json()).storage.warning, true, '40 of 50 bytes = 80%: warning');

// ---------- CORS: the browser may send the ticket ----------
const preflight = await worker.fetch(new Request('https://w.test/public/print-requests/originals/front', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization' } }), env);
assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/);
assert.match(preflight.headers.get('Access-Control-Allow-Methods'), /PUT/);

console.log('Originals test passed');
