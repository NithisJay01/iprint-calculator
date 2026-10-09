import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { friendlyError, NETWORK_MESSAGE, GENERIC_MESSAGE } from '../shared/errors.js';
import { isThaiPhone, normalizeThaiPhone } from '../shared/phone.js';
import { validateOrderFoundation } from '../worker/domain/order.js';
globalThis.location ??= new URL('https://iprint.tchl.online/');
const { trackingIdFrom } = await import('../shared/orders-client.js');

// Group 1: customers never see raw browser / English error text.
assert.equal(friendlyError(new TypeError('Failed to fetch')), NETWORK_MESSAGE);
assert.equal(friendlyError(new TypeError('NetworkError when attempting to fetch resource.')), NETWORK_MESSAGE);
assert.equal(friendlyError(new TypeError('Load failed')), NETWORK_MESSAGE);
assert.equal(friendlyError(Object.assign(new Error('aborted'), { name: 'AbortError' })), NETWORK_MESSAGE);
assert.equal(friendlyError(new Error('Unexpected token < in JSON')), GENERIC_MESSAGE);
assert.equal(friendlyError(new Error('Unexpected token'), 'ข้อความสำรอง'), 'ข้อความสำรอง');
assert.equal(friendlyError(new Error('โหลดกำลังผลิตไม่สำเร็จ (500)')), 'โหลดกำลังผลิตไม่สำเร็จ (500)');
assert.equal(friendlyError(undefined), GENERIC_MESSAGE);

const orderHtml = readFileSync(new URL('../business-card/order.html', import.meta.url), 'utf8');
assert.match(orderHtml, /<button type="button" id="next" disabled>/, 'add-to-cart starts disabled until the set loads');
assert.match(orderHtml, /id="retryLoad"/, 'order page has a retry button');
assert.doesNotMatch(orderHtml, /กำลังโหลดเซต…<\/h1>/, 'no permanent loading text');
const orderJs = readFileSync(new URL('../business-card/order.js', import.meta.url), 'utf8');
assert.doesNotMatch(orderJs, /setStatus\(error\.message\)/, 'order page does not show raw error messages');
const panelJs = readFileSync(new URL('../material-preview/catalog-panel.js', import.meta.url), 'utf8');
assert.doesNotMatch(panelJs, /say\(error\.message/, 'material catalog does not show raw error messages');

// Group 2: Thai phone numbers, same rule in the cart and in the Worker for public orders.
for (const ok of ['0812345678', '081-234-5678', '081 234 5678', '+66 81 234 5678', '66812345678', '02-123-4567', '021234567', '(081) 234-5678']) assert.ok(isThaiPhone(ok), ok);
for (const bad of ['', '12', '0888', '1812345678', '081234567890', 'abc', '+1 415 555 0100', '08-1234-56789']) assert.ok(!isThaiPhone(bad), bad);
assert.equal(normalizeThaiPhone('+66 81-234-5678'), '0812345678');
const baseOrder = { orderKey: 'k1', quoteNo: 'Q1', customer: 'QA', phone: '12', orderItems: [] };
assert.ok(validateOrderFoundation(baseOrder, { publicOrder: true }).errors.some(error => error.startsWith('phone')), 'public order rejects a bad phone');
assert.ok(!validateOrderFoundation(baseOrder).errors.some(error => error.startsWith('phone')), 'staff orders keep their old phone rule');
assert.ok(!validateOrderFoundation({ ...baseOrder, phone: '081-234-5678' }, { publicOrder: true }).errors.some(error => error.startsWith('phone')));
const cartHtml = readFileSync(new URL('../cart/index.html', import.meta.url), 'utf8');
for (const id of ['customerNameError', 'phoneError', 'emailError', 'addressError', 'consentError']) assert.match(cartHtml, new RegExp(`id="${id}"`), id);
assert.equal((cartHtml.match(/<h1 tabindex="-1">/g) || []).length, 4, 'step headings can take focus');
const cartJs = readFileSync(new URL('../cart/app.js', import.meta.url), 'utf8');
assert.ok(cartJs.includes('isThaiPhone(phone)'), 'cart checks the phone format');
assert.ok(cartJs.includes("setAttribute('aria-invalid', 'true')"), 'cart marks invalid fields');

// Group 3: the tracking box takes the order number or the whole tracking link.
const uuid = '1a2b3c4d-1111-2222-3333-444455556666';
assert.equal(trackingIdFrom(uuid), uuid);
assert.equal(trackingIdFrom(`  https://iprint.tchl.online/cart/track.html?id=${uuid}  `), uuid);
assert.equal(trackingIdFrom('1a2b3c4d111122223333444455556666'), '1a2b3c4d111122223333444455556666');
assert.equal(trackingIdFrom('order 123'), '');
assert.equal(trackingIdFrom(''), '');
const trackJs = readFileSync(new URL('../cart/track.js', import.meta.url), 'utf8');
assert.ok(readFileSync(new URL('../cart/track.html', import.meta.url), 'utf8').includes('id="trackingInput"'), 'track page has a lookup box');
assert.ok(trackJs.includes("addEventListener('submit'"), 'lookup box is wired');
assert.ok(!trackJs.includes('หรือเลือกจากรายการด้านล่าง</p>'), 'no reference to an empty list');

// Group 4: publishing only ships the public site, and test/debug switches only work on a local preview.
const workflow = readFileSync(new URL('../../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
const buildScript = readFileSync(new URL('../../scripts/build-hostinger-package.ps1', import.meta.url), 'utf8');
assert.ok(workflow.includes('path: ./_site'), 'GitHub Pages uploads the collected public files only');
assert.ok(!workflow.includes('path: ./iprint-plus-cost-calculator'), 'GitHub Pages no longer uploads the whole folder');
const pagesDirs = workflow.match(/for dir in ([^;]+); do/)[1].trim().split(/\s+/).sort();
const packageDirs = [...buildScript.match(/foreach \(\$directory in @\(([^)]+)\)\)/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]).sort();
assert.deepEqual(pagesDirs, packageDirs, 'GitHub Pages and the Hostinger package publish the same folders');
for (const hidden of ['tests', 'test-artifacts', 'worker', 'docs']) assert.ok(!pagesDirs.includes(hidden), `${hidden} is not published`);
assert.ok(workflow.includes("find _site -name '*.md' -delete"), 'notes are not published');
assert.ok(buildScript.includes("@('.md', '.mjs', '.toml')"), 'the package drops notes and dev files');
assert.ok(!/-LiteralPath[^\n]*-Include/.test(buildScript), '-Include is ignored with -LiteralPath on PowerShell 5.1');
const core = readFileSync(new URL('../js/core.js', import.meta.url), 'utf8');
assert.ok(core.includes('IPRINT_TEST_MODE=IPRINT_LOCAL_HOST&&'), 'testMode only on localhost');
const previewApp = readFileSync(new URL('../material-preview/app.js', import.meta.url), 'utf8');
assert.ok(previewApp.includes("const DEBUG = params.has('debug') && ['localhost'"), 'debug overlay only on localhost');

// Group 5: every page has a favicon; public pages have a description and Open Graph tags; staff pages are not indexed.
const pageHtml = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const publicPages = ['index.html', 'catalog/index.html', 'business-card/index.html', 'business-card/order.html', 'cards/index.html', 'cart/index.html', 'cart/track.html', 'material-preview/index.html'];
const staffPages = ['brief/index.html', 'pricing/index.html', 'staff/index.html'];
for (const name of [...publicPages, ...staffPages]) {
  const html = pageHtml(name);
  const icon = html.match(/<link rel="icon" type="image\/svg\+xml" href="([^"]+)">/);
  assert.ok(icon, `${name} has a favicon`);
  assert.ok(existsSync(new URL(icon[1], new URL(`../${name}`, import.meta.url))), `${name} favicon file exists`);
}
for (const name of publicPages) {
  const html = pageHtml(name);
  assert.match(html, /<meta name="description" content="[^"]{20,}">/, `${name} has a description`);
  for (const property of ['og:title', 'og:description', 'og:image', 'og:url']) assert.match(html, new RegExp(`<meta property="${property}" content="[^"]+">`), `${name} has ${property}`);
  assert.match(html, /<meta property="og:image" content="https:\/\/iprint\.tchl\.online\/[^"]+\.png">/, `${name} og:image is an absolute png`);
}
for (const name of staffPages) assert.match(pageHtml(name), /<meta name="robots" content="noindex/, `${name} is not indexed`);
const pricingHtml = pageHtml('pricing/index.html');
assert.ok(pricingHtml.includes('id="loginGate"') && pricingHtml.includes('id="gateKey"'), 'Set Studio has a sign-in gate');
const pricingJs = readFileSync(new URL('../pricing/app.js', import.meta.url), 'utf8');
assert.ok(pricingJs.includes("LOCAL ? '' : await staffGate()"), 'the live Set Studio waits for sign-in');
assert.ok(!pricingJs.includes('src="../business-card/${esc(image)}"'), 'built-in set pictures resolve through resolveSetImage');
const { checkStaffKey, GATE_NETWORK_MESSAGE } = await import('../pricing/gate.js');
assert.equal((await checkStaffKey('', async () => { throw new Error('not called'); })).ok, false);
assert.equal((await checkStaffKey('good', async (url, init) => { assert.ok(String(url).endsWith('/auth/check')); assert.equal(init.headers['X-API-Key'], 'good'); return new Response('{}', { status: 200 }); })).ok, true);
assert.equal((await checkStaffKey('bad', async () => new Response('{}', { status: 401 }))).message, 'รหัสเข้าใช้งานไม่ถูกต้อง');
assert.equal((await checkStaffKey('x', async () => { throw new TypeError('Failed to fetch'); })).message, GATE_NETWORK_MESSAGE);

// Group 6: the home page says what the shop does, has one primary action, and closed side sheets cannot take focus.
const home = pageHtml('index.html');
assert.match(home, /<title>iPrint — สั่งพิมพ์นามบัตร/);
assert.match(home, /<h1 id="loginTitle">.*ดูพรีวิวก่อนสั่ง.*<\/h1>/);
assert.match(home, /class="guest-entry product-entry primary-entry" href="catalog\/"><strong>เลือกสินค้า/);
assert.match(home, /<p class="login-footer"><a class="staff-entry" id="showStaffLogin" href="staff\/">/, 'staff sign-in is a small footer link');
assert.equal((home.match(/<aside class="side-sheet[^>]*aria-hidden="true" inert>/g) || []).length, 3, 'side sheets start inert');
const homeApp = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
assert.ok(homeApp.includes('sheet.inert=true') && homeApp.includes('sheet.inert=false'), 'opening/closing a sheet toggles inert');

console.log('QA fixes test passed');
