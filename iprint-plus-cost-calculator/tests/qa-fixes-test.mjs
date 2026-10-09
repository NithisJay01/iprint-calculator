import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { friendlyError, NETWORK_MESSAGE, GENERIC_MESSAGE } from '../shared/errors.js';
import { isThaiPhone, normalizeThaiPhone } from '../shared/phone.js';
import { validateOrderFoundation } from '../worker/domain/order.js';

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

console.log('QA fixes test passed');
