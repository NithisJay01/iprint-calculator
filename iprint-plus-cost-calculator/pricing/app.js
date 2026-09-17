import { newProduct, calculateProductPrice } from '../shared/product-pricing.js';
import { LOCAL, loadPricing, savePricing, loadCatalog } from '../shared/pricing-client.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const option = (value, label, selected = false) => `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
const field = (label, key, value, type = 'text', attrs = '') => `<label>${label}<input data-product-field="${key}" type="${type}" value="${esc(value)}" ${attrs}></label>`;

let settings, catalog, selectedProductId = '', selectedPackageId = '';
const currentProduct = () => settings.products.find(item => item.id === selectedProductId);
const currentPackage = () => currentProduct()?.packages.find(item => item.id === selectedPackageId);
const catalogItems = () => [
  ...catalog.materials.map(item => ({ ...item, source: 'material' })),
  ...catalog.services.map(item => ({ ...item, source: 'service' }))
];

function groupSeed() {
  const materials = catalog.materials.map(item => item.id);
  const print = catalog.services.filter(item => /พิมพ์|print/i.test(item.name)).map(item => item.id);
  const finishing = catalog.services.filter(item => /เคลือบ|ฟอยล์|foil|ปั๊ม|uv|spot|ไดคัท|พับ|ตัด/i.test(item.name)).map(item => item.id);
  const used = new Set([...print, ...finishing]);
  const extras = catalog.services.filter(item => !used.has(item.id)).map(item => item.id);
  return [
    { id: 'materials', name: 'วัสดุหลัก', enabled: true, source: 'material', itemIds: materials },
    { id: 'printing', name: 'รูปแบบการพิมพ์', enabled: true, source: 'service', itemIds: print },
    { id: 'finishing', name: 'เทคนิคและการเคลือบ', enabled: true, source: 'service', itemIds: finishing },
    { id: 'extras', name: 'บริการเสริม', enabled: extras.length > 0, source: 'service', itemIds: extras }
  ];
}

function ensureKitchen(product) {
  if (!Array.isArray(product.optionGroups)) product.optionGroups = groupSeed();
  if (!Array.isArray(product.packages)) product.packages = [];
  if (!product.packages.length) {
    product.packages.push({ id: 'starter', name: 'เซตเริ่มต้น', quantity: 100, price: 0, description: 'เซตพร้อมขาย ปรับตัวเลือกได้', optionIds: [] });
  }
  const available = new Set(catalogItems().map(item => item.id));
  product.optionGroups.forEach(group => {
    group.enabled = group.enabled !== false;
    group.itemIds = Array.isArray(group.itemIds) ? group.itemIds.filter(id => available.has(id)) : [];
  });
  product.packages.forEach(pack => {
    pack.description ??= '';
    pack.optionIds = Array.isArray(pack.optionIds) ? pack.optionIds.filter(id => available.has(id)) : [];
    if (!pack.optionIds.length) pack.optionIds = product.optionGroups.flatMap(group => group.itemIds);
  });
}

function setStatus(message = '', error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
  $('status').classList.toggle('visible', Boolean(message));
}

function renderProductRail() {
  $('productList').innerHTML = settings.products.map(product => `<button type="button" class="product-tab ${product.id === selectedProductId ? 'active' : ''}" data-product="${esc(product.id)}"><span class="product-icon">${esc(product.name.trim().charAt(0) || 'P')}</span><span><b>${esc(product.name)}</b><small>${product.packages.length} เซต · ${product.enabled ? 'เปิดขาย' : 'ซ่อนอยู่'}</small></span></button>`).join('');
}

function renderPackageCards(product) {
  return `<div class="package-grid">${product.packages.map(pack => `<button type="button" class="package-card ${pack.id === selectedPackageId ? 'active' : ''}" data-package="${esc(pack.id)}"><span>${pack.id === selectedPackageId ? 'กำลังจัดเซต' : 'เลือกแก้ไข'}</span><b>${esc(pack.name)}</b><small>${Number(pack.quantity).toLocaleString('th-TH')} ชิ้น · ฿${fmt(pack.price)}</small></button>`).join('')}<button type="button" class="package-card add-card" data-add-package>＋<b>สร้างเซตใหม่</b><small>เพิ่มแพ็กเกจพร้อมขาย</small></button></div>`;
}

function renderGroups(product, pack) {
  const items = new Map(catalogItems().map(item => [item.id, item]));
  return product.optionGroups.map((group, index) => {
    const groupItems = group.itemIds.map(id => items.get(id)).filter(Boolean);
    return `<section class="option-group ${group.enabled ? '' : 'disabled'}" data-group-index="${index}">
      <div class="group-head"><div><h3>${esc(group.name)}</h3><small>${group.enabled ? `${groupItems.length} วัตถุดิบจาก Catalog กลาง` : 'ปิดอยู่ ลูกค้าจะไม่เห็นชุดตัวเลือกนี้'}</small></div><label class="switch"><input type="checkbox" data-group-toggle="${index}" ${group.enabled ? 'checked' : ''}><span></span><b>${group.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</b></label></div>
      ${group.enabled ? `<div class="ingredient-grid">${groupItems.map(item => { const active = pack.optionIds.includes(item.id); return `<button type="button" class="ingredient ${active ? 'selected' : ''}" data-option-id="${esc(item.id)}"><span>${esc(item.name)}</span><small>${item.price ? `+฿${fmt(item.price)} / ${esc(item.unit || 'งาน')}` : 'รวมในเซตได้'}</small></button>`; }).join('')}<button type="button" class="ingredient manage" data-manage-catalog>＋ จัดการวัตถุดิบ</button></div>` : ''}
    </section>`;
  }).join('');
}

function renderPromotions(product) {
  return product.promotions.map((promo, index) => `<div class="promo-row" data-promo="${index}"><label class="check"><input data-promo-field="enabled" type="checkbox" ${promo.enabled ? 'checked' : ''}> เปิดใช้</label><input data-promo-field="name" value="${esc(promo.name)}" aria-label="ชื่อโปรโมชัน"><input data-promo-field="code" value="${esc(promo.code)}" placeholder="Promo code" aria-label="โค้ด"><select data-promo-field="type">${option('percent','เปอร์เซ็นต์',promo.type==='percent')}${option('fixed','บาท',promo.type==='fixed')}</select><input data-promo-field="value" type="number" min="0" value="${promo.value}" aria-label="มูลค่าส่วนลด"><button type="button" class="remove" data-remove-promo="${index}">ลบ</button></div>`).join('');
}

function render() {
  const product = currentProduct();
  ensureKitchen(product);
  if (!product.packages.some(pack => pack.id === selectedPackageId)) selectedPackageId = product.packages[0].id;
  const pack = currentPackage();
  renderProductRail();
  $('editor').innerHTML = `<section class="hero-editor">
      <div><span class="eyebrow">PRODUCT SET STUDIO</span><h2>จัดเซต “${esc(product.name)}”</h2><p>เลือกสิ่งที่ลูกค้าปรับได้ในเซต ปุ่มสีน้ำเงินคือออปชันที่เปิดให้เลือก</p></div>
      <label class="switch large"><input data-product-field="enabled" type="checkbox" ${product.enabled ? 'checked' : ''}><span></span><b>${product.enabled ? 'เปิดขาย' : 'ซ่อนสินค้า'}</b></label>
    </section>
    <section class="panel"><div class="section-title"><div><span class="step">1</span><div><h2>สินค้าและเซตสำเร็จรูป</h2><p>ตั้งชื่อหมวด แล้วเลือกเซตที่ต้องการจัด</p></div></div></div>
      <div class="two-fields">${field('ชื่อสินค้า','name',product.name)}${field('รหัสสินค้า','id',product.id,'text','disabled')}</div>
      ${renderPackageCards(product)}
      <div class="package-editor"><div class="section-title compact"><div><span class="step">2</span><div><h2>ข้อมูลเซตที่เลือก</h2><p>ราคานี้คือราคาเริ่มต้นก่อนบริการเสริม</p></div></div><button type="button" class="remove" data-remove-package ${product.packages.length === 1 ? 'disabled' : ''}>ลบเซต</button></div>
        <div class="two-fields"><label>ชื่อเซต<input data-package-field="name" value="${esc(pack.name)}"></label><label>คำอธิบาย<input data-package-field="description" value="${esc(pack.description)}"></label><label>จำนวนเริ่มต้น<input data-package-field="quantity" type="number" min="1" value="${pack.quantity}"></label><label>ราคาเริ่มต้น (บาท)<input data-package-field="price" type="number" min="0" step="0.01" value="${pack.price}"></label></div>
      </div>
    </section>
    <section class="panel"><div class="section-title"><div><span class="step">3</span><div><h2>ชุดตัวเลือกของลูกค้า</h2><p>ปิด Toggle เพื่อซ่อนทั้งชุด หรือกดวัตถุดิบเพื่อเลือกเข้า–ออกจากเซต</p></div></div></div>${renderGroups(product, pack)}</section>
    <details class="panel advanced"><summary><span><b>สูตรราคาและกติกาขั้นสูง</b><small>ใช้เมื่อจำเป็น สูตรหลักยังคงทำงานเหมือนเดิม</small></span><span>แก้ไข ›</span></summary><div class="advanced-body"><div class="two-fields"><label>รูปแบบราคา<select data-product-field="mode">${option('packages','แพ็กเกจสำเร็จรูป',product.mode==='packages')}${option('tiers','ราคาตามจำนวน',product.mode==='tiers')}${option('formula','ต้นทุน + กำไร',product.mode==='formula')}</select></label>${field('กำไรจากบริการเสริม (%)','markup',product.markup,'number','min="0" step="any"')}${field('ราคาขั้นต่ำ','minimum',product.minimum,'number','min="0" step="any"')}${field('ปัดราคาขึ้นทีละ','rounding',product.rounding,'number','min="0.01" step="any"')}</div></div></details>
    <details class="panel advanced"><summary><span><b>โปรโมชัน</b><small>${product.promotions.length} รายการ · ระบบเลือกส่วนลดที่ดีที่สุดหนึ่งรายการ</small></span><span>จัดการ ›</span></summary><div class="advanced-body"><div class="promo-list">${renderPromotions(product)}</div><button type="button" class="button soft" data-add-promo>＋ เพิ่มโปรโมชัน</button></div></details>`;
  syncPreviewControls(product);
  renderCustomerPreview();
  previewPrice();
}

function syncPreviewControls(product) {
  const previous = $('previewPackage').value;
  $('previewPackage').innerHTML = product.packages.map(pack => option(pack.id, `${pack.name} / ${pack.quantity} ชิ้น`, pack.id === (previous || selectedPackageId))).join('');
  $('previewMaterial').innerHTML = catalog.materials.map(item => option(item.id, item.name)).join('');
  $('previewServices').innerHTML = '<legend>บริการเสริมที่ทดลอง</legend>' + catalog.services.map(item => `<label><input type="checkbox" value="${esc(item.id)}"> ${esc(item.name)}</label>`).join('');
  const pack = currentPackage();
  $('quantity').value = pack.quantity;
}

function renderCustomerPreview() {
  const product = currentProduct(), pack = currentPackage();
  const items = new Map(catalogItems().map(item => [item.id, item]));
  const groups = product.optionGroups.filter(group => group.enabled).map(group => ({ ...group, choices: group.itemIds.filter(id => pack.optionIds.includes(id)).map(id => items.get(id)).filter(Boolean) })).filter(group => group.choices.length);
  $('customerPreview').innerHTML = `<article class="customer-card"><div class="mockup">${esc(product.name.trim().charAt(0) || 'P')}</div><span class="set-label">${esc(product.name)}</span><h3>${esc(pack.name)}</h3><p>${esc(pack.description || 'เซตพร้อมสั่งที่ Admin จัดไว้')}</p><div class="price-block"><span>เริ่มต้น ${Number(pack.quantity).toLocaleString('th-TH')} ชิ้น</span><b>฿${fmt(pack.price)}</b></div>${groups.map(group => `<div class="preview-group"><b>${esc(group.name)}</b><div>${group.choices.map(item => `<span>${esc(item.name)}</span>`).join('')}</div></div>`).join('')}<button type="button">เลือกเซตนี้</button></article>`;
}

function previewPrice() {
  try {
    const product = currentProduct();
    const price = calculateProductPrice({ product, version: settings.version, quantity: Number($('quantity').value), sheets: Number($('sheets').value), baseCost: Number($('cost').value), materialId: $('previewMaterial').value, packageId: $('previewPackage').value, services: catalog.services.filter(service => [...$('previewServices').querySelectorAll(':checked')].some(input => input.value === service.id)), code: $('code').value, date: $('date').value });
    $('result').classList.remove('error');
    $('result').innerHTML = `<div><span>ราคาฐาน</span><b>฿${fmt(price.base)}</b></div><div><span>บริการเสริม</span><b>฿${fmt(price.extras)}</b></div><div><span>ส่วนลด</span><b>−฿${fmt(price.discount)}</b></div><div class="total"><span>ราคาสุทธิ</span><b>฿${fmt(price.total)}</b></div><small>${price.promotion ? `ใช้ ${esc(price.promotion.name)}` : 'ยังไม่มีโปรโมชันที่เข้าเงื่อนไข'}</small>`;
  } catch (error) {
    $('result').classList.add('error');
    $('result').textContent = error.message;
  }
}

function dirty() { setStatus('มีการแก้ไขที่ยังไม่ได้บันทึก'); }

$('productList').addEventListener('click', event => {
  const button = event.target.closest('[data-product]');
  if (!button) return;
  selectedProductId = button.dataset.product;
  ensureKitchen(currentProduct());
  selectedPackageId = currentProduct().packages[0].id;
  render();
});

$('editor').addEventListener('submit', event => event.preventDefault());
$('editor').addEventListener('input', event => {
  const input = event.target;
  const product = currentProduct(), pack = currentPackage();
  if (input.dataset.productField) {
    const key = input.dataset.productField;
    product[key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    if (key === 'enabled') render();
    else if (key === 'name') { renderProductRail(); renderCustomerPreview(); }
    else previewPrice();
  } else if (input.dataset.packageField) {
    pack[input.dataset.packageField] = input.type === 'number' ? Number(input.value) : input.value;
    renderCustomerPreview(); previewPrice();
  } else if (input.dataset.groupToggle != null) {
    product.optionGroups[Number(input.dataset.groupToggle)].enabled = input.checked;
    render();
  } else if (input.dataset.promoField) {
    const promo = product.promotions[Number(input.closest('[data-promo]').dataset.promo)];
    promo[input.dataset.promoField] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    previewPrice();
  }
  dirty();
});

$('editor').addEventListener('click', event => {
  const product = currentProduct();
  const packageButton = event.target.closest('[data-package]');
  if (packageButton) { selectedPackageId = packageButton.dataset.package; render(); return; }
  if (event.target.closest('[data-add-package]')) {
    const id = `set-${crypto.randomUUID().slice(0, 8)}`;
    product.packages.push({ id, name: 'เซตใหม่', description: 'พร้อมจัดวัตถุดิบและออปชัน', quantity: 100, price: 0, optionIds: [] });
    product.mode = 'packages'; selectedPackageId = id; render(); dirty(); return;
  }
  if (event.target.closest('[data-remove-package]') && product.packages.length > 1) {
    product.packages = product.packages.filter(pack => pack.id !== selectedPackageId);
    selectedPackageId = product.packages[0].id; render(); dirty(); return;
  }
  const ingredient = event.target.closest('[data-option-id]');
  if (ingredient) {
    const pack = currentPackage(), id = ingredient.dataset.optionId;
    pack.optionIds = pack.optionIds.includes(id) ? pack.optionIds.filter(value => value !== id) : [...pack.optionIds, id];
    render(); dirty(); return;
  }
  if (event.target.closest('[data-manage-catalog]')) { setStatus('วัตถุดิบมาจาก Catalog กลาง หากต้องเพิ่มรายการใหม่ให้เพิ่มในระบบ Materials / Services'); return; }
  if (event.target.closest('[data-add-promo]')) {
    product.promotions.push({ id: crypto.randomUUID(), name: 'โปรโมชันใหม่', enabled: true, type: 'percent', scope: 'base', value: 10, minQuantity: 0, minSpend: 0, code: '', start: '', end: '' });
    render(); dirty(); return;
  }
  const removePromo = event.target.closest('[data-remove-promo]');
  if (removePromo) { product.promotions.splice(Number(removePromo.dataset.removePromo), 1); render(); dirty(); }
});

$('add').addEventListener('click', () => {
  const product = newProduct(`product-${crypto.randomUUID().slice(0, 8)}`, 'สินค้าใหม่');
  settings.products.push(product); selectedProductId = product.id; ensureKitchen(product); selectedPackageId = product.packages[0].id; render(); dirty();
});

$('save').addEventListener('click', async () => {
  $('save').disabled = true;
  try { settings = await savePricing(settings, $('key').value); setStatus(LOCAL ? 'บันทึกครัวกลางบนเครื่องนี้แล้ว · หน้าขายจะใช้ค่าหลังรีเฟรช' : 'บันทึกและเผยแพร่แล้ว'); render(); }
  catch (error) { setStatus(error.message, true); }
  finally { $('save').disabled = false; }
});

$('previewPackage').addEventListener('change', event => { selectedPackageId = event.target.value; $('quantity').value = currentPackage().quantity; render(); });
for (const id of ['quantity','sheets','cost','previewMaterial','previewServices','code','date']) $(id).addEventListener('input', previewPrice);

$('environment').textContent = LOCAL ? 'โหมดทดลอง · บันทึกในเบราว์เซอร์นี้' : 'ระบบจริง · Staff only';
$('keyWrap').hidden = LOCAL;
$('date').value = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
$('save').disabled = true; $('add').disabled = true;
try {
  [settings, catalog] = await Promise.all([loadPricing(), loadCatalog()]);
  if (!settings.products.length) settings.products.push(newProduct());
  settings.products.forEach(ensureKitchen);
  selectedProductId = settings.products[0].id;
  selectedPackageId = settings.products[0].packages[0].id;
  render(); $('save').disabled = false; $('add').disabled = false;
} catch (error) { setStatus(error.message, true); }
