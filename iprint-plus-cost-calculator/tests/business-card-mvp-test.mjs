import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOrderPayload, calculateBusinessCardQuote, findBestLayout } from '../business-card/logic.js';
import { defaultBusinessCardPackages, newBusinessCardProduct } from '../shared/business-card-product.js';

const landingPage = readFileSync(new URL('../business-card/index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../business-card/styles.css', import.meta.url), 'utf8');
const orderPage = readFileSync(new URL('../business-card/order.html', import.meta.url), 'utf8');
const pricingApp = readFileSync(new URL('../pricing/app.js', import.meta.url), 'utf8');
const staffCatalogApp = readFileSync(new URL('../js/staff-catalog.js', import.meta.url), 'utf8');
const mainApp = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
for (const content of ['PRODUCT CATALOG', '01 / DIMENSIONS', '02 / PAPERS & MATERIALS', '03 / SPECIAL TECHNIQUES', 'MATERIAL × FINISH SYNERGY', '05 / WORK PROCESS', 'PRODUCT SPECIFICATIONS SUMMARY']) {
  assert.match(landingPage, new RegExp(content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(landingPage, /id="order" class="builder"/);
assert.match(landingPage, /href="\.\.\/catalog\/"/);
assert.match(landingPage, /class="hero-back"[^>]+href="\.\.\/catalog\/"/);
assert.match(styles, /--page:\s*#eef6ff/);
assert.match(styles, /--blue:\s*#0a8cff/);
assert.match(styles, /color-scheme:\s*light/);
assert.match(styles, /@media \(max-width:\s*760px\)/);
assert.match(styles, /\.catalog-grid/);
assert.match(landingPage, /id="catalogCount"/);
assert.match(readFileSync(new URL('../business-card/app.js', import.meta.url), 'utf8'), /p\.description \|\| p\.tagline/);
const defaultSets = defaultBusinessCardPackages();
assert.deepEqual(defaultSets.map(item => item.id), ['essential', 'corporate', 'signature']);
const configuredBusinessCard = newBusinessCardProduct();
assert.equal(configuredBusinessCard.mode, 'packages');
assert.equal(configuredBusinessCard.packages.length, 3);
configuredBusinessCard.packages.splice(0, 1);
assert.deepEqual(configuredBusinessCard.packages.map(item => item.id), ['corporate', 'signature']);
// Catalog items are created and deactivated from an item picker inside the set studio (no navigation away).
assert.match(pricingApp, /data-open-picker="\$\{index\}"/);
assert.match(pricingApp, /createCatalogItem\(/);
assert.match(pricingApp, /deactivateCatalogItem\(/);
assert.doesNotMatch(pricingApp, /\/staff\/\?catalog=/);
// The full catalog page stays one click away, in a new tab so unsaved set edits are not lost.
assert.match(readFileSync(new URL('../pricing/index.html', import.meta.url), 'utf8'), /href="\/staff\/\?catalog=materials" target="_blank" rel="noopener"/);
assert.match(staffCatalogApp, /function openStaffCatalogFromQuery\(\)/);
assert.match(staffCatalogApp, /openStaffCatalog\(requestedType\)/);
assert.match(mainApp, /openStaffCatalogFromQuery\(\)/);
for (const content of ['สร้างออร์เดอร์นามบัตร', 'ตะกร้าสินค้าของคุณ', 'เลือกวันที่ต้องการส่งสินค้า', 'ชำระเงินและระบุที่อยู่จัดส่ง', 'ส่งหลักฐานชำระเงิน']) assert.match(orderPage, new RegExp(content));

const preset = { id:'paper-1', name:'13×19 กระดาษมาตรฐาน', usableW:31.02, usableH:47.26 };
const material = { id:'material-1', name:'Art Paper 300g', price:1.2, unit:'sheet', updatedAt:'2026-09-15T00:00:00.000Z' };
const print = { id:'service-print', name:'พิมพ์หน้า-หลัง', price:30, unit:'sheet', serviceRole:'PRINT_DOUBLE', capacityPoints:2, capacityBasis:'job', capacityStep:1, updatedAt:'2026-09-15T00:00:00.000Z' };
const laminate = { id:'service-laminate', name:'เคลือบด้าน', price:20, unit:'sheet', capacityPoints:.25, capacityBasis:'sheet', capacityStep:1, updatedAt:'2026-09-15T00:00:00.000Z' };

assert.deepEqual(findBestLayout(preset), { yield:25, columns:5, rows:5, rotated:true });
const quote = calculateBusinessCardQuote({ preset, material, services:[print,laminate], quantity:500 });
assert.equal(quote.sheets, 20);
assert.equal(quote.basePrice, 1396.2);
assert.equal(quote.price, 1396.2);
assert.equal(quote.points, 8);

const state = { preset, material, services:[print,laminate], jobName:'นามบัตรฝ่ายขาย', version:'V1', packageName:'Corporate', references:[], frontFile:{}, backFile:{}, driveLink:'', note:'ตรวจชื่อก่อนผลิต', deliveryDate:'2026-09-20', boost:null, customerName:'บริษัททดสอบ', phone:'0812345678', email:'', lineId:'', address:'กรุงเทพฯ', paymentMethod:'รอใบแจ้งชำระ' };
const order = buildOrderPayload({ state, quote, now:new Date('2026-09-15T03:00:00.000Z'), orderKey:'business-card-test', quoteNo:'BC-TEST' });
assert.equal(order.orderItems.length, 1);
assert.equal(order.orderItems[0].printSide, 'double');
assert.equal(order.orderItems[0].artworkSides.hasBack, true);
assert.equal(order.orderItems[0].previewImages.length, 1);
assert.equal(order.total, quote.price);
assert.equal(order.grandTotal, order.total + order.vat);
assert.equal(order.orderItems[0].material.updatedAt, material.updatedAt);
console.log('Business-card MVP logic test passed');
