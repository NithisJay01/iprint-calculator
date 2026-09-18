import { loadPricing, loadCatalog } from '../shared/pricing-client.js';
import { BUSINESS_CARD_ID, selectionFromItem, quoteSelection } from './product.js';

// Cart adapter of the business card product. The cart page knows nothing about products: for every item it
// asks the product's adapter to price it. A new product plugs into the cart by adding its own adapter
// (see shared/cart-products.js).
export default {
  productId: BUSINESS_CARD_ID,
  label: 'นามบัตร',

  // Loaded once per cart page for all items of this product.
  async load() {
    const [settings, catalog] = await Promise.all([loadPricing(), loadCatalog()]);
    return { settings, catalog };
  },

  editUrl: item => `../business-card/order.html?edit=${encodeURIComponent(item.id)}`,

  // Prices one cart item with the current settings.
  resolve(item, { settings, catalog }) {
    const selection = selectionFromItem({ item, settings, catalog });
    const entry = {
      id: item.id,
      productId: BUSINESS_CARD_ID,
      title: `นามบัตร ${selection.pack?.name || ''}`.trim(),
      spec: [
        selection.quantity ? `${selection.quantity.toLocaleString('th-TH')} ใบ` : '',
        selection.material?.name,
        ...selection.services.map(service => service.name)
      ].filter(Boolean).join(' • '),
      note: '',
      promoCode: item.promoCode || '',
      promotion: '',
      driveLink: item.driveLink || '',
      price: 0,
      discount: 0,
      points: 0,
      editUrl: this.editUrl(item),
      problems: [...selection.problems]
    };
    if (entry.problems.length) return entry;
    try {
      const quote = quoteSelection({ settings, pack: selection.pack, material: selection.material, services: selection.services, quantity: selection.quantity, code: entry.promoCode });
      entry.price = quote.price;
      entry.discount = quote.pricing?.discount || 0;
      entry.promotion = quote.pricing?.promotion?.name || '';
      entry.points = quote.points;
      entry.pieces = quote.pieces;
      entry.sheets = quote.sheets;
      entry.pricingVersion = settings.version || '';
      if (entry.promoCode && !quote.pricing?.promotion) entry.note = 'โค้ดส่วนลดนี้ไม่เข้าเงื่อนไขของรายการนี้';
    } catch (error) {
      entry.problems.push(error.message);
    }
    return entry;
  }
};
