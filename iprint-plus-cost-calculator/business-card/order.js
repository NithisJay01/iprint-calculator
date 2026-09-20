import { loadPricing, loadCatalog } from '../shared/pricing-client.js';
import { includedIdsFor } from '../shared/product-pricing.js';
import { addCartItem, updateCartItem, getCartItem, cartCount, CART_MAX_ITEMS } from '../shared/cart.js';
import { money, esc } from '../shared/format.js';
import { setImageUrl, galleryUrls } from '../shared/set-image.js';
import { optionPrice, buildPriceBreakdown, fallbackPricingModel } from './breakdown.js';
import {
  findProduct, resolveSets, quantityChoices, defaultSelection, selectionFromItem, quoteSelection,
  cartItemFromSelection, resolveOptionGroups, missingGroups, chooseInGroup, groupRuleText, setDescription, setBullets
} from './product.js';

// Configure ONE business card item and put it in the cart (the cart itself lives in /cart/).
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.get('cart') === '1') location.replace('../cart/'); // old link: the cart moved to its own page

const state = { settings: null, product: null, pack: null, catalog: null, groups: [], material: null, services: [], quantity: 0, quote: null, editingId: '' };
const pricingModel = () => state.product || fallbackPricingModel();
const includedNow = () => includedIdsFor(state.product, state.pack);

function setStatus(message = '', isError = true) {
  $('status').textContent = message;
  $('status').style.color = isError ? '' : 'var(--green)';
}

// One card per option; single-choice groups look like radio buttons, multiple-choice groups like checkboxes.
function choiceButtons(group) {
  const role = group.mode === 'single' ? 'radio' : 'checkbox';
  return group.choices.map(item => `<button type="button" class="choice mode-${group.mode}" role="${role}" aria-checked="false" data-group="${esc(group.id)}" data-item="${esc(item.id)}" data-source="${group.source}"><b>${esc(item.name)}</b><small></small></button>`).join('');
}

function groupHtml(group) {
  return `<section class="option-group" data-option-group="${esc(group.id)}"><h2>${esc(group.name)}<span class="group-rule ${group.required ? 'required' : ''}">${groupRuleText(group)}</span></h2><div class="choice-grid" role="${group.mode === 'single' ? 'radiogroup' : 'group'}" aria-label="${esc(group.name)}">${choiceButtons(group)}</div></section>`;
}

const isSelected = button => (button.dataset.source === 'material'
  ? state.material?.id === button.dataset.item
  : state.services.some(service => service.id === button.dataset.item));

function syncSelected() {
  document.querySelectorAll('[data-quantity]').forEach(button => button.classList.toggle('selected', Number(button.dataset.quantity) === state.quantity));
  document.querySelectorAll('[data-item]').forEach(button => {
    const selected = isSelected(button);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-checked', String(selected));
  });
  const missing = new Set(missingGroups({ groups: state.groups, material: state.material, services: state.services }).map(group => group.id));
  document.querySelectorAll('[data-option-group]').forEach(section => {
    if (!missing.has(section.dataset.optionGroup)) section.classList.remove('is-missing');
  });
}

// Price tag on every choice: the total it adds for the current quantity, or "รวมในเซต".
function updatePrices() {
  const quote = state.quote;
  if (!quote || !state.catalog) return;
  document.querySelectorAll('[data-item]').forEach(button => {
    const isMaterial = button.dataset.source === 'material';
    const item = (isMaterial ? state.catalog.materials : state.catalog.services).find(entry => entry.id === button.dataset.item);
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

// Sample work of the set (up to 5 pictures from the studio): a strip of thumbnails, each opens a larger view.
// A picture that does not load is dropped from the strip so no broken image is shown.
const gallery = { urls: [], index: 0 };

function renderGallery(urls) {
  gallery.urls = urls;
  $('gallery').hidden = !urls.length;
  $('galleryStrip').innerHTML = urls.map((url, index) => `<button type="button" class="gallery-thumb" data-gallery="${index}" aria-label="ดูตัวอย่างงานภาพที่ ${index + 1}"><img src="${esc(url)}" alt="ตัวอย่างงาน ${index + 1}" loading="lazy" referrerpolicy="no-referrer" data-url="${esc(url)}"></button>`).join('');
  $('galleryStrip').querySelectorAll('img').forEach(image => image.addEventListener('error', () => renderGallery(gallery.urls.filter(url => url !== image.dataset.url)), { once: true }));
}

function showGallery(index) {
  const count = gallery.urls.length;
  if (!count) return;
  gallery.index = (index + count) % count;
  $('galleryBig').src = gallery.urls[gallery.index];
  $('galleryBig').alt = `ตัวอย่างงาน ${gallery.index + 1}`;
  $('galleryCaption').textContent = `${gallery.index + 1} / ${count}`;
  $('galleryPrev').hidden = $('galleryNext').hidden = count < 2;
}

$('galleryStrip').addEventListener('click', event => {
  const thumb = event.target.closest('[data-gallery]');
  if (!thumb) return;
  showGallery(Number(thumb.dataset.gallery));
  $('galleryDialog').showModal();
});
$('galleryPrev').addEventListener('click', () => showGallery(gallery.index - 1));
$('galleryNext').addEventListener('click', () => showGallery(gallery.index + 1));
$('galleryClose').addEventListener('click', () => $('galleryDialog').close());
$('galleryDialog').addEventListener('click', event => { if (event.target === $('galleryDialog')) $('galleryDialog').close(); });
$('galleryDialog').addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') showGallery(gallery.index - 1);
  else if (event.key === 'ArrowRight') showGallery(gallery.index + 1);
});

function renderChoices() {
  const { product, pack } = state;
  $('productName').textContent = `นามบัตร ${pack.name}`;
  $('productTagline').textContent = setDescription(pack) || 'เซตพร้อมสั่งที่ Admin จัดไว้';
  // The set's own picture (set in the studio); the standard one when it has none or the link does not load.
  const hero = $('productImage');
  const image = setImageUrl(pack.image);
  hero.onerror = () => { hero.onerror = null; hero.src = 'assets/hero.png'; };
  hero.referrerPolicy = 'no-referrer';
  hero.src = image || 'assets/hero.png';
  hero.alt = `ตัวอย่างเซตนามบัตร ${pack.name}`;
  renderGallery(galleryUrls(pack.gallery));
  const bullets = setBullets({ product, pack, catalog: state.catalog });
  $('specBlock').hidden = !bullets.length;
  $('specList').innerHTML = bullets.map(text => `<li>${esc(text)}</li>`).join('');
  $('quantityChoices').innerHTML = quantityChoices(product, pack).map(quantity => `<button type="button" class="choice" data-quantity="${quantity}"><b>${quantity.toLocaleString('th-TH')} ใบ</b><small>${quantity === pack.quantity ? 'จำนวนในเซต' : 'เพิ่มจำนวน'}</small></button>`).join('');
  $('optionGroups').innerHTML = state.groups.map(groupHtml).join('') || '<p>เซตนี้ยังไม่มีตัวเลือกให้เลือก</p>';
}

async function init() {
  try {
    const [settings, catalog] = await Promise.all([loadPricing(), loadCatalog()]);
    Object.assign(state, { settings, catalog, product: findProduct(settings) });
    const sets = resolveSets(state.product);

    const saved = params.get('edit') ? getCartItem(params.get('edit')) : null;
    state.editingId = saved?.id || '';
    state.pack = sets.find(set => set.id === (saved ? saved.packageId : params.get('package'))) || sets[0];
    state.groups = resolveOptionGroups({ product: state.product, pack: state.pack, catalog });
    const start = defaultSelection({ product: state.product, catalog, pack: state.pack });
    Object.assign(state, { quantity: start.quantity, material: start.material, services: start.services });

    let notice = '';
    if (params.get('edit') && !saved) {
      notice = 'ไม่พบรายการนี้ในตะกร้า จึงเริ่มรายการใหม่แทน';
    } else if (saved) {
      const chosen = selectionFromItem({ item: saved, settings, catalog });
      if (quantityChoices(state.product, state.pack).includes(Number(saved.quantity))) state.quantity = Number(saved.quantity);
      // Only what the set offers can be kept: an option the set no longer lists is taken out (and the customer told).
      const offered = new Set(state.groups.flatMap(group => group.choices.map(item => item.id)));
      if (chosen.material && offered.has(chosen.material.id)) state.material = chosen.material;
      let dropped = 0;
      if (chosen.pack) {
        state.services = chosen.services.filter(service => offered.has(service.id) || (dropped += 1, false));
      }
      $('promoCode').value = saved.promoCode || '';
      $('driveLink').value = saved.driveLink || '';
      $('pageTitle').textContent = 'แก้ไขรายการในตะกร้า';
      $('next').textContent = 'บันทึกการแก้ไข';
      notice = chosen.problems.length ? 'ตัวเลือกบางอย่างที่เคยเลือกไว้ไม่มีขายแล้ว กรุณาตรวจสอบก่อนบันทึก' : dropped ? 'ตัวเลือกบางอย่างที่เคยเลือกไว้ไม่อยู่ในเซตนี้แล้ว จึงถูกนำออก กรุณาตรวจสอบก่อนบันทึก' : '';
    }
    renderChoices();
    recalc();
    if (notice) setStatus(notice);
  } catch (error) {
    setStatus(error.message);
  }
}

$('driveLink')?.addEventListener('input', () => $('fileCta').classList.remove('is-invalid'));

function saveToCart() {
  if (!state.quote) return;
  const missing = missingGroups({ groups: state.groups, material: state.material, services: state.services });
  if (missing.length) {
    const section = document.querySelector(`[data-option-group="${CSS.escape(missing[0].id)}"]`);
    missing.forEach(group => document.querySelector(`[data-option-group="${CSS.escape(group.id)}"]`)?.classList.add('is-missing'));
    setStatus(`กรุณาเลือก “${missing[0].name}” (จำเป็น)`);
    section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const link = $('driveLink');
  if (!link.value.trim() || !link.checkValidity()) {
    $('fileCta').classList.add('is-invalid');
    setStatus(link.value.trim() ? 'ลิงก์ไฟล์ต้องขึ้นต้นด้วย https://' : 'กรุณาใส่ลิงก์ไฟล์งานก่อนเพิ่มลงตะกร้า (จำเป็นต้องใส่)');
    link.scrollIntoView({ behavior: 'smooth', block: 'center' });
    link.focus({ preventScroll: true });
    return;
  }
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
  const choice = event.target.closest('[data-item]');
  if (quantity) {
    state.quantity = Number(quantity.dataset.quantity);
  } else if (choice) {
    const group = state.groups.find(entry => entry.id === choice.dataset.group);
    const item = group?.choices.find(entry => entry.id === choice.dataset.item);
    if (!item) return;
    state.services = chooseInGroup(group, item, state.services);
    if (group.source === 'material') state.material = item;
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
