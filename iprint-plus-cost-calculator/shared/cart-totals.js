// Totals of a whole cart. Items are already priced by their product adapter ({ price, points }).
// VAT is added on top of the item prices, exactly like the order payload sent to the Worker
// (see buildOrderPayload: vat = price x 7%, grandTotal = price + vat).
export const VAT_PERCENT = 7;
export const SHIPPING_FEES = Object.freeze({ pickup: 0, ems: 50 });

export const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100;

export function cartTotals(items, { shipping = 'pickup' } = {}) {
  const priced = items.filter(item => item && !item.problems?.length);
  const subtotal = roundMoney(priced.reduce((sum, item) => sum + (Number(item.price) || 0), 0));
  const discount = roundMoney(priced.reduce((sum, item) => sum + (Number(item.discount) || 0), 0));
  const vat = roundMoney(subtotal * VAT_PERCENT / 100);
  const shippingFee = SHIPPING_FEES[shipping] ?? 0;
  // Capacity is booked once per order, so the delivery date is checked against the points of all items together.
  const points = roundMoney(priced.reduce((sum, item) => sum + (Number(item.points) || 0), 0));
  return { subtotal, discount, vat, shippingFee, grand: roundMoney(subtotal + vat + shippingFee), points, count: priced.length };
}
