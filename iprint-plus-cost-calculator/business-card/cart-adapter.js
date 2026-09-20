import { loadPricing, loadCatalog } from '../shared/pricing-client.js';
import { BUSINESS_CARD_ID, PRESET, selectionFromItem, quoteSelection } from './product.js';
import { buildOrderItem } from './logic.js';
import { rushPrice } from '../shared/cart-totals.js';

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
      driveLink: String(item.driveLink || '').trim(),
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
      // Unrounded price: the rush surcharge is calculated from it, exactly like the Worker verifies it.
      entry.basePrice = quote.basePrice;
      entry.discount = quote.pricing?.discount || 0;
      entry.promotion = quote.pricing?.promotion?.name || '';
      entry.points = quote.points;
      entry.pieces = quote.pieces;
      entry.sheets = quote.sheets;
      entry.pricingVersion = settings.version || '';
      // The order item the Worker receives for this cart item. It carries the same snapshots the price was
      // calculated from, so the Worker can verify the price. `note` goes into the ticket brief.
      const { pack, material, services } = selection;
      Object.defineProperty(entry, 'toOrderItem', {
        enumerable: false,
        value: ({ itemId, deliveryDate, note = '', paymentMethod = '', boost = null, now = new Date() }) => buildOrderItem({
          state: {
            preset: PRESET, material, services, jobName: entry.title, version: 'V1', packageName: pack.name,
            references: [], frontFile: null, backFile: null, driveLink: entry.driveLink, note, deliveryDate, boost, paymentMethod
          },
          // A rush order charges the surcharge on the item's own price (after any promo code).
          quote: boost ? { ...quote, price: rushPrice(quote, boost.multiplier) } : quote,
          itemId, now, includeBrief: false
        })
      });
      if (entry.promoCode && !quote.pricing?.promotion) entry.note = 'โค้ดส่วนลดนี้ไม่เข้าเงื่อนไขของรายการนี้';
      // The link is the only way the shop receives the artwork of a cart order, so it is required.
      if (!entry.driveLink) entry.problems.push('ยังไม่ได้ใส่ลิงก์ไฟล์งาน (จำเป็นต้องใส่)');
    } catch (error) {
      entry.problems.push(error.message);
    }
    return entry;
  }
};
