export const CART_KEY = 'iprint-cart-v1';
const LEGACY_KEY = 'iprint-business-card-cart';

function emptyCart() { return { version: 1, items: [] }; }

export function readCart() {
  try {
    const current = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
    if (current && Array.isArray(current.items)) return current;
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (legacy) {
      const migrated = { version: 1, items: [{ productId: 'business-card', ...legacy }] };
      localStorage.setItem(CART_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_KEY);
      return migrated;
    }
  } catch {}
  return emptyCart();
}

export function cartCount(cart = readCart()) {
  return cart.items.reduce((sum, item) => sum + Math.max(1, Number(item.cartQty) || 1), 0);
}

export function productCartItem(productId, cart = readCart()) {
  return cart.items.find(item => item.productId === productId) || null;
}

export function upsertCartItem(item) {
  const cart = readCart();
  const index = cart.items.findIndex(entry => entry.productId === item.productId);
  if (index >= 0) cart.items[index] = { ...cart.items[index], ...item };
  else cart.items.push(item);
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  return cart;
}

export function removeCartItem(productId) {
  const cart = readCart();
  cart.items = cart.items.filter(item => item.productId !== productId);
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  return cart;
}
