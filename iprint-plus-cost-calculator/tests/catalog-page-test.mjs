import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync(new URL('../catalog/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../catalog/styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../catalog/app.js', import.meta.url), 'utf8');
const htaccess = readFileSync(new URL('../.htaccess', import.meta.url), 'utf8');

assert.match(html, /<title>เลือกงานพิมพ์ \| iPrint<\/title>/);
assert.doesNotMatch(html, /iPrint\+/);
assert.match(html, /data-product-id="business-card"/);
assert.match(html, /href="\.\.\/business-card\/"/);
assert.match(html, /data-product-id="postcard"[\s\S]*?<button[^>]+disabled/);
assert.match(html, /data-product-id="sticker"[\s\S]*?<button[^>]+disabled/);
assert.match(css, /grid-template-columns:\s*repeat\(3/);
assert.match(css, /@media \(max-width:\s*760px\)/);
assert.match(app, /loadPricing/);
assert.match(htaccess, /fonts\.googleapis\.com/);
assert.match(htaccess, /fonts\.gstatic\.com/);

for (const asset of ['hero.png', 'business-cards.png', 'postcards.png', 'stickers.png', 'cart.svg']) {
  assert.equal(existsSync(new URL(`../catalog/assets/${asset}`, import.meta.url)), true, `Missing ${asset}`);
}

assert.match(html, /<nav class="category-strip"[^>]*aria-label=/);
assert.match(html, /id="categoryNext"/);
assert.match(html, /class="category-tile" href="\.\.\/business-card\/"/);
assert.doesNotMatch(html, /<a class="category-tile is-soon/, 'tiles that are not ready are not links');
assert.match(css, /\.category-list \{[^}]*overflow-x: auto/);
assert.match(app, /categoryList\.scrollBy/);

console.log('Catalog page test passed');
