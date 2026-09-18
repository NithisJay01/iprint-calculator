// Shopping cart shared by every catalog product (business cards today, other products later).
// The cart only stores what the customer picked; prices are always recalculated from the current settings.
//
//   { version: 2, items: [{ id, productId, addedAt, ...productSpecificChoices }] }
//
// One cart holds up to CART_MAX_ITEMS items (same limit as the Worker's orderItems) and several items of the
// same product are allowed.
export const CART_KEY = 'iprint-cart-v1';
export const CART_MAX_ITEMS = 20;
const LEGACY_KEY = 'iprint-business-card-cart';

const newId = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const emptyCart = () => ({ version: 2, items: [] });
const isItem = item => item && typeof item === 'object' && typeof item.productId === 'string' && item.productId && typeof item.id === 'string' && item.id;

// Version 1 carts had no item ids, one item per product and a `cartQty` multiplier (the +/- counter).
// Every unit of cartQty becomes its own item, so the cart total stays the same.
function migrateItems(items) {
  const migrated = [];
  for (const old of Array.isArray(items) ? items : []) {
    if (!old || typeof old.productId !== 'string' || !old.productId) continue;
    const { cartQty, id, ...choices } = old;
    const copies = Math.min(CART_MAX_ITEMS, Math.max(1, Math.floor(Number(cartQty)) || 1));
    for (let index = 0; index < copies; index += 1) migrated.push({ ...choices, id: newId(), addedAt: new Date().toISOString() });
  }
  return migrated.slice(0, CART_MAX_ITEMS);
}

function persist(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    return true;
  } catch {
    return false;
  }
}

export function readCart() {
  try {
    const current = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
    if (current && Array.isArray(current.items)) {
      if (current.version === 2) return { version: 2, items: current.items.filter(isItem).slice(0, CART_MAX_ITEMS) };
      const migrated = { version: 2, items: migrateItems(current.items) };
      persist(migrated);
      return migrated;
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (legacy) {
      const migrated = { version: 2, items: migrateItems([{ productId: 'business-card', ...legacy }]) };
      persist(migrated);
      localStorage.removeItem(LEGACY_KEY);
      return migrated;
    }
  } catch {
    // Corrupt or unavailable storage: behave like an empty cart.
  }
  return emptyCart();
}

export const cartItems = (cart = readCart()) => cart.items;
export const cartCount = (cart = readCart()) => cart.items.length;
export const getCartItem = (id, cart = readCart()) => cart.items.find(item => item.id === id) || null;

// Adds an item and returns { ok, id, cart }. ok is false when the cart is full or storage is unavailable.
export function addCartItem(item) {
  const cart = readCart();
  if (!item || typeof item.productId !== 'string' || !item.productId) return { ok: false, reason: 'INVALID_ITEM', cart };
  if (cart.items.length >= CART_MAX_ITEMS) return { ok: false, reason: 'CART_FULL', cart };
  const { id: ignored, ...choices } = item;
  const stored = { ...choices, id: newId(), addedAt: new Date().toISOString() };
  cart.items.push(stored);
  if (!persist(cart)) return { ok: false, reason: 'STORAGE_UNAVAILABLE', cart };
  return { ok: true, id: stored.id, cart };
}

// Changes the choices of one item (its id, product and add time stay). Returns the updated item or null.
export function updateCartItem(id, patch) {
  const cart = readCart();
  const index = cart.items.findIndex(item => item.id === id);
  if (index < 0) return null;
  const current = cart.items[index];
  const { id: ignoredId, productId: ignoredProduct, addedAt: ignoredAt, ...choices } = patch || {};
  cart.items[index] = { ...current, ...choices, id: current.id, productId: current.productId, addedAt: current.addedAt };
  return persist(cart) ? cart.items[index] : null;
}

export function removeCartItem(id) {
  const cart = readCart();
  cart.items = cart.items.filter(item => item.id !== id);
  persist(cart);
  return cart;
}

export function clearCart() {
  const cart = emptyCart();
  persist(cart);
  return cart;
}

// ---- Deprecated: the single-item API used before item ids existed. Kept so pages still cached in a
// visitor's browser keep working while they pick up the new scripts.
export const productCartItem = (productId, cart = readCart()) => cart.items.find(item => item.productId === productId) || null;
export function upsertCartItem(item) {
  const existing = productCartItem(item.productId);
  if (existing) updateCartItem(existing.id, item);
  else addCartItem(item);
  return readCart();
}
