import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  UNIT_OPTIONS, formatUnit, inferServiceRole, newCatalogItemPayload, catalogListFor, filterCatalogItems,
  itemUsage, describeUsage, setGroupItem, removeItemEverywhere, groupSummary, saveStateLabel
} from '../shared/set-studio.js';
import { validateCatalogMutation } from '../worker/domain/catalog.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

// ---------- new catalog item payload ----------
let check = newCatalogItemPayload('material', { name: '  Art Paper 350g ', price: '1.5', unit: 'sheet' });
assert.equal(check.success, true);
assert.deepEqual(check.value, { name: 'Art Paper 350g', price: 1.5, unit: 'sheet', active: true });
for (const bad of [
  { name: '', price: 1, unit: 'sheet' },
  { name: 'x', price: '', unit: 'sheet' },
  { name: 'x', price: -1, unit: 'sheet' },
  { name: 'x', price: 'abc', unit: 'sheet' },
  { name: 'x', price: 1, unit: 'meter' },
  { name: 'x'.repeat(121), price: 1, unit: 'sheet' }
]) assert.equal(newCatalogItemPayload('material', bad).success, false, JSON.stringify(bad));
assert.equal(newCatalogItemPayload('bogus', { name: 'x', price: 1, unit: 'sheet' }).success, false);

check = newCatalogItemPayload('service', { name: 'พิมพ์หน้าเดียว', price: 20, unit: 'sheet' });
assert.equal(check.success, true);
assert.equal(check.value.category, 'บริการเพิ่มเติม', 'default category');
assert.equal(check.value.serviceRole, 'PRINT_SINGLE');
assert.equal(check.value.capacityBasis, 'job');
assert.equal(newCatalogItemPayload('service', { name: 'x', price: 1, unit: 'job', capacityPoints: -1 }).success, false);
assert.equal(newCatalogItemPayload('service', { name: 'x', price: 1, unit: 'job', capacityBasis: 'week' }).success, false);

// The Worker must accept exactly what the form produces.
for (const [type, input] of [
  ['material', { name: 'Kraft', price: 2, unit: 'sheet' }],
  ['service', { name: 'เคลือบด้าน', price: 20, unit: 'sheet', category: 'การเคลือบ', capacityPoints: '0.25', capacityBasis: 'sheet' }],
  ['service', { name: 'ตัดมุมมน', price: 5, unit: 'job' }]
]) {
  const payload = newCatalogItemPayload(type, input);
  assert.equal(payload.success, true, payload.errors.join());
  const server = validateCatalogMutation({ ...payload.value, type });
  assert.equal(server.success, true, `Worker rejected ${type} payload: ${server.errors.join()}`);
  assert.equal(server.value.active, true);
}
assert.equal(UNIT_OPTIONS.map(unit => unit.value).join(), 'sheet,piece,job');
assert.equal(formatUnit('sheet'), 'แผ่น');
assert.equal(formatUnit('piece'), 'ชิ้น');
assert.equal(formatUnit(''), 'งาน');

// Role inference must not drift from the staff catalog form.
const staffSource = read('../js/staff-catalog.js');
const staffInfer = new Function(`${staffSource.match(/function inferStaffServiceRole[\s\S]*?\r?\n}\r?\n/)[0]}; return inferStaffServiceRole;`)();
for (const sample of ['พิมพ์หน้าเดียว', 'พิมพ์หน้า-หลัง', 'พิมพ์ 2 หน้า', 'ตัดมุม', 'ไดคัท 50', 'ไดคัท เต็ม 100', 'ไดคัท', 'เคลือบด้าน', 'Hologram film', 'ปั๊มฟอยล์', 'แพ็กใส่กล่อง']) {
  assert.equal(inferServiceRole({ name: sample }), staffInfer({ name: sample }), `role for ${sample}`);
}

// ---------- search / catalog lists ----------
const catalog = { materials: [{ id: 'm1', name: 'Art Paper' }, { id: 'm2', name: 'Kraft' }], services: [{ id: 's1', name: 'เคลือบด้าน' }, { id: 's2', name: 'เคลือบเงา' }] };
assert.equal(catalogListFor(catalog, 'material'), catalog.materials);
assert.equal(catalogListFor(catalog, 'service'), catalog.services);
assert.deepEqual(filterCatalogItems(catalog.services, ' เงา ').map(item => item.id), ['s2']);
assert.deepEqual(filterCatalogItems(catalog.materials, 'ART').map(item => item.id), ['m1']);
assert.equal(filterCatalogItems(catalog.materials, '').length, 2);

// ---------- usage, group membership ----------
const makeSettings = () => ({
  version: 'v1',
  products: [{
    id: 'card', name: 'นามบัตร', includedServiceIds: ['s1'], materialIds: [],
    optionGroups: [
      { id: 'g1', name: 'เคลือบ', enabled: true, source: 'service', selectionMode: 'single', required: false, itemIds: ['s1', 's2'] },
      { id: 'g2', name: 'ของแถม', enabled: true, source: 'service', selectionMode: 'multiple', required: false, itemIds: ['s1'] }
    ],
    packages: [
      { id: 'p1', name: 'Essential', optionIds: ['s1', 's2'] },
      { id: 'p2', name: 'Signature', optionIds: ['s1'] }
    ]
  }]
});

let settings = makeSettings();
let usage = itemUsage(settings, 's1');
assert.equal(usage.length, 2, 'listed in two groups');
assert.deepEqual(usage[0].packageNames, ['Essential', 'Signature']);
assert.match(describeUsage(usage), /ใช้ใน 2 หมวด \(นามบัตร › เคลือบ, นามบัตร › ของแถม\) และ 2 เซต/);
assert.equal(describeUsage(itemUsage(settings, 'unused')), 'ยังไม่ถูกใช้ในหมวดหรือเซตใด');
assert.match(describeUsage(Array.from({ length: 5 }, (_, i) => ({ productId: 'p', productName: 'P', groupName: `G${i}`, packageNames: [] }))), /และอีก 2 หมวด/);

// Adding an item switches it on only in the set being edited.
let product = settings.products[0];
product.optionGroups[0].itemIds = ['s1'];
product.packages[0].optionIds = ['s1'];
setGroupItem(product, 0, 's2', true, { selectInPackageId: 'p2' });
assert.deepEqual(product.optionGroups[0].itemIds, ['s1', 's2']);
assert.deepEqual(product.packages[1].optionIds, ['s1', 's2']);
assert.deepEqual(product.packages[0].optionIds, ['s1'], 'other sets untouched');
product.packages[0].optionIds = ['s1', 's2'];
setGroupItem(product, 0, 's2', true, { selectInPackageId: 'p2' });
assert.deepEqual(product.optionGroups[0].itemIds, ['s1', 's2'], 'adding twice does not duplicate');

// Removing from a group keeps the item on when another group of the product still lists it.
setGroupItem(product, 0, 's1', false);
assert.deepEqual(product.optionGroups[0].itemIds, ['s2']);
assert.ok(product.packages.every(pack => pack.optionIds.includes('s1')), 's1 is still listed in the second group');
setGroupItem(product, 1, 's1', false);
assert.ok(product.packages.every(pack => !pack.optionIds.includes('s1')), 'no group lists s1 any more');
assert.equal(setGroupItem(product, 9, 's1', true), false, 'unknown group index is ignored');

// Deactivated catalog items disappear everywhere.
settings = makeSettings();
removeItemEverywhere(settings, 's1');
const cleaned = settings.products[0];
assert.ok(cleaned.optionGroups.every(group => !group.itemIds.includes('s1')));
assert.ok(cleaned.packages.every(pack => !pack.optionIds.includes('s1')));
assert.deepEqual(cleaned.includedServiceIds, []);
assert.deepEqual(cleaned.optionGroups[0].itemIds, ['s2']);

// ---------- group summaries and save state ----------
const itemsById = new Map([['s1', { id: 's1' }], ['s2', { id: 's2' }]]);
settings = makeSettings();
product = settings.products[0];
assert.deepEqual(groupSummary({ ...product.optionGroups[0], enabled: false }, itemsById, product.packages[0]), { tone: 'off', text: 'ปิดอยู่ · ลูกค้าจะไม่เห็นหมวดนี้' });
assert.equal(groupSummary({ ...product.optionGroups[0], itemIds: [] }, itemsById, product.packages[0]).tone, 'empty');
assert.equal(groupSummary({ ...product.optionGroups[0], itemIds: ['gone'] }, itemsById, product.packages[0]).tone, 'empty', 'unknown ids do not count');
let summary = groupSummary({ ...product.optionGroups[0], required: true }, itemsById, product.packages[0]);
assert.equal(summary.tone, 'ok');
assert.equal(summary.text, '2 รายการ · ใช้ในเซตนี้ 2 · เลือกได้ 1 รายการ · บังคับเลือก');
summary = groupSummary(product.optionGroups[1], itemsById, { optionIds: [] });
assert.equal(summary.tone, 'warn', 'items exist but none is used in this set');
assert.match(summary.text, /เลือกได้หลายรายการ/);

assert.equal(saveStateLabel('unsaved'), 'ยังไม่ได้บันทึก');
assert.equal(saveStateLabel('published'), 'เผยแพร่แล้ว');
assert.equal(saveStateLabel('draft', '2026-09-19T07:05:00.000Z'), 'ฉบับร่างบันทึกแล้ว 14:05');
assert.equal(saveStateLabel('draft', ''), 'ฉบับร่างบันทึกแล้ว');
assert.equal(saveStateLabel('draft', 'not-a-date'), 'ฉบับร่างบันทึกแล้ว');

// ---------- pricing client: local preview mode ----------
const store = () => { const data = new Map(); return { getItem: key => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), clear: () => data.clear() }; };
globalThis.localStorage = store();
globalThis.sessionStorage = store();
globalThis.location = { hostname: 'localhost' };
const clientUrl = new URL('../shared/pricing-client.js', import.meta.url).href;
const local = await import(`${clientUrl}?local`);
assert.equal(local.LOCAL, true);

assert.equal(await local.loadDraft(''), null);
const draftSettings = { version: 'v1', products: [{ id: 'card', name: 'x' }] };
const savedDraft = await local.saveDraft(draftSettings, { baseVersion: 'v1' });
assert.equal(savedDraft.baseVersion, 'v1');
assert.deepEqual((await local.loadDraft('')).settings, draftSettings);
assert.equal(localStorage.getItem(local.STORAGE_KEY), null, 'a draft never touches the published preview settings');
await local.discardDraft('');
assert.equal(await local.loadDraft(''), null);

let base = await local.loadCatalog();
const baseServiceCount = base.services.length;
const created = await local.createCatalogItem('service', { name: 'ปั๊มฟอยล์', price: 35, unit: 'sheet', active: true });
assert.match(created.id, /^local-service-/);
let after = await local.loadCatalog();
assert.equal(after.services.length, baseServiceCount + 1);
assert.ok(after.services.some(item => item.id === created.id));
await local.deactivateCatalogItem('service', created);
await local.deactivateCatalogItem('service', base.services[0]);
after = await local.loadCatalog();
assert.equal(after.services.length, baseServiceCount - 1, 'created item and one preview item are hidden');
assert.ok(!after.services.some(item => item.id === created.id || item.id === base.services[0].id));

sessionStorage.setItem('iprint_write_api_key_session', 'session-key');
assert.equal(local.storedWriteKey(), 'session-key');
sessionStorage.clear();
localStorage.setItem('iprint_write_api_key', 'stored-key');
assert.equal(local.storedWriteKey(), 'stored-key');

// ---------- pricing client: production mode talks to the staff API ----------
globalThis.location = { hostname: 'iprint.tchl.online' };
const remote = await import(`${clientUrl}?remote`);
assert.equal(remote.LOCAL, false);
const calls = [];
let nextResponse = { status: 200, body: { success: true } };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), method: options.method || 'GET', headers: options.headers || {}, body: options.body ? JSON.parse(options.body) : undefined });
  return new Response(JSON.stringify(nextResponse.body), { status: nextResponse.status });
};
const API = 'https://iprint-flow-api.iprint-garphic1.workers.dev';
try {
  await assert.rejects(() => remote.loadDraft(''), error => error.code === 'NO_KEY');
  await assert.rejects(() => remote.saveDraft(draftSettings, {}, '  '), error => error.code === 'NO_KEY');
  assert.equal(calls.length, 0, 'no request is sent without a key');

  nextResponse = { status: 200, body: { success: true, draft: { savedAt: 't1', baseVersion: 'v1', settings: draftSettings } } };
  assert.equal((await remote.loadDraft(' key ')).savedAt, 't1');
  assert.equal(calls[0].url, `${API}/staff/pricing-settings/draft`);
  assert.equal(calls[0].headers['X-API-Key'], 'key', 'key is trimmed');

  await remote.saveDraft(draftSettings, { baseVersion: 'v1', expectedSavedAt: 't1' }, 'key');
  assert.deepEqual(calls[1].body, { baseVersion: 'v1', settings: draftSettings, expectedSavedAt: 't1', force: false });
  assert.equal(calls[1].method, 'PUT');

  nextResponse = { status: 409, body: { success: false, code: 'DRAFT_CONFLICT', current: { savedAt: 't9' } } };
  await assert.rejects(() => remote.saveDraft(draftSettings, {}, 'key'), error => error.code === 'DRAFT_CONFLICT' && error.current.savedAt === 't9');
  nextResponse = { status: 401, body: { success: false } };
  await assert.rejects(() => remote.discardDraft('bad'), error => error.code === 'UNAUTHORIZED');

  nextResponse = { status: 200, body: { success: true, discarded: true } };
  await remote.discardDraft('key');
  assert.equal(calls.at(-1).method, 'DELETE');

  nextResponse = { status: 201, body: { success: true, item: { id: 'new-1', name: 'x' } } };
  const item = await remote.createCatalogItem('material', { name: 'x', price: 1, unit: 'sheet', active: true }, 'key');
  assert.equal(item.id, 'new-1');
  assert.equal(calls.at(-1).url, `${API}/staff/materials`);
  assert.equal(calls.at(-1).method, 'POST');

  nextResponse = { status: 200, body: { success: true, item: { id: 'svc/1', active: false } } };
  await remote.deactivateCatalogItem('service', { id: 'svc/1', updatedAt: 'u1', name: 'kept', price: 9 }, 'key');
  assert.equal(calls.at(-1).url, `${API}/staff/services/svc%2F1`);
  assert.equal(calls.at(-1).method, 'PATCH');
  assert.deepEqual(calls.at(-1).body, { active: false, expectedUpdatedAt: 'u1' }, 'only the flag and the conflict guard are sent so other fields are not overwritten');

  nextResponse = { status: 409, body: { success: false, code: 'CATALOG_WRITE_CONFLICT' } };
  await assert.rejects(() => remote.deactivateCatalogItem('material', { id: 'm', updatedAt: 'old' }, 'key'), error => error.code === 'CATALOG_WRITE_CONFLICT');
  nextResponse = { status: 400, body: { success: false, errors: ['name is required'] } };
  await assert.rejects(() => remote.createCatalogItem('material', {}, 'key'), /name is required/);
} finally {
  globalThis.fetch = originalFetch;
}

// ---------- page source guards ----------
const pageSource = read('../pricing/app.js');
const pageHtml = read('../pricing/index.html');
for (const word of ['วัตถุดิบ', 'ครัวกลาง', 'Catalog กลาง']) {
  assert.ok(!pageSource.includes(word) && !pageHtml.includes(word), `retired wording "${word}" is back in the set studio`);
}
assert.ok(!/location\.(href|assign|replace)\s*=|location\.(assign|replace)\(/.test(pageSource), 'the set studio must not navigate away while editing');
assert.ok(pageSource.includes("addEventListener('beforeunload'"), 'unsaved edits must be guarded');
assert.ok(pageHtml.includes('id="saveDraft"') && pageHtml.includes('id="itemPicker"'));

// The page module runs DOM code on import, so only its syntax can be checked here.
const temp = mkdtempSync(join(tmpdir(), 'set-studio-'));
const copy = join(temp, 'app.mjs');
writeFileSync(copy, pageSource);
const syntax = spawnSync(process.execPath, ['--check', copy], { encoding: 'utf8' });
assert.equal(syntax.status, 0, `pricing/app.js has a syntax error: ${syntax.stderr}`);

console.log('Set studio logic test passed');
