import assert from "node:assert/strict";
import {
  CUSTOMER_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  PRODUCTION_STATUS,
  validateOrderFoundation
} from "./domain/order.js";

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
