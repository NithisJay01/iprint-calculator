import { newProduct } from './product-pricing.js';
import { setImageUrl } from './set-image.js';
import { inquiryUrl } from './inquiry.js';

// The sets of the cards / postcards page (/cards/). They are a product of Set Studio (/pricing/), like the business-card
// sets: staff edit the name, text, picture, bullets, starting price and the "ask us" button there and publish.
// Customers never order these through the cart: a set only pre-fills the quote request on the cards page.
export const CREATOR_CARDS_ID = 'creator-cards';

export function defaultCreatorCardPackages() {
  return [
    { id: 'trial', name: 'ทดลองคอลเลกชัน', description: 'อยากเห็นงานตัวเองบนการ์ดจริง ก่อนตัดสินใจผลิตรอบใหญ่', tagline: 'อยากเห็นงานตัวเองบนการ์ดจริง', quantity: 50, price: 0, bullets: ['เริ่มจากไม่กี่แบบ', 'เทียบวัสดุก่อนผลิตรอบใหญ่'], image: 'cards/assets/dream-postcards.webp', optionIds: [] },
    { id: 'booth', name: 'เตรียมออกบูธ', description: 'วางแผนจำนวนแต่ละลาย และแจ้งวันใช้งานสำหรับอีเวนต์ที่รออยู่', tagline: 'วางแผนจำนวนแต่ละลาย', quantity: 200, price: 0, bullets: ['วางแผนจำนวนต่อลาย', 'แจ้งวันงานอีเวนต์'], image: 'cards/assets/character-cards.webp', optionIds: [] },
    { id: 'restock', name: 'เติมสต็อก', description: 'พาลายโปรดกลับมาอีกครั้ง ตรวจวัสดุและรายละเอียดก่อนพิมพ์รอบใหม่', tagline: 'พาลายโปรดกลับมา', quantity: 500, price: 0, bullets: ['ตรวจวัสดุเดิมก่อนพิมพ์', 'ผลิตซ้ำตามสเปกเดิม'], image: 'cards/assets/neon-cards.webp', optionIds: [] },
  ];
}

export function newCreatorCardsProduct() {
  return { ...newProduct(CREATOR_CARDS_ID, 'การ์ดและโปสการ์ด'), mode: 'packages', packages: defaultCreatorCardPackages() };
}

/** The set of the cards page: the product from Set Studio when it is on and has sets, else null (the page keeps its own). */
export function creatorCardSets(settings) {
  const product = settings?.products?.find((item) => item.id === CREATOR_CARDS_ID);
  return product?.enabled && Array.isArray(product.packages) && product.packages.length ? product.packages : null;
}

/** What one set card shows. `money` formats the starting price. */
export function setCardView(pack, product = {}, money = (value) => String(value)) {
  const price = Number(pack.price);
  const url = pack.inquiryOnly ? inquiryUrl({ name: product.name || 'การ์ดและโปสการ์ด' }, pack) : '';
  return {
    name: String(pack.name || ''),
    text: String(pack.description || pack.tagline || ''),
    bullets: (Array.isArray(pack.bullets) ? pack.bullets : []).filter((line) => typeof line === 'string' && line.trim()).slice(0, 3),
    image: setImageUrl(pack.image),
    priceLabel: Number.isFinite(price) && price > 0 ? `เริ่มต้น ฿${money(price)}${pack.quantity ? ` · ${Number(pack.quantity).toLocaleString('th-TH')} ใบ` : ''}` : '',
    inquiry: Boolean(pack.inquiryOnly),
    inquiryUrl: url,
  };
}
