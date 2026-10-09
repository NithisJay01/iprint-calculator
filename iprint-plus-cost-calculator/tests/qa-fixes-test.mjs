import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { friendlyError, NETWORK_MESSAGE, GENERIC_MESSAGE } from '../shared/errors.js';

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

console.log('QA fixes test passed');
