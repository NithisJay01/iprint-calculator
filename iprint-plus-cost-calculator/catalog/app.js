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
