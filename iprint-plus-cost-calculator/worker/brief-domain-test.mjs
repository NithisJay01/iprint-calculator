import assert from 'node:assert/strict';
import {
  FIELD_KEYS, briefTitle, emptyBrief, groupBrief, hasBriefContent, missingInformation, parseQuantity, sanitizeBrief
} from '../shared/brief-model.js';
import {
  REASONS, buildChatMessages, clampInteger, formatTranscript, isReferenceOnly, normalizeAiBrief
} from './domain/brief.js';
import { toStoredMessage, toUnsentMessageId, verifyLineSignature } from './services/line.js';
import { BRIEF_OUTPUT_SCHEMA, BriefSummaryError, DEFAULT_BRIEF_MODEL, summarizeConversation } from './services/brief-summarizer.js';
import { buildBriefBlocks, createBriefTicket } from './services/brief-ticket.js';

const field = (value, status, evidence = '', reason = '') => ({ value, status, evidence, reason });
const aiOutput = (fields, note = '') => ({
  fields: { ...Object.fromEntries(FIELD_KEYS.map(key => [key, field('', 'missing')])), ...fields },
  note
});
const chat = (...texts) => texts.map((text, index) => ({ role: 'customer', at: Date.UTC(2026, 8, 20, 7, index), text }));

// ---------- the example from the brief: "เหมือนรอบก่อน" must stay Need Confirmation ----------
{
  const messages = chat('เอาสติกเกอร์ 5x5 เหมือนรอบก่อนครับ รอบนี้ 500 ดวง ใช้ไฟล์ใหม่ ขอรับวันศุกร์');
  const brief = normalizeAiBrief(aiOutput({
    product: field('Sticker', 'confirmed', 'สติกเกอร์'),
    size: field('5 x 5 cm', 'confirmed', '5x5'),
    quantity: field('500 ดวง', 'confirmed', '500 ดวง'),
    // the model wrongly called this confirmed
    material: field('เหมือนรอบก่อน', 'confirmed', 'เหมือนรอบก่อน'),
    file: field('ใช้ไฟล์ใหม่', 'confirmed', 'ใช้ไฟล์ใหม่'),
    dueDate: field('วันศุกร์', 'confirmed', 'ขอรับวันศุกร์')
  }, 'อ้างอิงงานเดิม'), { chatMessages: messages, customer: 'สมชาย' });

  const groups = groupBrief(brief);
  assert.deepEqual(groups.confirmed, ['product', 'size', 'quantity', 'file', 'dueDate']);
  assert.deepEqual(groups.needConfirmation, ['material']);
  assert.deepEqual(groups.missing, []);
  assert.equal(brief.customer, 'สมชาย');
  assert.equal(brief.note, 'อ้างอิงงานเดิม');
  assert.equal(brief.fields.material.status, 'need_confirmation');
  assert.match(brief.fields.material.reason, new RegExp(REASONS.reference));
}

// ---------- guards ----------
{
  const messages = chat('อยากได้นามบัตร 500 ใบ', 'กระดาษ  Art   Card ครับ');

  // a quote that is not in the chat can not confirm anything, and is not shown
  let brief = normalizeAiBrief(aiOutput({
    product: field('นามบัตร', 'confirmed', 'นามบัตร'),
    quantity: field('1000 ใบ', 'confirmed', '1000 ใบ'),
    material: field('Art Card', 'need_confirmation', 'กระดาษอาร์ตการ์ด')
  }), { chatMessages: messages, customer: '' });
  assert.equal(brief.fields.product.status, 'confirmed');
  assert.equal(brief.fields.quantity.status, 'need_confirmation');
  assert.equal(brief.fields.quantity.evidence, '', 'an unverifiable quote is dropped');
  assert.match(brief.fields.quantity.reason, new RegExp(REASONS.noEvidence));
  assert.equal(brief.fields.material.evidence, '');

  // whitespace and case differences do not break a genuine quote
  brief = normalizeAiBrief(aiOutput({ material: field('Art Card', 'confirmed', 'กระดาษ Art Card') }), { chatMessages: messages, customer: '' });
  assert.equal(brief.fields.material.status, 'confirmed');

  // confirmed without any quote is not confirmed
  brief = normalizeAiBrief(aiOutput({ product: field('นามบัตร', 'confirmed', '') }), { chatMessages: messages, customer: '' });
  assert.equal(brief.fields.product.status, 'need_confirmation');

  // missing carries no value, whatever the model wrote
  brief = normalizeAiBrief(aiOutput({ size: field('9 x 5.5 cm', 'missing', 'x') }), { chatMessages: messages, customer: '' });
  assert.deepEqual(brief.fields.size, { value: '', status: 'missing', evidence: '', reason: '' });

  // an empty value is missing even when the model said confirmed
  brief = normalizeAiBrief(aiOutput({ file: field('', 'confirmed', 'นามบัตร') }), { chatMessages: messages, customer: '' });
  assert.equal(brief.fields.file.status, 'missing');

  // "same as before" in the value catches a long quote that also contains real words
  const reference = chat('สติกเกอร์ 5x5 เหมือนรอบก่อน');
  brief = normalizeAiBrief(aiOutput({ material: field('เหมือนรอบก่อน', 'confirmed', 'สติกเกอร์ 5x5 เหมือนรอบก่อน') }), { chatMessages: reference, customer: '' });
  assert.equal(brief.fields.material.status, 'need_confirmation');

  // ...but a size stated next to "same as before" stays confirmed
  brief = normalizeAiBrief(aiOutput({ size: field('5 x 5 cm', 'confirmed', '5x5') }), { chatMessages: reference, customer: '' });
  assert.equal(brief.fields.size.status, 'confirmed');

  // garbage from the model never breaks the shape
  brief = normalizeAiBrief({ fields: { product: 'x', size: null, quantity: { value: 5, status: 'bogus' } }, note: 42 }, { chatMessages: messages, customer: '' });
  assert.deepEqual(Object.keys(brief.fields), FIELD_KEYS);
  assert.equal(brief.fields.quantity.value, '5');
  assert.equal(brief.fields.quantity.status, 'need_confirmation');
  assert.equal(brief.note, '42');
  assert.deepEqual(Object.keys(normalizeAiBrief(null, { chatMessages: messages, customer: '' }).fields), FIELD_KEYS);
}

assert.equal(isReferenceOnly('เหมือนเดิมครับ'), true);
assert.equal(isReferenceOnly('เหมือนรอบก่อนนะคะ'), true);
assert.equal(isReferenceOnly('ขนาดเดิม'), true);
assert.equal(isReferenceOnly('same as last time'), true);
assert.equal(isReferenceOnly('5x5 เหมือนเดิม'), false);
assert.equal(isReferenceOnly('กระดาษการ์ดขาว'), false);
assert.equal(isReferenceOnly(''), false);

// ---------- brief model ----------
{
  // the owner types a value into a missing field: keep it, but ask for confirmation
  const brief = sanitizeBrief({ customer: '  บริษัท A  ', fields: { size: { value: '10x10', status: 'missing' }, product: { value: '', status: 'confirmed' } } });
  assert.equal(brief.customer, 'บริษัท A');
  assert.equal(brief.fields.size.status, 'need_confirmation');
  assert.equal(brief.fields.product.status, 'missing');

  // missing information lists what nobody told us; a blank customer counts too
  assert.ok(missingInformation(brief).includes('Product'));
  assert.ok(!missingInformation(brief).includes('Customer'));
  assert.equal(groupBrief(emptyBrief()).missing[0], 'customer');
  assert.deepEqual(missingInformation(emptyBrief()), ['Customer', 'Product', 'Size', 'Quantity', 'Material', 'File', 'Due Date']);

  // limits
  assert.equal(sanitizeBrief({ note: 'x'.repeat(5000) }).note.length, 1500);
  assert.equal(sanitizeBrief({ fields: { product: { value: 'y'.repeat(900), status: 'confirmed' } } }).fields.product.value.length, 500);
  assert.equal(sanitizeBrief(undefined).customer, '');

  assert.equal(hasBriefContent(emptyBrief()), false);
  assert.equal(hasBriefContent({ ...emptyBrief(), note: 'x' }), true);
  assert.equal(hasBriefContent(brief), true);

  assert.equal(briefTitle(emptyBrief()), '[LINE] ลูกค้า LINE · งานใหม่');
  assert.equal(briefTitle(sanitizeBrief({ customer: 'สมชาย', fields: { product: { value: 'Sticker', status: 'confirmed' }, quantity: { value: '500 ดวง', status: 'confirmed' } } })), '[LINE] สมชาย · Sticker × 500 ดวง');

  assert.equal(parseQuantity('500 ดวง'), 500);
  assert.equal(parseQuantity('1,000 ชิ้น'), 1000);
  assert.equal(parseQuantity('500 หรือ 1000'), null);
  assert.equal(parseQuantity('หลายร้อย'), null);
  assert.equal(parseQuantity('0'), null);
}

assert.equal(clampInteger('500', 40, 5, 100), 100);
assert.equal(clampInteger('1', 40, 5, 100), 5);
assert.equal(clampInteger(undefined, 40, 5, 100), 40);
assert.equal(clampInteger('abc', 40, 5, 100), 40);

// ---------- transcript ----------
{
  const lineMessages = [{ sentAt: Date.UTC(2026, 8, 20, 7, 3), text: 'สวัสดีครับ\nขอราคา' }];
  const messages = buildChatMessages(lineMessages, '  ร้านแจ้งว่าใช้เวลา 3 วัน  ');
  assert.deepEqual(messages.map(item => item.role), ['customer', 'owner']);
  assert.equal(formatTranscript(messages), '[2026-09-20 14:03] ลูกค้า: สวัสดีครับ / ขอราคา\n[2026-09-20 14:03] เจ้าของร้าน: ร้านแจ้งว่าใช้เวลา 3 วัน');
  assert.equal(buildChatMessages(lineMessages, '   ').length, 1);
}

// ---------- LINE signature and events ----------
{
  const secret = 'channel-secret';
  const body = '{"events":[]}';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))).toString('base64');

  assert.equal(await verifyLineSignature(body, signature, secret), true);
  assert.equal(await verifyLineSignature(`${body} `, signature, secret), false, 'a changed body is rejected');
  assert.equal(await verifyLineSignature(body, signature, 'other-secret'), false);
  assert.equal(await verifyLineSignature(body, '', secret), false);
  assert.equal(await verifyLineSignature(body, undefined, secret), false);
  assert.equal(await verifyLineSignature(body, '***not base64***', secret), false);
  assert.equal(await verifyLineSignature(body, signature, ''), false, 'no secret configured means nothing is trusted');

  const source = { type: 'user', userId: 'U1' };
  assert.deepEqual(toStoredMessage({ type: 'message', timestamp: 1000, source, message: { id: 'm1', type: 'text', text: 'สวัสดี' } }),
    { id: 'm1', conversationId: 'U1', sentAt: 1000, kind: 'text', text: 'สวัสดี' });
  assert.equal(toStoredMessage({ type: 'message', timestamp: 1, source, message: { id: 'm2', type: 'image' } }).text, '[รูปภาพ]');
  assert.equal(toStoredMessage({ type: 'message', timestamp: 1, source, message: { id: 'm3', type: 'file', fileName: 'logo.ai' } }).text, '[ไฟล์แนบ: logo.ai]');
  assert.equal(toStoredMessage({ type: 'message', timestamp: 1, source, message: { id: 'm4', type: 'text', text: 'x'.repeat(9000) } }).text.length, 2000);
  assert.equal(toStoredMessage({ type: 'message', timestamp: 1, source: { type: 'group', groupId: 'G1', userId: 'U1' }, message: { id: 'm5', type: 'text', text: 'hi' } }), null, 'groups are ignored in V1');
  assert.equal(toStoredMessage({ type: 'follow', source }), null);
  assert.equal(toStoredMessage({ type: 'message', source, message: { type: 'text', text: 'no id' } }), null);
  assert.equal(toStoredMessage({ type: 'message', source, message: { id: 'm6', type: 'text', text: '   ' } }), null);
  assert.equal(toUnsentMessageId({ type: 'unsend', unsend: { messageId: 'm1' } }), 'm1');
  assert.equal(toUnsentMessageId({ type: 'message' }), null);
}

// ---------- summarizer (fake Claude client) ----------
{
  const requests = [];
  const clientReturning = response => ({ beta: { messages: { create: async params => { requests.push(params); return response; } } } });
  const goodJson = JSON.stringify(aiOutput({ product: field('Sticker', 'confirmed', 'สติกเกอร์') }));
  const messages = chat('สติกเกอร์');

  const result = await summarizeConversation({
    chatMessages: messages, env: {},
    client: clientReturning({ stop_reason: 'end_turn', model: 'claude-opus-5', content: [{ type: 'text', text: goodJson }] })
  });
  assert.equal(result.raw.fields.product.value, 'Sticker');
  assert.equal(requests[0].model, DEFAULT_BRIEF_MODEL);
  assert.equal(requests[0].model, 'claude-opus-5');
  assert.equal(requests[0].fallbacks, 'default');
  assert.deepEqual(requests[0].betas, ['server-side-fallback-2026-07-01']);
  assert.equal(requests[0].output_config.format.type, 'json_schema');
  assert.equal(requests[0].output_config.format.schema, BRIEF_OUTPUT_SCHEMA);
  assert.match(requests[0].messages[0].content, /<line_chat>\n\[2026-09-20 14:00\] ลูกค้า: สติกเกอร์\n<\/line_chat>/);
  assert.match(requests[0].system, /ห้ามเดาข้อมูลเอง/);
  assert.equal(BRIEF_OUTPUT_SCHEMA.additionalProperties, false);
  assert.deepEqual(BRIEF_OUTPUT_SCHEMA.properties.fields.required, FIELD_KEYS);

  await summarizeConversation({ chatMessages: messages, env: { BRIEF_AI_MODEL: 'claude-haiku-4-5' }, client: clientReturning({ stop_reason: 'end_turn', content: [{ type: 'text', text: goodJson }] }) });
  assert.equal(requests[1].model, 'claude-haiku-4-5', 'BRIEF_AI_MODEL overrides the default model');

  const failure = async (response, expected) => {
    await assert.rejects(
      () => summarizeConversation({ chatMessages: messages, env: {}, client: response instanceof Error ? { beta: { messages: { create: async () => { throw response; } } } } : clientReturning(response) }),
      error => error instanceof BriefSummaryError && expected.test(error.message)
    );
  };
  await failure({ stop_reason: 'refusal', content: [] }, /declined/);
  await failure({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{' }] }, /cut off/);
  await failure({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }, /unreadable/);
  await failure({ stop_reason: 'end_turn', content: [] }, /unreadable/);
  await failure(new Error('overloaded'), /AI request failed/);

  await assert.rejects(
    () => summarizeConversation({ chatMessages: messages, env: {} }),
    error => error instanceof BriefSummaryError && error.status === 503 && /ANTHROPIC_API_KEY/.test(error.message)
  );
}

// ---------- Notion ticket ----------
{
  const brief = sanitizeBrief({
    customer: 'สมชาย',
    note: 'อ้างอิงงานเดิม',
    fields: {
      product: { value: 'Sticker', status: 'confirmed', evidence: 'สติกเกอร์' },
      size: { value: '5 x 5 cm', status: 'confirmed', evidence: '5x5' },
      quantity: { value: '500 ดวง', status: 'confirmed', evidence: '500 ดวง' },
      material: { value: 'เหมือนรอบก่อน', status: 'need_confirmation', reason: 'ยังไม่มีข้อมูลงานเดิม' }
    }
  });

  const blocks = buildBriefBlocks(brief);
  const text = blocks.map(block => block[block.type].rich_text[0].text.content);
  assert.ok(text.includes('Customer: สมชาย'));
  assert.ok(text.includes('Product: Sticker (ลูกค้าพิมพ์ว่า “สติกเกอร์”)'));
  assert.ok(text.includes('Material: เหมือนรอบก่อน — ยังไม่มีข้อมูลงานเดิม'));
  assert.ok(text.includes('File'), 'missing fields are listed');
  assert.ok(text.includes('Due Date'));
  assert.ok(blocks.length <= 100, 'stays inside the Notion block limit');

  const calls = [];
  const schema = {
    'ชื่องาน': { type: 'title' }, 'ขนาด': { type: 'rich_text' }, 'จำนวนรวม': { type: 'number' }, 'อธิบายเพิ่ม': { type: 'rich_text' },
    'Order Key': { type: 'rich_text' }, 'Workflow Status': { type: 'status' }, 'สถานะ': { type: 'select' }
  };
  const makeFetch = ({ existing = null, properties = schema } = {}) => async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/data_sources/tickets-id')) return Response.json({ properties });
    if (String(url).endsWith('/query')) return Response.json({ results: existing ? [existing] : [] });
    if (String(url) === 'https://api.notion.com/v1/pages') return Response.json({ id: 'page-1', url: 'https://notion.so/page-1' });
    return Response.json({ object: 'error' }, { status: 500 });
  };

  let result = await createBriefTicket({ env: { NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-id' }, brief, briefKey: 'key-12345678', notionHeaders: { Authorization: 'x' }, fetchImpl: makeFetch() });
  assert.deepEqual(result, { id: 'page-1', url: 'https://notion.so/page-1', deduplicated: false });
  const created = JSON.parse(calls.find(call => call.url.endsWith('/v1/pages')).options.body);
  assert.equal(created.parent.data_source_id, 'tickets-id');
  assert.equal(created.properties['ชื่องาน'].title[0].text.content, '[LINE] สมชาย · Sticker × 500 ดวง');
  assert.equal(created.properties['ขนาด'].rich_text[0].text.content, '5 x 5 cm');
  assert.equal(created.properties['จำนวนรวม'].number, 500);
  assert.equal(created.properties['Order Key'].rich_text[0].text.content, 'BRIEF-key-12345678');
  assert.equal(created.properties['Workflow Status'].status.name, 'NEW');
  assert.equal(created.properties['สถานะ'], undefined, 'only the first workflow column is written');
  assert.match(created.properties['อธิบายเพิ่ม'].rich_text[0].text.content, /ต้องยืนยันกับลูกค้า: Material \(เหมือนรอบก่อน\)/);
  assert.match(created.properties['อธิบายเพิ่ม'].rich_text[0].text.content, /ยังไม่มีข้อมูล: File, Due Date/);
  assert.ok(created.children.length > 5, 'the brief is written into the page body');

  // columns that do not exist (or have another type) are skipped, so an older Notion schema still works
  calls.length = 0;
  await createBriefTicket({ env: { NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-id' }, brief, briefKey: 'key-12345678', notionHeaders: {}, fetchImpl: makeFetch({ properties: { 'Name': { type: 'title' }, 'ขนาด': { type: 'number' } } }) });
  const minimal = JSON.parse(calls.find(call => call.url.endsWith('/v1/pages')).options.body);
  assert.deepEqual(Object.keys(minimal.properties), ['Name']);
  assert.ok(!calls.some(call => call.url.endsWith('/query')), 'no Order Key column, no duplicate lookup');

  // the same brief twice returns the ticket that exists
  calls.length = 0;
  result = await createBriefTicket({ env: { NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-id' }, brief, briefKey: 'key-12345678', notionHeaders: {}, fetchImpl: makeFetch({ existing: { id: 'old-page', url: 'https://notion.so/old' } }) });
  assert.deepEqual(result, { id: 'old-page', url: 'https://notion.so/old', deduplicated: true });
  assert.ok(!calls.some(call => call.url.endsWith('/v1/pages')), 'no second page is created');

  // a database id is resolved to its data source
  const resolveCalls = [];
  const resolvingFetch = async url => {
    resolveCalls.push(String(url));
    if (String(url).endsWith('/data_sources/db-id')) return Response.json({}, { status: 404 });
    if (String(url).endsWith('/databases/db-id')) return Response.json({ data_sources: [{ id: 'resolved-id' }] });
    if (String(url).endsWith('/data_sources/resolved-id')) return Response.json({ properties: { Name: { type: 'title' } } });
    return Response.json({ id: 'page-2' });
  };
  result = await createBriefTicket({ env: { NOTION_TICKETS_DATA_SOURCE_ID: 'db-id' }, brief, briefKey: 'key-12345678', notionHeaders: {}, fetchImpl: resolvingFetch });
  assert.equal(result.id, 'page-2');
  assert.ok(resolveCalls.some(call => call.endsWith('/databases/db-id')));
}

console.log('Brief domain test passed');
