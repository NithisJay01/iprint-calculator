import assert from 'node:assert/strict';

// The pricing client decides local/production mode from `location` when it is imported.
globalThis.location = { hostname: 'localhost' };
const storage = new Map();
globalThis.localStorage = { getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };

const { newProduct } = await import('../shared/product-pricing.js');
const { catalog } = await import('../shared/preview-catalog.js');
const product = await import('../business-card/product.js');
const adapter = (await import('../business-card/cart-adapter.js')).default;
const { resolveCartItems } = await import('../shared/cart-products.js');
const { cartTotals } = await import('../shared/cart-totals.js');
const capacity = await import('../shared/capacity-client.js');

const [material] = catalog.materials;
const single = catalog.services.find(service => service.serviceRole === 'PRINT_SINGLE');
const double = catalog.services.find(service => service.serviceRole === 'PRINT_DOUBLE');
const matte = catalog.services.find(service => /ด้าน/.test(service.name));
const gloss = catalog.services.find(service => /เงา/.test(service.name));
assert.ok(material && single && double && matte && gloss, 'preview catalog fixture');

const promo = { id: 'welcome', name: 'โปรต้อนรับ', enabled: true, type: 'percent', scope: 'base', value: 10, minQuantity: 0, minSpend: 0, code: 'SAVE10', start: '', end: '' };
const settingsWithSets = () => ({
  version: 'v-test',
  products: [{
    ...newProduct('business-card', 'นามบัตร'), mode: 'packages', markup: 30, promotions: [promo],
    includedServiceIds: [],
    packages: [
      { id: 'essential', name: 'Essential', quantity: 100, price: 123.24, includedIds: [single.id] },
      { id: 'corporate', name: 'Corporate', quantity: 500, price: 1396.2, includedIds: [double.id, matte.id] }
    ]
  }]
});

// ---------- product helpers ----------
const configured = settingsWithSets();
const sets = product.resolveSets(configured.products[0]);
assert.deepEqual(sets.map(set => set.id), ['essential', 'corporate']);
assert.equal(sets[0].tagline, 'เรียบง่าย แต่ดูเป็นมืออาชีพ', 'texts of a known set come from the defaults');
assert.deepEqual(product.resolveSets(null).map(set => set.id), ['essential', 'corporate', 'signature']);
assert.deepEqual(product.resolveSets(newProduct()).map(set => set.id), ['essential', 'corporate', 'signature'], 'non-package pricing uses the default sets');
assert.deepEqual(product.quantityChoices(configured.products[0], sets[1]), [500]);
assert.deepEqual(product.quantityChoices(newProduct(), sets[0]), [100, 200, 400]);
assert.deepEqual(product.allowedMaterials({ materialIds: ['nope'] }, catalog), []);
assert.equal(product.allowedMaterials(null, catalog), catalog.materials);
assert.equal(product.findProduct(configured), configured.products[0]);
assert.equal(product.findProduct({ products: [] }), null);

let selection = product.defaultSelection({ product: configured.products[0], catalog, pack: sets[0] });
assert.equal(selection.quantity, 100);
assert.equal(selection.material.id, material.id);
assert.deepEqual(selection.services.map(service => service.id), [single.id], 'the set includes single-side printing and no coating');
selection = product.defaultSelection({ product: configured.products[0], catalog, pack: sets[1] });
assert.deepEqual(selection.services.map(service => service.id).sort(), [double.id, matte.id].sort(), 'Corporate starts with its included print and coating');

const stored = product.cartItemFromSelection({ pack: sets[1], quantity: '500', material, services: [double, matte], promoCode: `  ${'x'.repeat(100)} `, driveLink: '  https://drive.example/a  ' });
assert.deepEqual(Object.keys(stored).sort(), ['driveLink', 'materialId', 'packageId', 'productId', 'promoCode', 'quantity', 'serviceIds']);
assert.equal(stored.productId, 'business-card');
assert.equal(stored.quantity, 500);
assert.equal(stored.promoCode.length, 80);
assert.equal(stored.driveLink, 'https://drive.example/a');
assert.ok(!('price' in stored), 'prices are recalculated, never stored');

const restored = product.selectionFromItem({ item: stored, settings: configured, catalog });
assert.deepEqual(restored.problems, []);
assert.equal(restored.pack.id, 'corporate');
assert.deepEqual(restored.services.map(service => service.id), [double.id, matte.id]);
assert.equal(restored.quantity, 500);
const broken = product.selectionFromItem({ item: { ...stored, packageId: 'gone', materialId: 'gone', serviceIds: [double.id, 'gone1', 'gone2'] }, settings: configured, catalog });
assert.deepEqual(broken.problems, ['เซตนี้ไม่มีขายแล้ว', 'วัสดุที่เลือกไม่มีขายแล้ว', 'บริการที่เลือกไม่มีขายแล้ว'], 'each kind of problem is reported once');

// ---------- adapter: every item is priced on its own ----------
const context = { settings: configured, catalog };
const item = (extra = {}) => ({ id: 'i1', ...product.cartItemFromSelection({ pack: sets[0], quantity: 100, material, services: [single], promoCode: '' }), ...extra });
let entry = adapter.resolve(item(), context);
assert.deepEqual(entry.problems, []);
assert.equal(entry.title, 'นามบัตร Essential');
assert.equal(entry.price, 123.24, 'included print does not change the set price');
assert.equal(entry.discount, 0);
assert.match(entry.spec, /^100 ใบ • .+ • พิมพ์หน้าเดียว$/);
assert.ok(entry.points >= 1, 'every item books capacity');
assert.equal(entry.editUrl, '../business-card/order.html?edit=i1');
assert.equal(entry.pricingVersion, 'v-test');

// A promo code belongs to one item: the same set with and without the code is priced differently.
const withCode = adapter.resolve(item({ id: 'i2', promoCode: 'save10' }), context);
assert.equal(withCode.discount, 12.32, 'code is case-insensitive and applies 10% of the set price');
assert.equal(withCode.promotion, 'โปรต้อนรับ');
assert.equal(withCode.price, 110.92);
assert.equal(withCode.note, '');
const withoutCode = adapter.resolve(item({ id: 'i3' }), context);
assert.equal(withoutCode.price, 123.24, 'the other item is not affected by the first item code');
const wrongCode = adapter.resolve(item({ id: 'i4', promoCode: 'NOPE' }), context);
assert.equal(wrongCode.price, 123.24);
assert.match(wrongCode.note, /ไม่เข้าเงื่อนไข/);

// Sold-out choices are reported and the item is not priced.
const gone = adapter.resolve(item({ packageId: 'gone' }), context);
assert.equal(gone.price, 0);
assert.deepEqual(gone.problems, ['เซตนี้ไม่มีขายแล้ว']);
assert.equal(adapter.resolve(item({ materialId: 'gone' }), context).price, 0);

// Cart totals: items with problems are left out, points are added up.
const entries = [entry, withCode, gone];
const totals = cartTotals(entries);
assert.equal(totals.subtotal, 234.16);
assert.equal(totals.discount, 12.32);
assert.equal(totals.count, 2);
assert.equal(totals.points, Math.round((entry.points + withCode.points) * 100) / 100);

// The adapter loads settings + catalog through the pricing client (local preview here).
const loaded = await adapter.load();
assert.ok(Array.isArray(loaded.settings.products));
assert.ok(loaded.catalog.materials.length && loaded.catalog.services.length);

// ---------- cart registry ----------
const calls = { loads: 0, resolves: [] };
const fakeAdapter = {
  productId: 'sticker', label: 'สติกเกอร์',
  async load() { calls.loads += 1; return { ready: true }; },
  resolve(cartItem, ctx) { calls.resolves.push(cartItem.id); assert.equal(ctx.ready, true); if (cartItem.boom) throw new Error('resolve failed'); return { id: cartItem.id, productId: 'sticker', title: 'สติกเกอร์', spec: '', note: '', price: 10, discount: 0, points: 1, editUrl: '', problems: [] }; }
};
const loaders = {
  sticker: async () => ({ default: fakeAdapter }),
  'business-card': async () => ({ default: adapter }),
  broken: async () => { throw new Error('module failed'); }
};
const cartItemsList = [
  { id: 'a', productId: 'sticker' },
  { id: 'b', productId: 'business-card', ...item({ id: 'b' }) },
  { id: 'c', productId: 'sticker', boom: true },
  { id: 'd', productId: 'mug' },
  { id: 'e', productId: 'broken' },
  { id: 'f', productId: 'sticker' }
];
const resolved = await resolveCartItems(cartItemsList, { loaders });
assert.deepEqual(resolved.map(entryItem => entryItem.id), ['a', 'b', 'c', 'd', 'e', 'f'], 'cart order is kept');
assert.equal(calls.loads, 1, 'a product is loaded once for all of its items');
assert.deepEqual(calls.resolves, ['a', 'c', 'f']);
assert.equal(resolved[0].label, 'สติกเกอร์');
assert.equal(resolved[1].price, 123.24);
assert.deepEqual(resolved[2].problems, ['resolve failed'], 'one broken item does not break the others');
assert.equal(resolved[5].price, 10);
assert.deepEqual(resolved[3].problems, ['ไม่รองรับสินค้าประเภทนี้']);
assert.match(resolved[4].problems[0], /โหลดราคาไม่สำเร็จ: module failed/);
assert.deepEqual(await resolveCartItems([], { loaders }), []);

// ---------- delivery date availability ----------
const monday = new Date(2026, 8, 21, 10, 30); // Monday 21 Sep 2026
const local = capacity.localAvailability(3, monday);
assert.equal(local.days.length, 45);
assert.equal(local.days[0].date, '2026-09-21');
assert.equal(local.days[0].availability, 'TOO_SOON');
assert.equal(local.days[1].bookable, false);
assert.equal(local.recommendedDate, '2026-09-23', 'two days of lead time');
assert.equal(local.days.find(day => day.date === '2026-09-27').availability, 'CLOSED', 'Sunday is closed');
assert.equal(local.requiredPoints, 3);
assert.equal((await capacity.loadAvailability({ points: 2, now: monday })).days.length, 45, 'local preview never calls the network');

const requests = [];
const okFetcher = async url => { requests.push(String(url)); return new Response(JSON.stringify({ success: true, days: [{ date: '2026-09-23', bookable: true }], recommendedDate: '2026-09-23' }), { status: 200 }); };
const remote = await capacity.loadAvailability({ points: 7.5, now: monday, fetcher: okFetcher, local: false });
assert.equal(remote.recommendedDate, '2026-09-23');
assert.match(requests[0], /\/public\/capacity\?from=2026-09-21&to=2026-11-05&points=7\.5$/);
await capacity.loadAvailability({ points: 0.1, now: monday, fetcher: okFetcher, local: false });
assert.match(requests[1], /points=0\.25$/, 'at least a quarter of a point is booked');
await capacity.loadAvailability({ points: 0, now: monday, fetcher: okFetcher, local: false });
assert.match(requests[2], /points=1$/, 'no points falls back to one, like the Worker');
await assert.rejects(() => capacity.loadAvailability({ points: 1, now: monday, local: false, fetcher: async () => new Response(JSON.stringify({ error: 'Production capacity is not configured' }), { status: 503 }) }), /not configured/);
await assert.rejects(() => capacity.loadAvailability({ points: 1, now: monday, local: false, fetcher: async () => new Response('oops', { status: 502 }) }), /502/);

assert.equal(capacity.isSelectable({ bookable: true }), true);
assert.equal(capacity.isSelectable({ bookable: false, boostDays: 2 }), false, 'rush days are not offered by the cart yet');
assert.equal(capacity.isSelectable(undefined), false);
assert.equal(capacity.dayLabel({ bookable: true }), 'ว่าง');
assert.equal(capacity.dayLabel({ bookable: false, boostDays: 1 }), 'ต้องเร่งด่วน');
assert.equal(capacity.dayLabel({ availability: 'CLOSED' }), 'ปิด');
assert.equal(capacity.dayLabel({ availability: 'TOO_SOON' }), 'เร็วเกินไป');

// ---------- page structure (decisions: no +/- counter, promo code on the order page only, one shared cart page) ----------
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const orderHtml = read('../business-card/order.html');
const orderJs = read('../business-card/order.js');
const cartHtml = read('../cart/index.html');
const cartJs = read('../cart/app.js');

assert.ok(!/id="minus"|id="plus"|id="cartQty"|cartQty/.test(orderHtml + orderJs + cartHtml + cartJs), 'the +/- counter (cartQty) is gone');
assert.match(orderHtml, /<div class="price-box">[\s\S]*id="priceBreakdown"[\s\S]*id="promoCode"[\s\S]*<\/div>\s*<\/div>\s*<\/section>/, 'the promo code field sits inside the price section at the bottom of the order page');
assert.ok(!/id="promoCode"|<input[^>]*promo|\$\('promoCode'\)/i.test(cartHtml + cartJs), 'the cart page has no promo code input; the code is entered per item on the order page (the cart only shows it)');
assert.match(orderJs, /promoCode: \$\('promoCode'\)\.value/, 'the promo code is stored with the cart item');
assert.match(orderJs, /params\.get\('cart'\) === '1'\) location\.replace\('\.\.\/cart\/'\)/, 'old order.html?cart=1 links open the cart page');
assert.match(orderJs, /addCartItem\(item\)/);
assert.match(orderJs, /updateCartItem\(state\.editingId, item\)/);
assert.match(cartJs, /resolveCartItems\(items\)/, 'the cart page prices items through product adapters');
assert.doesNotMatch(cartJs, /business-card/, 'the cart page knows no product; adapters do');
assert.match(cartJs, /loadAvailability\(\{ points \}\)/);
assert.match(cartJs, /state\.totals = cartTotals\(state\.entries/);
assert.match(cartHtml, /data-step="1"[\s\S]*data-step="2"[\s\S]*data-step="3"[\s\S]*data-step="4"/);
for (const page of ['../catalog/index.html', '../business-card/index.html', '../business-card/order.html']) {
  assert.match(read(page), /href="\.\.\/cart\/"/, `${page} opens the shared cart`);
  assert.doesNotMatch(read(page), /order\.html\?cart=1/, `${page} must not use the old cart link`);
}
assert.match(readFileSync(new URL('../../scripts/build-hostinger-package.ps1', import.meta.url), 'utf8'), /'business-card', 'cart', 'staff'/, 'the Hostinger package includes the cart page');

console.log('Cart products test passed');
