import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './index.js';
import { handleDraftBrief } from './routes/brief.js';
import { createLineMessageRepository } from './repositories/d1-line-message-repository.js';
import { BriefSummaryError } from './services/brief-summarizer.js';

// End to end through the Worker: LINE webhook -> D1 -> Draft Brief -> owner review -> Notion ticket.
// D1 is the real migration running on SQLite; Claude and Notion are fakes.

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 20, 8, 0, 0);
const SECRET = 'line-secret';

function fakeD1() {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync(new URL('./migrations/0001_line_messages.sql', import.meta.url), 'utf8'));
  const prepare = sql => {
    let params = [];
    const statement = {
      bind: (...values) => { params = values; return statement; },
      first: async () => database.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: database.prepare(sql).all(...params).map(row => ({ ...row })) }),
      exec: () => database.prepare(sql).run(...params)
    };
    return statement;
  };
  return { prepare, batch: async statements => { database.exec('BEGIN'); try { statements.forEach(item => item.exec()); database.exec('COMMIT'); } catch (error) { database.exec('ROLLBACK'); throw error; } return []; }, database };
}

const signKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const sign = async body => Buffer.from(await crypto.subtle.sign('HMAC', signKey, new TextEncoder().encode(body))).toString('base64');

const db = fakeD1();
const env = {
  NOTION_TOKEN: 'notion-token', WRITE_API_KEY: 'staff-key', NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-id',
  NOTION_DATA_SOURCE_ID: 'a', NOTION_MATERIALS_DATA_SOURCE_ID: 'b', NOTION_SERVICES_DATA_SOURCE_ID: 'c',
  NOTION_CUSTOMERS_DATA_SOURCE_ID: 'd', NOTION_QUOTES_DATA_SOURCE_ID: 'e', NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'f',
  BRIEF_DB: db, LINE_CHANNEL_SECRET: SECRET, LINE_CHANNEL_ACCESS_TOKEN: 'line-token'
};

const originalFetch = globalThis.fetch;
let outbound = [];
let notionExisting = null;
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  outbound.push({ url: target, options });
  if (target.startsWith('https://api.line.me/v2/bot/profile/')) {
    return target.endsWith('/Ubroken') ? new Response('nope', { status: 500 }) : Response.json({ displayName: 'สมชาย ใจดี' });
  }
  if (target.endsWith('/v1/data_sources/tickets-id')) {
    return Response.json({ properties: { 'ชื่องาน': { type: 'title' }, 'Order Key': { type: 'rich_text' }, 'จำนวนรวม': { type: 'number' } } });
  }
  if (target.endsWith('/query')) return Response.json({ results: notionExisting ? [notionExisting] : [] });
  if (target === 'https://api.notion.com/v1/pages') return Response.json({ id: 'ticket-1', url: 'https://notion.so/ticket-1' });
  return Response.json({ object: 'error' }, { status: 500 });
};

const call = (method, path, { body, headers = {}, environment = env } = {}) => worker.fetch(new Request(`https://worker.test${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
}), environment);
const staff = { 'X-API-Key': 'staff-key' };

const textEvent = (id, userId, text, timestamp) => ({ type: 'message', timestamp, source: { type: 'user', userId }, message: { id, type: 'text', text } });
async function webhook(events, { signature, environment } = {}) {
  const body = JSON.stringify({ destination: 'Ubot', events });
  return call('POST', '/line/webhook', { body, headers: { 'X-Line-Signature': signature ?? await sign(body) }, environment });
}

try {
  // ---------- webhook: only LINE can write ----------
  let response = await webhook([textEvent('m0', 'U1', 'x', NOW)], { signature: 'AAAA' });
  assert.equal(response.status, 403);
  response = await call('POST', '/line/webhook', { body: '{"events":[]}' });
  assert.equal(response.status, 403, 'no signature');
  response = await webhook([], { environment: { ...env, LINE_CHANNEL_SECRET: '' } });
  assert.equal(response.status, 503, 'unconfigured webhook fails closed');
  response = await webhook([], { environment: { ...env, BRIEF_DB: undefined } });
  assert.equal(response.status, 503);
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM line_messages').get().n, 0, 'rejected requests store nothing');

  const badJson = '{"events":';
  assert.equal((await call('POST', '/line/webhook', { body: badJson, headers: { 'X-Line-Signature': await sign(badJson) } })).status, 400);
  const noEvents = '{"destination":"x"}';
  assert.equal((await call('POST', '/line/webhook', { body: noEvents, headers: { 'X-Line-Signature': await sign(noEvents) } })).status, 400);
  const huge = JSON.stringify({ events: [], pad: 'x'.repeat(1024 * 1024) });
  assert.equal((await call('POST', '/line/webhook', { body: huge, headers: { 'X-Line-Signature': await sign(huge) } })).status, 413);

  // LINE's own "verify" button sends no events and expects 200
  response = await webhook([]);
  assert.equal(response.status, 200);

  // ---------- webhook: stores customer messages ----------
  const chatEvents = [
    textEvent('m1', 'U1', 'เอาสติกเกอร์ 5x5 เหมือนรอบก่อนครับ', NOW - 5 * 60 * 1000),
    textEvent('m2', 'U1', 'รอบนี้ 500 ดวง ใช้ไฟล์ใหม่ ขอรับวันศุกร์', NOW - 4 * 60 * 1000),
    { type: 'message', timestamp: NOW - 3 * 60 * 1000, source: { type: 'user', userId: 'U1' }, message: { id: 'm3', type: 'image' } },
    { type: 'message', timestamp: NOW, source: { type: 'group', groupId: 'G1', userId: 'U1' }, message: { id: 'g1', type: 'text', text: 'group chat' } },
    textEvent('m9', 'U2', 'สวัสดีครับ ขอราคานามบัตร', NOW - 60 * 1000)
  ];
  const realNow = Date.now;
  Date.now = () => NOW;
  outbound = [];
  response = await webhook(chatEvents);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, stored: 4 }, 'group events are ignored');
  const profileCalls = outbound.filter(item => item.url.includes('api.line.me'));
  assert.equal(profileCalls.length, 2, 'one profile lookup per new customer');
  assert.equal(profileCalls[0].options.headers.Authorization, 'Bearer line-token');

  // a redelivered webhook cannot duplicate messages or repeat the profile lookup
  outbound = [];
  await webhook(chatEvents);
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM line_messages').get().n, 4);
  assert.equal(outbound.filter(item => item.url.includes('api.line.me')).length, 0);

  // a failed profile lookup leaves the name blank instead of failing the webhook
  response = await webhook([textEvent('m20', 'Ubroken', 'hello', NOW - 1000)]);
  assert.equal(response.status, 200);
  assert.equal(db.database.prepare("SELECT display_name FROM line_conversations WHERE id = 'Ubroken'").get().display_name, '');

  // ---------- conversations ----------
  assert.equal((await call('GET', '/staff/line/conversations')).status, 401);
  response = await call('GET', '/staff/line/conversations', { headers: staff });
  let data = await response.json();
  assert.deepEqual(data.conversations.map(item => item.id), ['Ubroken', 'U2', 'U1'], 'newest conversation first');
  const u1 = data.conversations.find(item => item.id === 'U1');
  assert.equal(u1.displayName, 'สมชาย ใจดี');
  assert.equal(u1.preview, '[รูปภาพ]');
  assert.equal(u1.lastMessageAt, NOW - 3 * 60 * 1000);

  // ---------- unsend removes the message and its preview ----------
  await webhook([{ type: 'unsend', timestamp: NOW, source: { type: 'user', userId: 'U1' }, unsend: { messageId: 'm3' } }]);
  data = await (await call('GET', '/staff/line/conversations', { headers: staff })).json();
  assert.equal(data.conversations.find(item => item.id === 'U1').preview, 'รอบนี้ 500 ดวง ใช้ไฟล์ใหม่ ขอรับวันศุกร์');

  // ---------- retention: old messages disappear on the next webhook ----------
  const repository = createLineMessageRepository(db);
  await repository.saveMessage({ id: 'old', conversationId: 'U3', sentAt: NOW - 40 * DAY, kind: 'text', text: 'ข้อความเก่า' }, 'เก่า');
  assert.ok(await repository.getConversation('U3'));
  await webhook([textEvent('m30', 'U2', 'อีกข้อความ', NOW - 30 * 1000)]);
  assert.equal(await repository.getConversation('U3'), null, 'conversation older than the retention window is gone');
  assert.equal(db.database.prepare("SELECT COUNT(*) AS n FROM line_messages WHERE id = 'old'").get().n, 0);
  Date.now = realNow;

  // ---------- Draft Brief ----------
  const fakeAi = { calls: [], raw: null, error: null };
  const deps = {
    now: () => NOW,
    randomUUID: () => 'brief-key-0001',
    summarize: async input => {
      fakeAi.calls.push(input);
      if (fakeAi.error) throw fakeAi.error;
      return { raw: fakeAi.raw, model: 'fake-model' };
    }
  };
  const draft = (body, environment = env) => handleDraftBrief({
    request: new Request('https://worker.test/staff/briefs/draft', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }),
    env: environment,
    json: (payload, status = 200) => Response.json(payload, { status }),
    deps
  });
  const field = (value, status, evidence = '', reason = '') => ({ value, status, evidence, reason });
  fakeAi.raw = {
    fields: {
      product: field('Sticker', 'confirmed', 'สติกเกอร์'),
      size: field('5 x 5 cm', 'confirmed', '5x5'),
      quantity: field('500 ดวง', 'confirmed', '500 ดวง'),
      material: field('เหมือนรอบก่อน', 'confirmed', 'เหมือนรอบก่อน'),
      file: field('ใช้ไฟล์ใหม่', 'confirmed', 'ใช้ไฟล์ใหม่'),
      dueDate: field('วันศุกร์', 'confirmed', 'ขอรับวันศุกร์')
    },
    note: 'อ้างอิงงานเดิม'
  };

  response = await draft({ conversationId: 'U1', ownerNote: 'ร้านแจ้งราคาแล้ว' });
  assert.equal(response.status, 200);
  data = await response.json();
  assert.equal(data.briefKey, 'brief-key-0001');
  assert.equal(data.model, 'fake-model');
  assert.deepEqual(data.conversation, { id: 'U1', displayName: 'สมชาย ใจดี' });
  assert.equal(data.brief.customer, 'สมชาย ใจดี', 'the customer comes from the LINE profile, not from the model');
  assert.deepEqual(data.groups, { confirmed: ['product', 'size', 'quantity', 'file', 'dueDate'], needConfirmation: ['material'], missing: [] });
  assert.equal(data.brief.fields.material.status, 'need_confirmation', 'same as before is never confirmed');
  assert.deepEqual(data.messages.map(item => item.role), ['customer', 'customer', 'owner']);
  assert.equal(fakeAi.calls[0].chatMessages.length, 3, 'the model sees the customer chat and the owner note, and nothing from other customers');
  assert.ok(fakeAi.calls[0].chatMessages.every(item => !item.text.includes('นามบัตร')));

  // only the newest N messages are read, oldest first
  for (let index = 0; index < 12; index += 1) await repository.saveMessage({ id: `bulk${index}`, conversationId: 'U4', sentAt: NOW - (20 - index) * 1000, kind: 'text', text: `ข้อความ ${index}` }, 'ลูกค้า 4');
  await draft({ conversationId: 'U4', limit: 5 });
  assert.deepEqual(fakeAi.calls.at(-1).chatMessages.map(item => item.text), ['ข้อความ 7', 'ข้อความ 8', 'ข้อความ 9', 'ข้อความ 10', 'ข้อความ 11']);

  // messages older than the window are not summarised
  await repository.saveMessage({ id: 'stale', conversationId: 'U5', sentAt: NOW - 20 * DAY, kind: 'text', text: 'นานแล้ว' }, 'เก่ามาก');
  response = await draft({ conversationId: 'U5' });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, 'NO_RECENT_MESSAGES');

  assert.equal((await draft({ conversationId: 'nobody' })).status, 404);
  assert.equal((await draft({})).status, 400);
  assert.equal((await draft('not json')).status, 400);
  assert.equal((await draft({ conversationId: 'U1' }, { ...env, BRIEF_DB: undefined })).status, 503);

  fakeAi.error = new BriefSummaryError('AI declined to summarize this chat');
  response = await draft({ conversationId: 'U1' });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'AI_SUMMARY_FAILED');
  fakeAi.error = null;

  // through the Worker: routing, authorization and validation (the real summarizer is never reached)
  assert.equal((await call('POST', '/staff/briefs/draft', { body: { conversationId: 'U1' } })).status, 401);
  assert.equal((await call('POST', '/staff/briefs/draft', { body: {}, headers: staff })).status, 400);
  assert.equal((await call('POST', '/staff/briefs/draft', { body: { conversationId: 'nobody' }, headers: staff })).status, 404);
  response = await call('POST', '/staff/briefs/draft', { body: { conversationId: 'U1' }, headers: staff });
  assert.equal(response.status, 503, 'no ANTHROPIC_API_KEY');
  data = await response.json();
  assert.equal(data.code, 'AI_SUMMARY_FAILED');
  assert.match(data.error, /ANTHROPIC_API_KEY/);

  // ---------- Create Ticket ----------
  const reviewed = {
    reviewed: true,
    briefKey: 'brief-key-0001',
    brief: {
      customer: 'สมชาย ใจดี', note: 'อ้างอิงงานเดิม',
      fields: {
        product: field('Sticker', 'confirmed', 'สติกเกอร์'),
        size: field('5 x 5 cm', 'confirmed', '5x5'),
        quantity: field('500 ดวง', 'confirmed', '500 ดวง'),
        material: field('PP ขาวเงา', 'need_confirmation', '', 'เจ้าของแก้ไข'),
        file: field('ใช้ไฟล์ใหม่', 'confirmed', 'ใช้ไฟล์ใหม่'),
        dueDate: field('วันศุกร์', 'confirmed', 'ขอรับวันศุกร์')
      }
    }
  };
  const ticket = body => call('POST', '/staff/briefs/ticket', { body, headers: staff });

  assert.equal((await call('POST', '/staff/briefs/ticket', { body: reviewed })).status, 401);
  outbound = [];
  response = await ticket({ ...reviewed, reviewed: false });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'REVIEW_REQUIRED');
  assert.equal((await ticket({ ...reviewed, reviewed: 'true' })).status, 400, 'reviewed must be exactly true');
  assert.equal((await ticket({ brief: reviewed.brief, briefKey: 'brief-key-0001' })).status, 400, 'review flag missing');
  assert.equal((await ticket({ ...reviewed, briefKey: 'short' })).status, 400);
  assert.equal((await ticket({ ...reviewed, briefKey: 'has spaces and/slashes' })).status, 400);
  response = await ticket({ reviewed: true, briefKey: 'brief-key-0001', brief: { fields: {} } });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'EMPTY_BRIEF');
  assert.equal((await call('POST', '/staff/briefs/ticket', { body: 'not json', headers: staff })).status, 400);
  assert.equal(outbound.length, 0, 'nothing reaches Notion until a reviewed, valid brief arrives');

  response = await ticket(reviewed);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, id: 'ticket-1', url: 'https://notion.so/ticket-1', deduplicated: false });
  const page = JSON.parse(outbound.find(item => item.url.endsWith('/v1/pages')).options.body);
  assert.equal(page.properties['ชื่องาน'].title[0].text.content, '[LINE] สมชาย ใจดี · Sticker × 500 ดวง');
  assert.equal(page.properties['Order Key'].rich_text[0].text.content, 'BRIEF-brief-key-0001');
  assert.equal(page.properties['จำนวนรวม'].number, 500);

  // retry of the same brief: no second ticket
  notionExisting = { id: 'ticket-1', url: 'https://notion.so/ticket-1' };
  outbound = [];
  response = await ticket(reviewed);
  assert.equal((await response.json()).deduplicated, true);
  assert.ok(!outbound.some(item => item.url.endsWith('/v1/pages')));
  notionExisting = null;

  // a Notion failure is a 502 (never Notion's own 401), and says so
  globalThis.fetch = async () => Response.json({ object: 'error', message: 'unauthorized' }, { status: 401 });
  response = await ticket(reviewed);
  data = await response.json();
  assert.equal(response.status, 502);
  assert.equal(data.code, 'NOTION_TICKET_FAILED');
  assert.equal(data.notionStatus, 401);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Brief worker test passed');
