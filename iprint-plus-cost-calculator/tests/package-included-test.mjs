import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newProduct, validateSettings, calculateProductPrice, includedIdsFor, itemCost } from '../shared/product-pricing.js';
import { calculateBusinessCardQuote, buildOrderPayload } from '../business-card/logic.js';
import { optionPrice, buildPriceBreakdown } from '../business-card/breakdown.js';
import { verifyConfiguredPrice } from '../worker/domain/product-pricing.js';
import { setIncluded, toggleOffered, includedIdsOf, setGroupItem, removeItemEverywhere } from '../shared/set-studio.js';

const preset = { id: '13x19', name: '13×19', usableW: 31.02, usableH: 47.26 };
const material = { id: 'art', name: 'Art Paper 300g', price: 1.2, unit: 'sheet' };
const print1 = { id: 'print1', name: 'พิมพ์หน้าเดียว', price: 20, unit: 'sheet' };
const print2 = { id: 'print2', name: 'พิมพ์หน้า-หลัง', price: 30, unit: 'sheet' };
const coat = { id: 'coat', name: 'เคลือบด้าน', price: 20, unit: 'sheet' };

const makeProduct = () => ({
  ...newProduct('business-card', 'นามบัตร'), mode: 'packages', markup: 30, includedServiceIds: ['print1'],
  packages: [
    { id: 'a', name: 'A (no own list)', quantity: 100, price: 100 },
    { id: 'b', name: 'B (print2 + coat)', quantity: 100, price: 100, includedIds: ['print2', 'coat'] },
    { id: 'c', name: 'C (nothing included)', quantity: 100, price: 100, includedIds: [] }
  ]
});
const price = (product, packageId, services) => calculateProductPrice({ product, quantity: 100, sheets: 4, baseCost: 20, services, packageId }).total;

// ---------- pricing follows the selected package's own list ----------
const product = makeProduct();
assert.deepEqual(includedIdsFor(product, product.packages[0]), ['print1'], 'a set without its own list uses the product-wide list');
assert.deepEqual(includedIdsFor(product, product.packages[1]), ['print2', 'coat']);
assert.deepEqual(includedIdsFor(product, product.packages[2]), [], 'an empty own list means nothing is included');
assert.deepEqual(includedIdsFor(product, undefined), ['print1']);
assert.deepEqual(includedIdsFor({ includedServiceIds: undefined }, undefined), []);

assert.equal(price(product, 'a', [print1]), 100, 'A includes print1 (product-wide list)');
assert.equal(price(product, 'a', [print2, coat]), 360, 'A charges 156 + 104');
assert.equal(price(product, 'b', [print2, coat]), 100, 'B includes both');
assert.equal(price(product, 'b', [print1]), 204, 'B charges print1 (26 x 4)');
assert.equal(price(product, 'c', [print1, print2, coat]), 464, 'C includes nothing');
assert.equal(price(product, 'c', []), 100);

// Tiers keep using the product-wide list; formula charges everything.
const tiers = { ...makeProduct(), mode: 'tiers', tiers: [{ min: 1, price: 1 }] };
assert.equal(calculateProductPrice({ product: tiers, quantity: 100, sheets: 4, baseCost: 20, services: [print1] }).total, 100, 'tiers: print1 is included through the product-wide list');
const formula = { ...makeProduct(), mode: 'formula' };
assert.equal(itemCost({ product: formula, item: print1, sheets: 4, quantity: 100, includedIds: ['print1'] }).included, false, 'formula pricing ignores included lists');

// ---------- validation ----------
const valid = () => ({ products: [makeProduct()] });
assert.equal(validateSettings(valid()).success, true);
for (const bad of ['print1', { 0: 'x' }, [1], [''], Array.from({ length: 101 }, (_, i) => `s${i}`), ['x'.repeat(101)]]) {
  const settings = valid();
  settings.products[0].packages[1].includedIds = bad;
  assert.equal(validateSettings(settings).success, false, `includedIds ${JSON.stringify(bad).slice(0, 30)} must be rejected`);
}
const legacy = valid();
delete legacy.products[0].packages[1].includedIds;
assert.equal(validateSettings(legacy).success, true, 'settings saved before this field existed stay valid');

// ---------- order page: buttons and summary follow the set ----------
const opt = (pack, item, extra = {}) => optionPrice({ product, item, sheets: 4, quantity: 100, includedIds: includedIdsFor(product, pack), ...extra });
assert.equal(opt(product.packages[0], print1).text, 'รวมในเซต');
assert.equal(opt(product.packages[1], print1).text, '+฿104.00');
assert.equal(opt(product.packages[1], coat).text, 'รวมในเซต');
assert.equal(opt(product.packages[2], print1).text, '+฿104.00');
assert.equal(optionPrice({ product, item: print1, sheets: 4, quantity: 100 }).text, 'รวมในเซต', 'without an explicit list the product-wide one applies');

const settings = { version: 'v1', products: [product] };
const quoteFor = (packageId, services) => calculateBusinessCardQuote({ preset, material, services, quantity: 100, pricingSettings: settings, packageId });
for (const [packageId, services] of [['a', [print1]], ['a', [print2, coat]], ['b', [print2, coat]], ['b', [print1, coat]], ['c', [print1, print2, coat]], ['c', []]]) {
  const pack = product.packages.find(item => item.id === packageId);
  const quote = quoteFor(packageId, services);
  const lines = buildPriceBreakdown({ product, quote, packName: pack.name, quantity: 100, material, services, includedIds: includedIdsFor(product, pack) });
  const listed = Math.round(lines.filter(line => line.kind !== 'total').reduce((sum, line) => sum + line.value, 0) * 100) / 100;
  assert.ok(Math.abs(listed - quote.price) < 0.005, `${packageId}: summary adds up to ${listed}, price is ${quote.price}`);
  for (const line of lines.filter(entry => entry.kind === 'service')) {
    assert.equal(line.included, includedIdsFor(product, pack).includes(services.find(service => service.name === line.label).id), `${packageId}: ${line.label}`);
  }
}

// ---------- the Worker verifies orders with the same rule ----------
const item = (packageId, services) => {
  const quote = quoteFor(packageId, services);
  return buildOrderPayload({
    state: { material, services, preset, jobName: 'x', packageName: packageId, customerName: 'c', phone: '1', deliveryDate: '2026-09-30' },
    quote, orderKey: 'k', quoteNo: 'q', now: new Date('2026-09-19T00:00:00Z')
  }).orderItems[0];
};
const orderItem = item('b', [print2, coat]);
assert.equal(orderItem.pricingSnapshot.package.id, 'b');
assert.ok(verifyConfiguredPrice(orderItem, settings), 'a set that includes both services verifies');
// If staff later change what the set includes (same version), an order priced with the old rule is refused.
const changed = structuredClone(settings);
changed.products[0].packages[1].includedIds = [];
assert.throws(() => verifyConfiguredPrice(orderItem, changed), /ราคา|โปรโมชัน|เปลี่ยน/);

// ---------- set studio helpers ----------
const groups = () => [
  { id: 'print', name: 'พิมพ์', enabled: true, source: 'service', selectionMode: 'single', required: true, itemIds: ['print1', 'print2'] },
  { id: 'finish', name: 'เคลือบ', enabled: true, source: 'service', selectionMode: 'multiple', required: false, itemIds: ['coat', 'foil'] },
  { id: 'paper', name: 'วัสดุ', enabled: true, source: 'material', selectionMode: 'single', required: true, itemIds: ['art'] }
];
const studio = () => ({ ...makeProduct(), optionGroups: groups(), packages: [
  { id: 'a', name: 'A', quantity: 100, price: 100, optionIds: ['print1', 'coat'] },
  { id: 'b', name: 'B', quantity: 100, price: 100, optionIds: ['print2'], includedIds: ['print2'] }
] });

let p = studio();
assert.deepEqual(includedIdsOf(p, p.packages[0]), ['print1'], 'the studio shows the effective (product-wide) list');
// First change on a set copies the product-wide list so its other prices do not move.
assert.equal(setIncluded(p, 'a', 1, 'coat', true), true);
assert.deepEqual(p.packages[0].includedIds, ['print1', 'coat']);
assert.deepEqual(p.packages[1].includedIds, ['print2'], 'other sets untouched');
// A "choose one" group may include several services (the customer picks any of them for free).
assert.equal(setIncluded(p, 'a', 0, 'print2', true), true);
assert.deepEqual(p.packages[0].includedIds, ['print1', 'coat', 'print2'], 'print2 is added, print1 stays included');
assert.equal(setIncluded(p, 'a', 0, 'print1', false), true);
assert.deepEqual(p.packages[0].includedIds, ['coat', 'print2']);
assert.ok(p.packages[0].optionIds.includes('print2'), 'an included service is also offered in the set');
assert.equal(setIncluded(p, 'a', 1, 'foil', true), true);
assert.deepEqual(p.packages[0].includedIds, ['coat', 'print2', 'foil']);
assert.equal(setIncluded(p, 'a', 1, 'foil', false), true);
assert.deepEqual(p.packages[0].includedIds, ['coat', 'print2']);
// Materials cannot be included/excluded; unknown items and sets are ignored.
assert.equal(setIncluded(p, 'a', 2, 'art', true), false);
assert.equal(setIncluded(p, 'a', 0, 'nope', true), false);
assert.equal(setIncluded(p, 'zzz', 0, 'print1', true), false);
assert.equal(setIncluded(p, 'a', 9, 'print1', true), false);
assert.deepEqual(p.packages[0].includedIds, ['coat', 'print2']);

// Switching an item off as a choice removes it from the included list too.
assert.equal(toggleOffered(p.packages[0], 'print2'), false);
assert.ok(!p.packages[0].optionIds.includes('print2') && !p.packages[0].includedIds.includes('print2'));
assert.equal(toggleOffered(p.packages[0], 'print2'), true);
assert.ok(p.packages[0].optionIds.includes('print2'));
assert.ok(!p.packages[0].includedIds.includes('print2'), 'switching it back on does not silently include it again');
const noOwnList = { optionIds: ['x'] };
assert.equal(toggleOffered(noOwnList, 'x'), false);
assert.equal(noOwnList.includedIds, undefined, 'a set without its own list is left alone');

// Removing an item from its last group, or from the catalog, cleans included lists.
p = studio();
setIncluded(p, 'b', 1, 'coat', true);
setGroupItem(p, 1, 'coat', false);
assert.ok(!p.packages[1].includedIds.includes('coat'));
p = studio();
setIncluded(p, 'b', 0, 'print1', true);
removeItemEverywhere({ products: [p] }, 'print1');
assert.ok(!p.packages[1].includedIds.includes('print1'));
assert.ok(!p.includedServiceIds.includes('print1'));

// ---------- page wiring ----------
const orderSource = readFileSync(new URL('../business-card/order.js', import.meta.url), 'utf8');
assert.ok(/includedIdsFor\(state\.product,\s*state\.pack\)/.test(orderSource), 'order page resolves the included list from the selected set');
assert.ok(!orderSource.includes('state.product?.includedServiceIds'), 'order page must not read the product-wide list directly');
assert.ok(/defaultSelection\(/.test(orderSource) && /function syncSelected/.test(orderSource) && /recalc\(\)[\s\S]*syncSelected\(\)/.test(orderSource), 'default services come from the set and are shown as selected when the page opens');
const storefront = readFileSync(new URL('../business-card/app.js', import.meta.url), 'utf8');
assert.ok(storefront.includes('Array.isArray(item.includedIds)'), 'storefront defaults follow the set includedIds');
const studioPage = readFileSync(new URL('../pricing/app.js', import.meta.url), 'utf8');
assert.ok(studioPage.includes('data-included-id') && studioPage.includes('setIncluded('), 'the set studio has the included-in-set control');
assert.ok(studioPage.includes('includedIds: []'), 'a new set starts with nothing included');

console.log('Package included services test passed');
