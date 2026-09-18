import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newProduct, calculateProductPrice, itemCost, unitKind } from '../shared/product-pricing.js';
import { calculateBusinessCardQuote } from '../business-card/logic.js';
import { optionPrice, buildPriceBreakdown, fallbackPricingModel, formatBaht } from '../business-card/breakdown.js';

const preset = { id: '13x19', name: '13×19', usableW: 31.02, usableH: 47.26 };
const material = { id: 'art', name: 'Art Paper 300g', price: 1.2, unit: 'sheet' };
const printSingle = { id: 'print1', name: 'พิมพ์หน้าเดียว', price: 20, unit: 'sheet' };
const printDouble = { id: 'print2', name: 'พิมพ์หน้า-หลัง', price: 30, unit: 'sheet' };
const coat = { id: 'coat', name: 'เคลือบด้าน', price: 20, unit: 'sheet' };
const perPiece = { id: 'corner', name: 'ตัดมุม', price: 1.5, unit: 'piece' };
const perJob = { id: 'setup', name: 'ค่าเตรียมไฟล์', price: 50, unit: 'job' };
const odd = { id: 'odd', name: 'ราคาเศษ', price: 3.33, unit: 'sheet' };
const free = { id: 'free', name: 'ฟรี', price: 0, unit: 'sheet' };

const productWith = patch => ({ ...newProduct('business-card', 'นามบัตร'), ...patch });
const quoteFor = (product, { quantity = 100, services = [], packageId = '', code = '' } = {}) => calculateBusinessCardQuote({
  preset, material, services, quantity, packageId, code,
  pricingSettings: product ? { version: 'v1', products: [product] } : null
});
const sumOfLines = lines => Math.round(lines.filter(line => line.kind !== 'total').reduce((sum, line) => sum + line.value, 0) * 100) / 100;

// ---------- itemCost is the single source used by calculateProductPrice ----------
assert.equal(unitKind('sheet'), 'sheet');
assert.equal(unitKind('แผ่น'), 'sheet');
assert.equal(unitKind('ชิ้น'), 'piece');
assert.equal(unitKind('งาน'), 'job');
assert.equal(unitKind(undefined), 'job');
const formula = productWith({ mode: 'formula', markup: 30 });
let cost = itemCost({ product: formula, item: printSingle, sheets: 4, quantity: 100 });
assert.deepEqual([cost.kind, cost.amount, cost.cost, cost.included], ['sheet', 4, 80, false]);
assert.ok(Math.abs(cost.charge - 104) < 1e-9);
assert.equal(itemCost({ product: formula, item: perPiece, sheets: 4, quantity: 100 }).amount, 100);
assert.equal(itemCost({ product: formula, item: perJob, sheets: 4, quantity: 100 }).amount, 1);
const packages = productWith({ mode: 'packages', packages: [{ id: 'p', name: 'P', quantity: 100, price: 120 }], includedServiceIds: ['print1'] });
assert.equal(itemCost({ product: packages, item: printSingle, sheets: 4, quantity: 100 }).included, true);
assert.equal(itemCost({ product: packages, item: coat, sheets: 4, quantity: 100 }).included, false);
assert.equal(itemCost({ product: formula, item: material, sheets: 4, quantity: 100, isMaterial: true }).included, false, 'formula pricing charges the material');
assert.equal(itemCost({ product: packages, item: material, sheets: 4, quantity: 100, isMaterial: true }).included, true, 'packages include the material');
assert.equal(calculateProductPrice({ product: formula, quantity: 100, sheets: 4, baseCost: 20, services: [printSingle] }).extras, 104);

// ---------- what a button says ----------
let tag = optionPrice({ product: formula, item: printSingle, sheets: 4, quantity: 100 });
assert.deepEqual([tag.included, tag.charge, tag.text, tag.basis], [false, 104, '+฿104.00', 'แผ่นละ ฿26.00 (ใช้ทั้งหมด 4 แผ่น)']);
tag = optionPrice({ product: formula, item: perPiece, sheets: 4, quantity: 100 });
assert.deepEqual([tag.text, tag.basis], ['+฿195.00', 'ใบละ ฿1.95 (ใช้ทั้งหมด 100 ใบ)']);
tag = optionPrice({ product: formula, item: perJob, sheets: 4, quantity: 100 });
assert.deepEqual([tag.text, tag.basis], ['+฿65.00', 'คิดต่องาน (ครั้งเดียว)']);
tag = optionPrice({ product: formula, item: odd, sheets: 10, quantity: 100 });
assert.equal(tag.text, '+฿43.29');
assert.equal(tag.basis, 'แผ่นละ ฿4.329 (ใช้ทั้งหมด 10 แผ่น)', 'unit price keeps enough decimals to multiply out to the total');
tag = optionPrice({ product: formula, item: free, sheets: 4, quantity: 100 });
assert.deepEqual([tag.included, tag.text, tag.basis], [true, 'รวมในเซต', '']);
tag = optionPrice({ product: packages, item: printSingle, sheets: 4, quantity: 100 });
assert.deepEqual([tag.included, tag.text], [true, 'รวมในเซต']);
tag = optionPrice({ product: packages, item: material, sheets: 4, quantity: 100, isMaterial: true });
assert.equal(tag.text, 'รวมในเซต', 'a material that is part of the package is not shown as an extra cost');
tag = optionPrice({ product: formula, item: printSingle, sheets: 1000, quantity: 25000 });
assert.equal(tag.text, '+฿26,000.00');
assert.equal(tag.basis, 'แผ่นละ ฿26.00 (ใช้ทั้งหมด 1,000 แผ่น)');
assert.equal(formatBaht(1234.5), '1,234.50');

// The number on a button is what the price really goes up by.
for (const product of [formula, productWith({ mode: 'formula', markup: 0 }), productWith({ mode: 'formula', markup: 55 })]) {
  for (const service of [printSingle, coat, perPiece, perJob, odd]) {
    const without = quoteFor(product, { services: [] });
    const withService = quoteFor(product, { services: [service] });
    const shown = optionPrice({ product, item: service, sheets: withService.sheets, quantity: withService.pieces }).charge;
    assert.ok(Math.abs((withService.price - without.price) - shown) <= 0.011, `${service.id}@${product.markup}%: price rose by ${withService.price - without.price}, button says ${shown}`);
  }
}
const packagePricing = productWith({ mode: 'packages', markup: 30, includedServiceIds: ['print1'], packages: [{ id: 'essential', name: 'Essential', quantity: 100, price: 123.24 }] });
const baseQuote = quoteFor(packagePricing, { packageId: 'essential', services: [printSingle] });
const withCoat = quoteFor(packagePricing, { packageId: 'essential', services: [printSingle, coat] });
assert.equal(baseQuote.price, 123.24, 'included print does not change the package price');
assert.ok(Math.abs(withCoat.price - baseQuote.price - optionPrice({ product: packagePricing, item: coat, sheets: withCoat.sheets, quantity: withCoat.pieces }).charge) <= 0.011);

// ---------- the price summary always adds up to the total ----------
const promo = (extra = {}) => ({ id: 'sale', name: 'โปรลด 10%', enabled: true, type: 'percent', scope: 'base', value: 10, minQuantity: 0, minSpend: 0, code: '', start: '', end: '', ...extra });
const scenarios = [
  ['formula', formula, {}],
  ['formula + promo on total', productWith({ mode: 'formula', promotions: [promo({ scope: 'total' })] }), {}],
  ['formula + rounding to 5', productWith({ mode: 'formula', rounding: 5 }), {}],
  ['formula + minimum', productWith({ mode: 'formula', minimum: 5000 }), {}],
  ['packages', packagePricing, { packageId: 'essential' }],
  ['packages + fixed promo', productWith({ ...packagePricing, promotions: [promo({ type: 'fixed', value: 15 })] }), { packageId: 'essential' }],
  ['packages + rounding to 10', productWith({ ...packagePricing, rounding: 10 }), { packageId: 'essential' }],
  ['tiers', productWith({ mode: 'tiers', tiers: [{ min: 100, price: 5 }, { min: 500, price: 3 }] }), {}],
  ['no product configured', null, {}]
];
const serviceSets = [[], [printSingle], [printSingle, coat], [printDouble, coat, perPiece, perJob], [odd, odd && { ...odd, id: 'odd2' }]];
for (const [name, product, options] of scenarios) {
  for (const services of serviceSets) {
    const quote = quoteFor(product, { ...options, services });
    const lines = buildPriceBreakdown({ product, quote, packName: 'Essential', quantity: 100, material, services });
    const listed = sumOfLines(lines);
    assert.ok(Math.abs(listed - quote.price) < 0.005, `${name} / ${services.length} services: lines add up to ${listed}, price is ${quote.price}`);
    const adjustment = lines.find(line => line.kind === 'adjustment');
    assert.ok(!adjustment || Math.abs(adjustment.value) <= 0.03 * (services.length + 2) || /rounding|minimum/.test(name), `${name}: unexplained adjustment ${adjustment?.value}`);
    assert.equal(lines.at(-1).kind, 'total');
    assert.equal(lines.at(-1).text, `฿${formatBaht(quote.price)}`);
    assert.equal(lines.filter(line => line.kind === 'service').length, services.length, 'every selected service gets its own line');
    assert.ok(lines.every(line => typeof line.text === 'string' && line.text.length), 'every line has an amount to show');
  }
}

// A few exact expectations.
let quote = quoteFor(formula, { services: [printSingle, coat] });
let lines = buildPriceBreakdown({ product: formula, quote, packName: 'Custom', quantity: 100, material, services: [printSingle, coat] });
assert.deepEqual(lines.map(line => line.kind), ['base', 'material', 'service', 'service', 'total']);
assert.equal(lines[2].text, '+฿104.00');
assert.equal(lines[3].text, '+฿104.00');
assert.equal(lines[1].label, 'Art Paper 300g');
assert.equal(lines[1].basis, 'แผ่นละ ฿1.56 (ใช้ทั้งหมด 4 แผ่น)', 'wording of the material line in the summary');
quote = quoteFor(packagePricing, { packageId: 'essential', services: [printSingle, coat] });
lines = buildPriceBreakdown({ product: packagePricing, quote, packName: 'Essential', quantity: 100, material, services: [printSingle, coat] });
assert.equal(lines[0].text, '฿123.24');
assert.equal(lines[1].text, 'รวมในเซต', 'material');
assert.equal(lines[2].text, 'รวมในเซต', 'included print');
assert.equal(lines[3].text, '+฿104.00', 'extra coating is charged');
quote = quoteFor(productWith({ ...packagePricing, promotions: [promo({ type: 'fixed', value: 15 })] }), { packageId: 'essential', services: [] });
lines = buildPriceBreakdown({ product: productWith({ ...packagePricing, promotions: [promo({ type: 'fixed', value: 15 })] }), quote, packName: 'Essential', quantity: 100, material, services: [] });
assert.equal(lines.find(line => line.kind === 'discount').text, '−฿15.00');
assert.match(lines.find(line => line.kind === 'discount').label, /โปรลด 10%/);
assert.deepEqual(fallbackPricingModel().includedServiceIds, []);
assert.equal(fallbackPricingModel().markup, 30);

// Rush (boost) surcharge is listed too.
const rushQuote = calculateBusinessCardQuote({ preset, material, services: [printSingle], quantity: 100, boost: { multiplier: 0.5 }, pricingSettings: { version: 'v1', products: [formula] } });
lines = buildPriceBreakdown({ product: formula, quote: rushQuote, packName: 'Custom', quantity: 100, material, services: [printSingle] });
assert.ok(lines.some(line => line.kind === 'rush' && line.value > 0));
assert.ok(Math.abs(sumOfLines(lines) - rushQuote.price) < 0.005);

// ---------- page wiring ----------
const orderSource = readFileSync(new URL('../business-card/order.js', import.meta.url), 'utf8');
assert.ok(orderSource.includes("from './breakdown.js'"));
assert.ok(!orderSource.includes('รวมในราคา'), 'the old "included in the price" line hides what an extra costs');
assert.ok(!/\/ \$\{esc\(x\.unit\)\}/.test(orderSource), 'option buttons must not show the per-unit "/ sheet" text again');
assert.ok(orderSource.includes('updatePrices()'));
assert.ok(!orderSource.includes('opt-basis') && !/tag\.innerHTML=[^;]*info\.basis/.test(orderSource), 'option buttons show only the total, the formula belongs to the summary');
assert.ok(/line\.basis\?`<small>/.test(orderSource), 'the summary shows the formula under each item');

console.log('Business card breakdown test passed');
