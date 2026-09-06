export const ORDER_STATUS = Object.freeze({
  NEW: "NEW",
  IN_PROGRESS: "IN_PROGRESS",
  PRODUCTION: "PRODUCTION",
  READY: "READY",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED"
});

export const PAYMENT_STATUS = Object.freeze({
  WAITING_PAYMENT: "WAITING_PAYMENT",
  VERIFYING: "VERIFYING",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
  CANCELLED: "CANCELLED"
});

export const PRODUCTION_STATUS = Object.freeze({
  WAITING: "WAITING",
  QUEUED: "QUEUED",
  IN_PRODUCTION: "IN_PRODUCTION",
  QC: "QC",
  REWORK: "REWORK",
  READY: "READY",
  COMPLETED: "COMPLETED",
  ON_HOLD: "ON_HOLD"
});

export const CUSTOMER_STATUS = Object.freeze({
  ORDER_RECEIVED: "ORDER_RECEIVED",
  WAITING_PAYMENT: "WAITING_PAYMENT",
  PREPARING: "PREPARING",
  IN_PRODUCTION: "IN_PRODUCTION",
  READY: "READY",
  COMPLETED: "COMPLETED",
  NEEDS_INFO: "NEEDS_INFO",
  CANCELLED: "CANCELLED"
});

const finiteMoney = value => Number.isFinite(Number(value)) && Number(value) >= 0;
const nearlyEqual = (left, right) => Math.abs(Number(left) - Number(right)) <= 0.01;

export function validateOrderFoundation(input) {
  const order = input && typeof input === "object" ? input : {};
  const items = Array.isArray(order.orderItems) ? order.orderItems : [];
  const errors = [];
  const orderKey = String(order.orderKey || "").trim();
  const quoteNo = String(order.quoteNo || "").trim();

  if (!orderKey || orderKey.length > 100) errors.push("orderKey must contain 1-100 characters");
  if (!quoteNo || quoteNo.length > 100) errors.push("quoteNo must contain 1-100 characters");
  if (!items.length || items.length > 20) errors.push("orderItems must contain 1-20 items");

  const itemIds = new Set();
  items.forEach((item, index) => {
    const prefix = `orderItems[${index}]`;
    const id = String(item?.id || "").trim();
    const name = String(item?.name || "").trim();
    const quantity = Number(item?.quantity);
    const price = Number(item?.price);

    if (!id || id.length > 100) errors.push(`${prefix}.id must contain 1-100 characters`);
    else if (itemIds.has(id)) errors.push(`${prefix}.id must be unique`);
    else itemIds.add(id);
    if (!name || name.length > 300) errors.push(`${prefix}.name must contain 1-300 characters`);
    if (!Number.isFinite(quantity) || quantity <= 0) errors.push(`${prefix}.quantity must be greater than 0`);
    if (!Number.isFinite(price) || price < 0) errors.push(`${prefix}.price must be 0 or greater`);
  });

  if (!finiteMoney(order.total)) errors.push("total must be 0 or greater");
  if (!finiteMoney(order.vat)) errors.push("vat must be 0 or greater");
  if (!finiteMoney(order.grandTotal)) errors.push("grandTotal must be 0 or greater");

  const itemTotal = items.reduce((sum, item) => sum + (Number(item?.price) || 0), 0);
  if (finiteMoney(order.total) && !nearlyEqual(order.total, itemTotal)) {
    errors.push("total must equal the sum of order item prices");
  }
  if (finiteMoney(order.total) && finiteMoney(order.vat) && finiteMoney(order.grandTotal) &&
      !nearlyEqual(order.grandTotal, Number(order.total) + Number(order.vat))) {
    errors.push("grandTotal must equal total plus vat");
  }

  return {
    success: errors.length === 0,
    errors,
    value: {
      orderKey,
      quoteNo,
      customer: String(order.customer || "-").trim().slice(0, 300) || "-",
      phone: String(order.phone || "").trim().slice(0, 100),
      email: String(order.email || "").trim().slice(0, 320),
      total: Number(order.total) || 0,
      vat: Number(order.vat) || 0,
      grandTotal: Number(order.grandTotal) || 0,
      currency: "THB",
      createdAt: normalizeCreatedAt(order.createdAt),
      orderStatus: ORDER_STATUS.NEW,
      paymentStatus: PAYMENT_STATUS.WAITING_PAYMENT,
      productionStatus: PRODUCTION_STATUS.WAITING,
      customerStatus: CUSTOMER_STATUS.ORDER_RECEIVED
    }
  };
}

function normalizeCreatedAt(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
