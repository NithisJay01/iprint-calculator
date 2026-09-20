// Registry of the products that can be in the cart. Each product provides an adapter:
//   { productId, label, load() -> context, resolve(item, context) -> priced entry, editUrl(item) }
// A priced entry is { id, productId, title, spec, price, discount, points, note, editUrl, problems[] };
// `problems` explains why the item cannot be ordered as it is (e.g. a choice is no longer sold).
export const CART_PRODUCT_LOADERS = Object.freeze({
  'business-card': () => import('../business-card/cart-adapter.js')
});

const unavailable = (item, message) => ({
  id: item.id,
  productId: item.productId,
  title: item.productId,
  spec: '',
  note: '',
  promoCode: item.promoCode || '',
  promotion: '',
  price: 0,
  discount: 0,
  points: 0,
  editUrl: '',
  problems: [message]
});

// Prices every cart item (keeping the cart order). Each product is loaded once.
export async function resolveCartItems(items, { loaders = CART_PRODUCT_LOADERS } = {}) {
  const byProduct = new Map();
  for (const item of items) {
    if (!byProduct.has(item.productId)) byProduct.set(item.productId, []);
    byProduct.get(item.productId).push(item);
  }
  const resolved = new Map();
  await Promise.all([...byProduct].map(async ([productId, group]) => {
    const load = loaders[productId];
    if (!load) { group.forEach(item => resolved.set(item.id, unavailable(item, 'ไม่รองรับสินค้าประเภทนี้'))); return; }
    try {
      const adapter = (await load()).default;
      const context = await adapter.load();
      group.forEach(item => {
        // The entry is completed in place: a spread would drop the adapter's non-enumerable `toOrderItem`.
        try { const entry = adapter.resolve(item, context); entry.label = adapter.label; resolved.set(item.id, entry); }
        catch (error) { resolved.set(item.id, { ...unavailable(item, error.message), label: adapter.label }); }
      });
    } catch (error) {
      group.forEach(item => resolved.set(item.id, unavailable(item, `โหลดราคาไม่สำเร็จ: ${error.message}`)));
    }
  }));
  return items.map(item => resolved.get(item.id));
}
