import { loadPricing } from '../shared/pricing-client.js';
import { resolveSetImage } from '../shared/set-image.js';
import { creatorCardSets, setCardView } from '../shared/creator-cards-product.js';

const money = (value) => Number(value).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };

/** Replaces the page's own sets with the ones staff publish in Set Studio. Without them the page keeps what it has. */
export async function syncSets({ grid, form }) {
  let settings;
  try { settings = await loadPricing(); } catch { return false; }
  const packs = creatorCardSets(settings);
  if (!packs || !grid) return false;
  const product = settings.products.find((item) => item.id === 'creator-cards');
  const cards = packs.map((pack, index) => {
    const view = setCardView(pack, product, money);
    const card = el('article');
    if (view.image) {
      const img = el('img'); img.src = resolveSetImage(view.image, '../business-card/'); img.alt = view.name; img.loading = 'lazy';
      card.append(img);
    }
    card.append(el('span', 'number', String(index + 1).padStart(2, '0')), el('h3', '', view.name), el('p', '', view.text));
    if (view.bullets.length) { const list = el('ul', 'set-bullets'); list.append(...view.bullets.map((line) => el('li', '', line))); card.append(list); }
    if (view.priceLabel) card.append(el('p', 'set-price', view.priceLabel));
    if (view.inquiry) {
      const link = el('a', 'text-link is-inquiry', 'ติดต่อสอบถาม');
      if (view.inquiryUrl) { link.href = view.inquiryUrl; link.target = '_blank'; link.rel = 'noopener'; } else { link.setAttribute('aria-disabled', 'true'); link.title = 'ร้านยังไม่ได้ตั้งค่า LINE OA ID'; }
      card.append(link);
    } else {
      const button = el('button', 'text-link choose-plan', 'เริ่มจากแผนนี้ ↗'); button.type = 'button'; button.dataset.plan = view.name;
      card.append(button);
    }
    return card;
  });
  grid.replaceChildren(...cards);
  const select = form?.elements?.plan;
  if (select?.options) select.replaceChildren(...packs.filter((pack) => !pack.inquiryOnly).map((pack) => new Option(pack.name)));
  return true;
}
