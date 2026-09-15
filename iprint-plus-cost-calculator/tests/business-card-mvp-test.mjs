import assert from 'node:assert/strict';
import { buildOrderPayload, calculateBusinessCardQuote, findBestLayout } from '../business-card/logic.js';

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
