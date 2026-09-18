import assert from 'node:assert/strict';

// localStorage stand-in (the cart module reads/writes it directly).
const makeStorage = () => {
  const data = new Map();
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: key => { throw new Error('unused'); },
    removeItem: key => data.delete(key),
    clear: () => data.clear(),
    _data: data
  };
};
const storage = makeStorage();
storage.setItem = (key, value) => { if (storage.failWrites) throw new Error('QuotaExceededError'); storage._data.set(key, String(value)); };
globalThis.localStorage = storage;

const {
  CART_KEY, CART_MAX_ITEMS, readCart, cartCount, cartItems, getCartItem, addCartItem, updateCartItem, removeCartItem, clearCart, productCartItem, upsertCartItem
} = await import('../shared/cart.js');
const { cartTotals, VAT_PERCENT, SHIPPING_FEES, roundMoney } = await import('../shared/cart-totals.js');

const reset = () => { storage.clear(); storage.failWrites = false; };

// ---------- empty / add / read ----------
reset();
assert.deepEqual(readCart(), { version: 2, items: [] });
assert.equal(cartCount(), 0);

let result = addCartItem({ productId: 'business-card', packageId: 'essential', quantity: 100, serviceIds: ['s1'], promoCode: '' });
assert.equal(result.ok, true);
assert.match(result.id, /\S{8,}/);
const first = getCartItem(result.id);
assert.equal(first.productId, 'business-card');
assert.equal(first.packageId, 'essential');
assert.ok(Date.parse(first.addedAt) > 0);

// The same product can be in the cart several times (the old cart replaced the first one).
const second = addCartItem({ productId: 'business-card', packageId: 'corporate', quantity: 500 });
const third = addCartItem({ productId: 'sticker', sizeId: 'a6', quantity: 50 });
assert.equal(cartCount(), 3);
assert.deepEqual(cartItems().map(item => item.packageId ?? item.sizeId), ['essential', 'corporate', 'a6']);
assert.notEqual(second.id, result.id);
assert.equal(new Set(cartItems().map(item => item.id)).size, 3, 'item ids are unique');

// A caller cannot choose the id, and invalid items are refused.
const forced = addCartItem({ id: 'mine', productId: 'business-card' });
assert.notEqual(forced.id, 'mine');
removeCartItem(forced.id);
for (const bad of [null, undefined, {}, { productId: '' }, { productId: 5 }]) {
  assert.equal(addCartItem(bad).ok, false, JSON.stringify(bad));
}
assert.equal(cartCount(), 3);

// ---------- update / remove ----------
const updated = updateCartItem(second.id, { quantity: 1000, promoCode: 'SAVE', id: 'hacked', productId: 'other', addedAt: '1999-01-01' });
assert.equal(updated.quantity, 1000);
assert.equal(updated.promoCode, 'SAVE');
assert.equal(updated.id, second.id, 'id cannot be changed');
assert.equal(updated.productId, 'business-card', 'product cannot be changed');
assert.notEqual(updated.addedAt, '1999-01-01');
assert.equal(updated.packageId, 'corporate', 'other choices are kept');
assert.equal(updateCartItem('missing', { quantity: 1 }), null);

removeCartItem(second.id);
assert.deepEqual(cartItems().map(item => item.id), [result.id, third.id], 'only the chosen item is removed');
removeCartItem('missing');
assert.equal(cartCount(), 2);
clearCart();
assert.equal(cartCount(), 0);

// ---------- limits and storage failures ----------
reset();
for (let index = 0; index < CART_MAX_ITEMS; index += 1) assert.equal(addCartItem({ productId: 'business-card', quantity: index + 1 }).ok, true);
result = addCartItem({ productId: 'business-card', quantity: 999 });
assert.deepEqual([result.ok, result.reason], [false, 'CART_FULL']);
assert.equal(cartCount(), 20);
assert.equal(CART_MAX_ITEMS, 20, 'same limit as the Worker (orderItems 1-20)');

reset();
storage.failWrites = true;
assert.deepEqual([addCartItem({ productId: 'business-card' }).ok, addCartItem({ productId: 'business-card' }).reason], [false, 'STORAGE_UNAVAILABLE']);
storage.failWrites = false;
assert.equal(cartCount(), 0, 'a failed write leaves no phantom item behind');

reset();
storage.setItem(CART_KEY, '{not json');
assert.deepEqual(readCart(), { version: 2, items: [] }, 'corrupt storage behaves like an empty cart');
storage.setItem(CART_KEY, JSON.stringify({ version: 2, items: [{ productId: 'a', id: 'ok' }, { productId: 'b' }, null, { id: 'x' }, 'text'] }));
assert.deepEqual(cartItems().map(item => item.id), ['ok'], 'malformed entries are dropped');

// ---------- migration from the single-item cart ----------
reset();
storage.setItem(CART_KEY, JSON.stringify({ version: 1, items: [
  { productId: 'business-card', packageId: 'corporate', quantity: 500, cartQty: 3, serviceIds: ['s1'] },
  { productId: 'business-card', packageId: 'essential', quantity: 100, cartQty: 1 },
  { productId: '', packageId: 'x' }
] }));
let migrated = readCart();
assert.equal(migrated.version, 2);
assert.equal(migrated.items.length, 4, 'cartQty 3 becomes three items so the total stays the same');
assert.deepEqual(migrated.items.map(item => item.packageId), ['corporate', 'corporate', 'corporate', 'essential']);
assert.ok(migrated.items.every(item => item.id && !('cartQty' in item)));
assert.deepEqual(migrated.items[0].serviceIds, ['s1']);
assert.equal(new Set(migrated.items.map(item => item.id)).size, 4);
assert.equal(JSON.parse(storage.getItem(CART_KEY)).version, 2, 'the migrated cart is stored');
assert.deepEqual(readCart().items.map(item => item.id), migrated.items.map(item => item.id), 'ids stay the same on the next read');

reset();
storage.setItem(CART_KEY, JSON.stringify({ version: 1, items: [{ productId: 'business-card', packageId: 'x', cartQty: 500 }] }));
assert.equal(readCart().items.length, CART_MAX_ITEMS, 'a huge cartQty is capped');

reset();
storage.setItem('iprint-business-card-cart', JSON.stringify({ packageId: 'signature', quantity: 1000, cartQty: 2 }));
migrated = readCart();
assert.deepEqual(migrated.items.map(item => [item.productId, item.packageId]), [['business-card', 'signature'], ['business-card', 'signature']]);
assert.equal(storage.getItem('iprint-business-card-cart'), null, 'the legacy key is removed');

// ---------- deprecated single-item API (for pages still cached in browsers) ----------
reset();
upsertCartItem({ productId: 'business-card', packageId: 'essential', quantity: 100 });
upsertCartItem({ productId: 'business-card', packageId: 'corporate', quantity: 500 });
assert.equal(cartCount(), 1, 'the old API keeps its one-item-per-product behaviour');
assert.equal(productCartItem('business-card').packageId, 'corporate');
assert.equal(productCartItem('sticker'), null);

// ---------- totals ----------
const priced = [
  { price: 1000, discount: 100, points: 2.5 },
  { price: 500.55, discount: 0, points: 1.25 },
  { price: 999, discount: 0, points: 9, problems: ['เซตนี้ไม่มีขายแล้ว'] }
];
let totals = cartTotals(priced);
assert.equal(VAT_PERCENT, 7);
assert.equal(totals.subtotal, 1500.55, 'items with problems are not charged');
assert.equal(totals.discount, 100);
assert.equal(totals.vat, 105.04);
assert.equal(totals.shippingFee, 0);
assert.equal(totals.grand, 1605.59);
assert.equal(totals.points, 3.75, 'capacity points of all items are added together');
assert.equal(totals.count, 2);
totals = cartTotals(priced, { shipping: 'ems' });
assert.equal(totals.shippingFee, SHIPPING_FEES.ems);
assert.equal(totals.grand, 1655.59);
assert.deepEqual(cartTotals([]), { subtotal: 0, discount: 0, vat: 0, shippingFee: 0, grand: 0, points: 0, count: 0 });
assert.equal(cartTotals([{ price: 10 }], { shipping: 'unknown' }).shippingFee, 0);
assert.equal(roundMoney(0.1 + 0.2), 0.3);
assert.equal(cartTotals([{ price: 0.1 }, { price: 0.2 }]).subtotal, 0.3);

console.log('Cart test passed');
