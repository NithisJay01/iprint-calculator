// Totals of a whole cart. Items are already priced by their product adapter ({ price, points }).
// VAT is added on top of the item prices, exactly like the order payload sent to the Worker
// (see buildOrderPayload: vat = price x 7%, grandTotal = price + vat).
export const VAT_PERCENT = 7;
export const SHIPPING_FEES = Object.freeze({ pickup: 0, ems: 50 });

export const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100;

// Price of one item when the customer asks for it earlier (see shared/rush.js). It is the exact formula the Worker
// verifies: the price BEFORE rounding (`basePrice`) times (1 + multiplier), rounded once.
export const rushPrice = (entry, multiplier) => roundMoney((entry.basePrice ?? entry.price) * (1 + (Number(multiplier) || 0)));

// `rush` is the multiplier of the chosen rush date (0 for a normal date).
export function cartTotals(items, { shipping = 'pickup', rush = 0 } = {}) {
  const priced = items.filter(item => item && !item.problems?.length);
  const itemsTotal = roundMoney(priced.reduce((sum, item) => sum + (Number(item.price) || 0), 0));
  const discount = roundMoney(priced.reduce((sum, item) => sum + (Number(item.discount) || 0), 0));
  const rushFee = rush > 0 ? roundMoney(priced.reduce((sum, item) => sum + rushPrice(item, rush), 0) - itemsTotal) : 0;
  // `subtotal` is what the items are charged, rush surcharge included (the Worker's order total).
  const subtotal = roundMoney(itemsTotal + rushFee);
  const vat = roundMoney(subtotal * VAT_PERCENT / 100);
  const shippingFee = SHIPPING_FEES[shipping] ?? 0;
  // Capacity is booked once per order, so the delivery date is checked against the points of all items together.
  const points = roundMoney(priced.reduce((sum, item) => sum + (Number(item.points) || 0), 0));
  return { itemsTotal, subtotal, discount, rushFee, vat, shippingFee, grand: roundMoney(subtotal + vat + shippingFee), points, count: priced.length };
}
