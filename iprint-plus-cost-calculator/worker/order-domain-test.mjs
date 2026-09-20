import assert from "node:assert/strict";
import {
  CUSTOMER_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  PRODUCTION_STATUS,
  buildTicketJobName,
  validateOrderFoundation
} from "./domain/order.js";

assert.equal(
  buildTicketJobName({
    customer: "Bdms",
    quoteNo: "QT-1",
    orderItems: [{
      name: "Coupon-150Baht-V1",
      size: "8.00 × 20.00 cm",
      material: { name: "PVC 130g" },
      sheets: 5
    }]
  }),
  "(Bdms)Coupon-150Baht-V1(8x20cm)PVC-130g(5s)"
);

assert.equal(
  buildTicketJobName({
    customer: "ACME / Bangkok",
    quoteNo: "QT-2",
    orderItems: [
      { name: "Poster V3", width: 9, height: 5.4, paper: { name: "Art Card 300g" }, sheets: 12.2 },
      { name: "Second job", size: "10 × 10 cm", material: { name: "PP" }, sheets: 2 }
    ]
  }),
  "(ACME-Bangkok)Poster-V3(9x5.4cm)Art-Card-300g(13s)(+1jobs)"
);

const valid = validateOrderFoundation({
  orderKey: "order-1",
  quoteNo: "QT-1",
  customer: "ลูกค้าทดสอบ",
  phone: "0812345678",
  total: 150,
  vat: 10.5,
  grandTotal: 160.5,
  createdAt: "2026-09-04T08:00:00+07:00",
  orderItems: [
    { id: "item-1", name: "นามบัตร", quantity: 100, price: 100 },
    { id: "item-2", name: "เคลือบ", quantity: 100, price: 50 }
  ]
});

assert.equal(valid.success, true, valid.errors.join("\n"));
assert.equal(valid.value.currency, "THB");
assert.equal(valid.value.orderStatus, ORDER_STATUS.NEW);
assert.equal(valid.value.paymentStatus, PAYMENT_STATUS.WAITING_PAYMENT);
assert.equal(valid.value.productionStatus, PRODUCTION_STATUS.WAITING);
assert.equal(valid.value.customerStatus, CUSTOMER_STATUS.ORDER_RECEIVED);
assert.equal(valid.value.createdAt, "2026-09-04T01:00:00.000Z");

const validBoost = validateOrderFoundation({
  orderKey: 'boost-1', quoteNo: 'BOOST-1', total: 125, vat: 8.75, grandTotal: 133.75,
  orderItems: [{ id: 'boost-item', name: 'งานเร่ง', quantity: 1, basePrice: 100, price: 125, boost: { days: 1, multiplier: 0.25 } }]
});
assert.equal(validBoost.success, true, validBoost.errors.join('\n'));

// Every earlier day adds 25%: 1 day +25%, 2 days +50%, 3 days +75%, 4 days +100%.
const boostOrder = (days, multiplier, price) => validateOrderFoundation({
  orderKey: `boost-${days}`, quoteNo: `BOOST-${days}`, total: price, vat: price * 0.07, grandTotal: price * 1.07,
  orderItems: [{ id: 'boost-item', name: 'งานเร่ง', quantity: 1, basePrice: 100, price, boost: { days, multiplier } }]
});
for (const [days, multiplier] of [[1, 0.25], [2, 0.5], [3, 0.75], [4, 1]]) {
  assert.equal(boostOrder(days, multiplier, 100 * (1 + multiplier)).success, true, `${days} day(s) earlier`);
}
assert.equal(boostOrder(1, 0.5, 150).success, false, 'the old 50% per day step is no longer valid');
assert.equal(boostOrder(2, 0.25, 125).success, false, 'the multiplier must match the number of days');
assert.equal(boostOrder(5, 1.25, 225).success, false, 'more than 4 days is refused');

const invalidBoost = validateOrderFoundation({
  orderKey: 'boost-2', quoteNo: 'BOOST-2', total: 120, vat: 8.4, grandTotal: 128.4,
  orderItems: [{ id: 'boost-item', name: 'งานเร่ง', quantity: 1, basePrice: 100, price: 120, boost: { days: 1, multiplier: 0.25 } }]
});
assert.equal(invalidBoost.success, false);
assert.ok(invalidBoost.errors.includes('orderItems[0].price must include the configured boost surcharge'));

const invalid = validateOrderFoundation({
  orderKey: "order-1",
  quoteNo: "QT-1",
  total: 99,
  vat: 7,
  grandTotal: 100,
  orderItems: [
    { id: "same", name: "งานหนึ่ง", quantity: 1, price: 50 },
    { id: "same", name: "งานสอง", quantity: 0, price: 50 }
  ]
});

assert.equal(invalid.success, false);
assert.ok(invalid.errors.includes("orderItems[1].id must be unique"));
assert.ok(invalid.errors.includes("orderItems[1].quantity must be greater than 0"));
assert.ok(invalid.errors.includes("total must equal the sum of order item prices"));
assert.ok(invalid.errors.includes("grandTotal must equal total plus vat"));

console.log("Order domain test passed");
