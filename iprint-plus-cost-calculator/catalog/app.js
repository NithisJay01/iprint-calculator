import { loadPricing } from '../shared/pricing-client.js';
import { cartCount, readCart } from '../shared/cart.js';

const money = value => Number(value || 0).toLocaleString('th-TH', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

function startingPrice(product) {
  if (!product?.enabled) return null;
  if (product.mode === 'packages') {
    const prices = product.packages.map(item => Number(item.price)).filter(value => Number.isFinite(value) && value >= 0);
    return prices.length ? Math.min(...prices) : null;
  }
  if (product.mode === 'tiers') {
    const prices = product.tiers
      .map(item => Number(item.min) * Number(item.price))
      .filter(value => Number.isFinite(value) && value >= 0);
    return prices.length ? Math.min(...prices) : null;
  }
  return null;
}

async function syncCatalogPrice() {
  try {
    const settings = await loadPricing();
    const product = settings.products.find(item => item.id === 'business-card');
    const price = startingPrice(product);
    const label = document.querySelector('[data-product-id="business-card"] [data-price-label]');
    if (label && price !== null) label.textContent = `เริ่มต้น ฿${money(price)} • ดูแพ็กเกจ`;
  } catch {
    // Catalog remains usable with a neutral CTA when pricing is temporarily unavailable.
  }
}

syncCatalogPrice();

function syncCart() {
  const count = cartCount(readCart());
  const link = document.getElementById('cartLink');
  const badge = document.querySelector('.cart-count');
  if (badge) { badge.textContent = String(count); badge.setAttribute('aria-label', `สินค้าในตะกร้า ${count} รายการ`); }
  if (link) { link.setAttribute('aria-label', count ? `เปิดตะกร้าสินค้า ${count} รายการ` : 'เปิดตะกร้าสินค้า ยังไม่มีรายการ'); link.title = count ? `สินค้าในตะกร้า ${count} รายการ` : 'ยังไม่มีสินค้าในตะกร้า'; }
}
syncCart();
addEventListener('pageshow', syncCart);
addEventListener('storage', syncCart);

// Category strip: the arrow scrolls to the next tiles and hides once the end is reached.
const categoryList = document.getElementById('categoryList');
const categoryNext = document.getElementById('categoryNext');
const categoryPrev = document.getElementById('categoryPrev');
if (categoryList && categoryNext && categoryPrev) {
  const syncArrow = () => { categoryPrev.hidden = categoryList.scrollLeft <= 4; categoryNext.hidden = categoryList.scrollLeft + categoryList.clientWidth >= categoryList.scrollWidth - 4; };
  categoryNext.addEventListener('click', () => categoryList.scrollBy({ left: categoryList.clientWidth * 0.8 }));
  categoryPrev.addEventListener('click', () => categoryList.scrollBy({ left: -categoryList.clientWidth * 0.8 }));
  categoryList.addEventListener('scroll', syncArrow, { passive: true });
  addEventListener('resize', syncArrow);
  syncArrow();
}

// Mouse drag to scroll the strip (touch already scrolls natively). A drag never counts as a click on a tile.
if (categoryList) {
  let drag = null;
  categoryList.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { x: event.clientX, left: categoryList.scrollLeft, moved: false };
  });
  addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 5) return;
    if (!drag.moved) { drag.moved = true; categoryList.classList.add('is-dragging'); }
    categoryList.scrollLeft = drag.left - dx;
  });
  const endDrag = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    categoryList.classList.remove('is-dragging');
    if (moved) categoryList.addEventListener('click', event => event.preventDefault(), { capture: true, once: true });
  };
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);
  categoryList.addEventListener('dragstart', event => event.preventDefault());
}
