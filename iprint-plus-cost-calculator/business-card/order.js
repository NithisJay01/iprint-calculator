import { loadPricing, loadCatalog } from '../shared/pricing-client.js';
import { includedIdsFor } from '../shared/product-pricing.js';
import { addCartItem, updateCartItem, getCartItem, cartCount, CART_MAX_ITEMS } from '../shared/cart.js';
import { money, esc } from '../shared/format.js';
import { optionPrice, buildPriceBreakdown, fallbackPricingModel } from './breakdown.js';
import {
  findProduct, resolveSets, allowedMaterials, quantityChoices, defaultSelection, selectionFromItem, quoteSelection,
  cartItemFromSelection, isPrintService, isCoatService
} from './product.js';

// Configure ONE business card item and put it in the cart (the cart itself lives in /cart/).
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.get('cart') === '1') location.replace('../cart/'); // old link: the cart moved to its own page

const state = { settings: null, product: null, pack: null, catalog: null, material: null, services: [], quantity: 0, quote: null, editingId: '' };
const pricingModel = () => state.product || fallbackPricingModel();
const includedNow = () => includedIdsFor(state.product, state.pack);

function setStatus(message = '', isError = true) {
  $('status').textContent = message;
  $('status').style.color = isError ? '' : 'var(--green)';
}

function choiceButtons(list, kind) {
  return list.map(item => `<button type="button" class="choice" data-${kind}="${esc(item.id)}"><b>${esc(item.name)}</b><small></small></button>`).join('');
}

const isSelected = (button, kind) => {
  const id = button.dataset[kind];
  if (kind === 'material') return state.material?.id === id;
  return state.services.some(service => service.id === id);
};

function syncSelected() {
  document.querySelectorAll('[data-quantity]').forEach(button => button.classList.toggle('selected', Number(button.dataset.quantity) === state.quantity));
  for (const kind of ['material', 'print', 'extra']) {
    document.querySelectorAll(`[data-${kind}]`).forEach(button => button.classList.toggle('selected', isSelected(button, kind)));
  }
}

// Price tag on every choice: the total it adds for the current quantity, or "รวมในเซต".
function updatePrices() {
  const quote = state.quote;
  if (!quote || !state.catalog) return;
  document.querySelectorAll('[data-material],[data-print],[data-extra]').forEach(button => {
    const isMaterial = button.dataset.material !== undefined;
    const id = button.dataset.material ?? button.dataset.print ?? button.dataset.extra;
    const item = (isMaterial ? state.catalog.materials : state.catalog.services).find(entry => entry.id === id);
    const tag = button.querySelector('small');
    if (!item || !tag) return;
    const info = optionPrice({ product: pricingModel(), item, sheets: quote.sheets, quantity: quote.pieces, isMaterial, includedIds: includedNow() });
    tag.innerHTML = `<span class="${info.included ? 'opt-included' : 'opt-total'}">${esc(info.text)}</span>`;
  });
}

function recalc() {
  try {
    state.quote = quoteSelection({
      settings: state.settings, pack: state.pack, material: state.material, services: state.services,
      quantity: state.quantity, code: $('promoCode').value.trim()
    });
    setStatus('');
    $('next').disabled = false;
    $('startPrice').textContent = `เริ่มต้นที่ ฿${money(state.quote.price)}`;
    $('priceBreakdown').innerHTML = buildPriceBreakdown({
      product: pricingModel(), quote: state.quote, packName: state.pack.name, quantity: state.quantity,
      material: state.material, services: state.services, includedIds: includedNow()
    }).map(line => `<div class="price-line ${line.kind === 'total' ? 'total' : ''} ${line.kind}"><span>${esc(line.label)}${line.basis ? `<small>${esc(line.basis)}</small>` : ''}</span><b>${esc(line.text)}</b></div>`).join('');
    $('grandTotal').textContent = `฿${money(state.quote.price)}`;
    const code = $('promoCode').value.trim();
    $('promoHint').textContent = code && !state.quote.pricing?.promotion ? 'ไม่พบโปรโมชันที่เข้าเงื่อนไขของรายการนี้' : code ? `ใช้โปรโมชัน “${state.quote.pricing.promotion.name}” แล้ว` : '';
    updatePrices();
    syncSelected();
  } catch (error) {
    state.quote = null;
    $('next').disabled = true;
    setStatus(error.message);
  }
}

function renderChoices() {
  const { product, pack, catalog } = state;
  const materials = allowedMaterials(product, catalog);
  const prints = catalog.services.filter(isPrintService);
  const coats = catalog.services.filter(isCoatService);
  const extras = catalog.services.filter(service => !isPrintService(service) && !isCoatService(service));
  $('productName').textContent = `นามบัตร ${pack.name}`;
  $('productTagline').textContent = pack.tagline || 'เซตพร้อมสั่งที่ Admin จัดไว้';
  $('specList').innerHTML = (pack.bullets || ['เลือกสเปกและบริการเสริมได้']).map(text => `<li>${esc(text)}</li>`).join('');
  $('quantityChoices').innerHTML = quantityChoices(product, pack).map(quantity => `<button type="button" class="choice" data-quantity="${quantity}"><b>${quantity.toLocaleString('th-TH')} ใบ</b><small>${quantity === pack.quantity ? 'จำนวนในเซต' : 'เพิ่มจำนวน'}</small></button>`).join('');
  $('materialChoices').innerHTML = choiceButtons(materials, 'material');
  $('printChoices').innerHTML = choiceButtons(prints, 'print');
  $('extraChoices').innerHTML = choiceButtons([...coats, ...extras], 'extra') || '<p>เซตนี้ไม่มีออปชันเพิ่มเติม</p>';
}

async function init() {
  try {
    const [settings, catalog] = await Promise.all([loadPricing(), loadCatalog()]);
    Object.assign(state, { settings, catalog, product: findProduct(settings) });
    const sets = resolveSets(state.product);

    const saved = params.get('edit') ? getCartItem(params.get('edit')) : null;
    state.editingId = saved?.id || '';
    state.pack = sets.find(set => set.id === (saved ? saved.packageId : params.get('package'))) || sets[0];
    const start = defaultSelection({ product: state.product, catalog, pack: state.pack });
    Object.assign(state, { quantity: start.quantity, material: start.material, services: start.services });

    let notice = '';
    if (params.get('edit') && !saved) {
      notice = 'ไม่พบรายการนี้ในตะกร้า จึงเริ่มรายการใหม่แทน';
    } else if (saved) {
      const chosen = selectionFromItem({ item: saved, settings, catalog });
      if (quantityChoices(state.product, state.pack).includes(Number(saved.quantity))) state.quantity = Number(saved.quantity);
      if (chosen.material) state.material = chosen.material;
      if (chosen.pack) state.services = chosen.services;
      $('promoCode').value = saved.promoCode || '';
      $('driveLink').value = saved.driveLink || '';
      $('pageTitle').textContent = 'แก้ไขรายการในตะกร้า';
      $('next').textContent = 'บันทึกการแก้ไข';
      notice = chosen.problems.length ? 'ตัวเลือกบางอย่างที่เคยเลือกไว้ไม่มีขายแล้ว กรุณาตรวจสอบก่อนบันทึก' : '';
    }
    renderChoices();
    recalc();
    if (notice) setStatus(notice);
  } catch (error) {
    setStatus(error.message);
  }
}

function saveToCart() {
  if (!state.quote) return;
  if (!$('driveLink').checkValidity()) { setStatus('ลิงก์ไฟล์ต้องขึ้นต้นด้วย https://'); $('driveLink').focus(); return; }
  const item = cartItemFromSelection({
    pack: state.pack, quantity: state.quantity, material: state.material, services: state.services,
    promoCode: $('promoCode').value, driveLink: $('driveLink').value
  });
  if (state.editingId) {
    if (!updateCartItem(state.editingId, item)) { setStatus('บันทึกลงตะกร้าไม่ได้ (เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูล)'); return; }
  } else {
    const result = addCartItem(item);
    if (!result.ok) {
      setStatus(result.reason === 'CART_FULL' ? `ตะกร้าเต็มแล้ว (สูงสุด ${CART_MAX_ITEMS} รายการ)` : 'บันทึกลงตะกร้าไม่ได้ (เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูล)');
      return;
    }
  }
  location.href = '../cart/';
}

document.addEventListener('click', event => {
  const quantity = event.target.closest('[data-quantity]');
  const material = event.target.closest('[data-material]');
  const print = event.target.closest('[data-print]');
  const extra = event.target.closest('[data-extra]');
  if (quantity) {
    state.quantity = Number(quantity.dataset.quantity);
  } else if (material) {
    state.material = state.catalog.materials.find(item => item.id === material.dataset.material) || state.material;
  } else if (print) {
    const service = state.catalog.services.find(item => item.id === print.dataset.print);
    if (service) state.services = [service, ...state.services.filter(item => !isPrintService(item))];
  } else if (extra) {
    const service = state.catalog.services.find(item => item.id === extra.dataset.extra);
    if (service) state.services = state.services.some(item => item.id === service.id) ? state.services.filter(item => item.id !== service.id) : [...state.services, service];
  } else {
    return;
  }
  recalc();
});

$('promoCode').addEventListener('input', recalc);
$('next').addEventListener('click', saveToCart);
$('changeImage').addEventListener('click', () => alert('สามารถเชื่อมเครื่องมือ Mockup ในขั้นต่อไปได้'));
$('cartCount').textContent = String(cartCount());
addEventListener('pageshow', () => { $('cartCount').textContent = String(cartCount()); });
init();
