import { newProduct, calculateProductPrice } from '../shared/product-pricing.js';
import { LOCAL, uploadGalleryImage, loadPricing, savePricing, loadCatalog, storedWriteKey, loadDraft, saveDraft, discardDraft, createCatalogItem, deactivateCatalogItem } from '../shared/pricing-client.js';
import { newBusinessCardProduct } from '../shared/business-card-product.js';
import { setBullets, parseBullets, groupRuleText } from '../business-card/product.js';
import { BUILT_IN_SET_IMAGES, MAX_GALLERY_IMAGES, isValidSetImage, setImageUrl, resolveSetImage, galleryUrls } from '../shared/set-image.js';
import { UNIT_OPTIONS, CAPACITY_BASIS_OPTIONS, formatUnit, newCatalogItemPayload, catalogListFor, filterCatalogItems, itemUsage, describeUsage, setGroupItem, removeItemEverywhere, groupSummary, saveStateLabel, toggleOffered, setIncluded, includedIdsOf } from '../shared/set-studio.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const option = (value, label, selected = false) => `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
const field = (label, key, value, type = 'text', attrs = '') => `<label>${label}<input data-product-field="${key}" type="${type}" value="${esc(value)}" ${attrs}></label>`;

let settings, catalog, selectedProductId = '', selectedPackageId = '';
let publishedVersion = '';                 // version customers see (from the last load/publish)
let draftMeta = null;                      // { savedAt, baseVersion } when the editor holds a saved draft
let saveState = 'published';               // 'published' | 'unsaved' | 'draft'
const openGroups = new Set();              // option groups expanded in the editor
let pickerGroupIndex = -1, pickerConfirmId = null;
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
    { id: 'materials', name: 'วัสดุหลัก', enabled: true, source: 'material', selectionMode: 'single', required: true, itemIds: materials },
    { id: 'printing', name: 'รูปแบบการพิมพ์', enabled: true, source: 'service', selectionMode: 'single', required: true, itemIds: print },
    { id: 'finishing', name: 'เทคนิคและการเคลือบ', enabled: true, source: 'service', selectionMode: 'single', required: false, itemIds: finishing },
    { id: 'extras', name: 'บริการเสริม', enabled: extras.length > 0, source: 'service', selectionMode: 'multiple', required: false, itemIds: extras }
  ];
}

function ensureKitchen(product) {
  if (!Array.isArray(product.optionGroups)) product.optionGroups = groupSeed();
  if (!Array.isArray(product.packages)) product.packages = [];
  if (!product.packages.length) {
    const packages = product.id === 'business-card' ? newBusinessCardProduct().packages : [{ id: 'starter', name: 'เซตเริ่มต้น', quantity: 100, price: 0, description: 'เซตพร้อมขาย ปรับตัวเลือกได้', optionIds: [] }];
    product.packages.push(...packages);
    if (product.id === 'business-card') product.mode = 'packages';
  }
  const available = new Set(catalogItems().map(item => item.id));
  product.optionGroups.forEach(group => {
    group.enabled = group.enabled !== false;
    group.selectionMode = group.selectionMode === 'multiple' && group.source !== 'material' ? 'multiple' : 'single';
    group.required = group.required === true;
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

function includeHint(packagesMode, group) {
  if (!packagesMode) return group.source === 'service' ? '<p class="group-hint">กำหนดว่ารายการไหน “รวมในเซต” ได้เมื่อรูปแบบราคาเป็น “แพ็กเกจสำเร็จรูป” (ตั้งที่ “สูตรราคาและกติกาขั้นสูง” ด้านล่าง)</p>' : '';
  return group.source === 'service'
    ? '<p class="group-hint">ติ๊ก “รวมในเซต” ที่รายการซึ่งไม่คิดเงินเพิ่มในเซตนี้ รายการอื่นที่เปิดให้เลือกจะคิดเงินเพิ่มเมื่อลูกค้าเลือก (หมวดที่เลือกได้ 1 รายการ ติ๊กได้หลายรายการ ลูกค้าจะเลือกอย่างใดอย่างหนึ่งโดยไม่คิดเพิ่ม)</p>'
    : '<p class="group-hint">วัสดุรวมอยู่ในราคาเซตเสมอ</p>';
}

function renderGroups(product, pack) {
  const items = new Map(catalogItems().map(item => [item.id, item]));
  const packagesMode = product.mode === 'packages';
  const includedIds = includedIdsOf(product, pack);
  return product.optionGroups.map((group, index) => {
    const canInclude = packagesMode && group.source === 'service';
    const groupItems = group.itemIds.map(id => items.get(id)).filter(Boolean);
    const summary = groupSummary(group, items, pack, canInclude ? includedIds : null);
    const open = openGroups.has(group.id);
    return `<section class="option-group ${group.enabled ? '' : 'disabled'} ${open ? 'open' : ''}" data-group-index="${index}">
      <div class="group-head"><button type="button" class="group-toggle" data-toggle-group="${index}" aria-expanded="${open}"><span class="chevron" aria-hidden="true">›</span><span class="group-title"><h3>${esc(group.name)}</h3><small class="tone-${summary.tone}">${esc(summary.text)}</small></span></button><div class="group-actions"><button type="button" class="text-button" data-move-group="up" data-group-index="${index}" aria-label="เลื่อนหมวดขึ้น" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="text-button" data-move-group="down" data-group-index="${index}" aria-label="เลื่อนหมวดลง" ${index === product.optionGroups.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="remove" data-remove-group="${index}">ลบหมวด</button><label class="switch"><input type="checkbox" data-group-toggle="${index}" ${group.enabled ? 'checked' : ''}><span></span><b>${group.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</b></label></div></div>
      ${open ? `<div class="group-body">
      <div class="group-settings"><label>ชื่อหมวด<input data-group-field="name" data-group-index="${index}" value="${esc(group.name)}"></label><label>ประเภทรายการ<select data-group-field="source" data-group-index="${index}">${option('material','วัสดุ',group.source==='material')}${option('service','บริการ',group.source==='service')}</select></label><label>การเลือก<select data-group-field="selectionMode" data-group-index="${index}">${option('single','เลือกได้ 1 รายการ',group.selectionMode==='single')}${group.source === 'material' ? '' : option('multiple','เลือกได้หลายรายการ',group.selectionMode==='multiple')}</select></label><label class="check"><input type="checkbox" data-group-field="required" data-group-index="${index}" ${group.required ? 'checked' : ''}> บังคับเลือก</label></div>
      ${group.enabled ? `${includeHint(packagesMode, group)}<div class="ingredient-grid">${groupItems.map(item => { const active = pack.optionIds.includes(item.id); const included = canInclude && includedIds.includes(item.id); return `<div class="ingredient-cell"><button type="button" class="ingredient ${active ? 'selected' : ''} ${included ? 'included' : ''}" data-option-id="${esc(item.id)}" aria-pressed="${active}"><span>${esc(item.name)}</span><small>${item.price ? `+฿${fmt(item.price)} / ${esc(formatUnit(item.unit))}` : 'ไม่มีราคา'}</small>${included ? '<em class="included-badge">รวมในเซต</em>' : ''}</button>${canInclude && active ? `<label class="included-toggle"><input type="checkbox" data-included-id="${esc(item.id)}" data-group-index="${index}" ${included ? 'checked' : ''}> รวมในเซต (ไม่คิดเพิ่ม)</label>` : ''}</div>`; }).join('')}<button type="button" class="ingredient manage" data-open-picker="${index}">＋ เพิ่ม/แก้ไขรายการ</button></div>` : ''}
      </div>` : ''}
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
      <div><span class="eyebrow">PRODUCT SET STUDIO</span><h2>จัดเซต “${esc(product.name)}”</h2><p>เลือกสิ่งที่ลูกค้าปรับได้ในเซต ปุ่มสีน้ำเงินคือรายการที่เปิดให้เลือกในเซตนี้</p></div>
      <label class="switch large"><input data-product-field="enabled" type="checkbox" ${product.enabled ? 'checked' : ''}><span></span><b>${product.enabled ? 'เปิดขาย' : 'ซ่อนสินค้า'}</b></label>
    </section>
    <section class="panel"><div class="section-title"><div><span class="step">1</span><div><h2>สินค้าและเซต</h2><p>ตั้งชื่อสินค้า แล้วเลือกเซตที่ต้องการจัด</p></div></div></div>
      <div class="two-fields">${field('ชื่อสินค้า','name',product.name)}${field('รหัสสินค้า','id',product.id,'text','disabled')}</div>
      ${renderPackageCards(product)}
      <div class="package-editor"><div class="section-title compact"><div><span class="step">2</span><div><h2>ข้อมูลเซตที่เลือก</h2><p>ราคานี้คือราคาเริ่มต้นก่อนบริการเสริม</p></div></div><button type="button" class="remove" data-remove-package ${product.packages.length === 1 ? 'disabled' : ''}>ลบเซต</button></div>
        <div class="two-fields"><label>ชื่อเซต<input data-package-field="name" value="${esc(pack.name)}"></label><label>คำอธิบาย<input data-package-field="description" value="${esc(pack.description)}"></label><label>จำนวนเริ่มต้น<input data-package-field="quantity" type="number" min="1" value="${pack.quantity}"></label><label>ราคาเริ่มต้น (บาท)<input data-package-field="price" type="number" min="0" step="0.01" value="${pack.price}"></label></div>
        <label class="inquiry-toggle"><input type="checkbox" role="switch" data-package-field="inquiryOnly" ${pack.inquiryOnly ? 'checked' : ''}> ต้องสอบถามข้อมูลเพิ่มเติมเท่านั้น — ${pack.inquiryOnly ? 'ON' : 'OFF'}</label>
        <p class="inquiry-help">เมื่อเปิด ลูกค้าเห็นเฉพาะรายละเอียดและปุ่ม “ติดต่อสอบถาม” ราคาและตัวเลือกสั่งซื้อจะถูกซ่อน</p>
        <label ${pack.inquiryOnly ? '' : 'hidden'}>LINE OA ID ของร้านสำหรับเซตนี้<input data-package-field="lineOaId" value="${esc(pack.lineOaId || '')}" placeholder="@ชื่อร้าน" maxlength="101"><small>เปิดแชตร้านพร้อมข้อความเกี่ยวกับเซตนี้ ลูกค้ากดส่งใน LINE อีกครั้ง</small></label>

        <label class="bullets-field">รายละเอียดในเซต <small>บรรทัดละ 1 ข้อ แสดงเป็นหัวข้อ “สเปกในเซต” ในหน้าลูกค้า (เว้นว่างเพื่อไม่แสดง)</small><textarea data-package-field="bullets" rows="4" maxlength="1000">${esc(setBullets({ product, pack, catalog }).join('\n'))}</textarea></label>
        <div class="set-image-field">
          <div class="set-image-head"><b>ภาพของเซต</b><small>แสดงที่หน้าสั่งซื้อและการ์ดเซตของลูกค้า</small></div>
          <div class="set-image-row">
            <div class="set-image-preview" id="setImagePreview"></div>
            <div class="set-image-controls">
              <label>ลิงก์รูปภาพ (ขึ้นต้นด้วย https://)<input data-package-field="image" type="url" inputmode="url" maxlength="500" placeholder="https://…/ภาพของเซต.jpg" value="${esc(pack.image || '')}"></label>
              <small class="set-image-note" id="setImageNote" role="status"></small>
              <button type="button" class="text-button" data-clear-image>ล้างภาพ (ใช้ภาพมาตรฐาน)</button>
            </div>
          </div>
          <div class="set-image-presets" role="group" aria-label="เลือกจากภาพในระบบ"><small>หรือเลือกจากภาพในระบบ</small><div>${BUILT_IN_SET_IMAGES.map(image => `<button type="button" class="set-image-choice" data-image-preset="${esc(image)}" aria-label="ใช้ภาพนี้" aria-pressed="false"><img src="../business-card/${esc(image)}" alt="" loading="lazy"></button>`).join('')}</div></div>
        </div>
        <div class="set-image-field gallery-field">
          <div class="set-image-head"><b>แกลเลอรี่ตัวอย่างงาน</b><small id="galleryCount"></small></div>
          <p class="gallery-help">ภาพตัวอย่างงานพิมพ์ของเซตนี้ แสดงใต้ภาพหลักในหน้าสั่งซื้อ อัปโหลดได้สูงสุด ${MAX_GALLERY_IMAGES} รูป ระบบย่อภาพให้พอดีให้อัตโนมัติ</p>
          <div class="gallery-grid" id="galleryGrid"></div>
          <div class="gallery-actions">
            <label class="button soft gallery-upload" id="galleryUploadButton"><input type="file" id="galleryFile" accept="image/jpeg,image/png,image/webp" multiple hidden>＋ อัปโหลดรูป</label>
            <span class="gallery-link"><input id="galleryLink" type="url" inputmode="url" maxlength="500" placeholder="หรือวางลิงก์รูป https://…" aria-label="ลิงก์รูปสำหรับแกลเลอรี่"><button type="button" class="text-button" data-gallery-add-link>เพิ่ม</button></span>
          </div>
          <small class="set-image-note" id="galleryNote" role="status"></small>
        </div>
      </div>
    </section>
    <section class="panel"><div class="section-title"><div><span class="step">3</span><div><h2>หมวดตัวเลือกของลูกค้า</h2><p>กดชื่อหมวดเพื่อแก้ไข หมวดที่เปิดและมีรายการในเซตจะปรากฏในหน้าลูกค้าตามลำดับนี้</p></div></div><button type="button" class="button soft" data-add-group>＋ เพิ่มหมวด</button></div>${renderGroups(product, pack)}</section>
    <details class="panel advanced"><summary><span><b>สูตรราคาและกติกาขั้นสูง</b><small>ใช้เมื่อจำเป็น สูตรหลักยังคงทำงานเหมือนเดิม</small></span><span>แก้ไข ›</span></summary><div class="advanced-body"><div class="two-fields"><label>รูปแบบราคา<select data-product-field="mode">${option('packages','แพ็กเกจสำเร็จรูป',product.mode==='packages')}${option('tiers','ราคาตามจำนวน',product.mode==='tiers')}${option('formula','ต้นทุน + กำไร',product.mode==='formula')}</select></label>${field('กำไรจากบริการเสริม (%)','markup',product.markup,'number','min="0" step="any"')}${field('ราคาขั้นต่ำ','minimum',product.minimum,'number','min="0" step="any"')}${field('ปัดราคาขึ้นทีละ','rounding',product.rounding,'number','min="0.01" step="any"')}</div></div></details>
    <details class="panel advanced"><summary><span><b>โปรโมชัน</b><small>${product.promotions.length} รายการ · ระบบเลือกส่วนลดที่ดีที่สุดหนึ่งรายการ</small></span><span>จัดการ ›</span></summary><div class="advanced-body"><div class="promo-list">${renderPromotions(product)}</div><button type="button" class="button soft" data-add-promo>＋ เพิ่มโปรโมชัน</button></div></details>`;
  syncPreviewControls(product);
  syncSetImage();
  syncGallery();
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

// The gallery of the set being edited: thumbnails with move / remove buttons and how many of the 5 places are used.
function syncGallery(message = '', isError = false) {
  const grid = $('galleryGrid');
  if (!grid) return;
  const pack = currentPackage();
  const urls = galleryUrls(pack.gallery);
  grid.innerHTML = urls.length
    ? urls.map((url, index) => `<figure class="gallery-item"><img src="${esc(resolveSetImage(url, '../business-card/'))}" alt="ตัวอย่างงาน ${index + 1}" referrerpolicy="no-referrer" loading="lazy"><figcaption><button type="button" data-gallery-move="-1" data-index="${index}" aria-label="เลื่อนไปก่อนหน้า" ${index === 0 ? 'disabled' : ''}>←</button><button type="button" data-gallery-move="1" data-index="${index}" aria-label="เลื่อนไปถัดไป" ${index === urls.length - 1 ? 'disabled' : ''}>→</button><button type="button" class="danger" data-gallery-remove data-index="${index}" aria-label="ลบภาพนี้">✕</button></figcaption></figure>`).join('')
    : '<p class="gallery-empty">ยังไม่มีภาพตัวอย่าง</p>';
  const full = urls.length >= MAX_GALLERY_IMAGES;
  $('galleryCount').textContent = `${urls.length} / ${MAX_GALLERY_IMAGES} รูป`;
  $('galleryUploadButton').classList.toggle('disabled', full);
  $('galleryFile').disabled = full;
  $('galleryLink').disabled = full;
  document.querySelector('[data-gallery-add-link]').disabled = full;
  const note = $('galleryNote');
  note.textContent = message || (full ? 'ครบ 5 รูปแล้ว ลบรูปเดิมก่อนถ้าต้องการเพิ่ม' : '');
  note.classList.toggle('error', isError);
}

function setGallery(urls) {
  currentPackage().gallery = urls.slice(0, MAX_GALLERY_IMAGES);
  renderCustomerPreview();
  dirty();
}

async function uploadGalleryFiles(files) {
  const room = MAX_GALLERY_IMAGES - galleryUrls(currentPackage().gallery).length;
  const chosen = [...files].slice(0, room);
  const skipped = files.length - chosen.length;
  let done = 0;
  for (const file of chosen) {
    syncGallery(`กำลังอัปโหลด ${done + 1} / ${chosen.length}…`);
    try {
      const url = await uploadGalleryImage(file, $('key').value);
      setGallery([...galleryUrls(currentPackage().gallery), url]);
      done += 1;
    } catch (error) {
      syncGallery(`${file.name}: ${error.message || 'อัปโหลดไม่สำเร็จ'}`, true);
      return;
    }
  }
  syncGallery(done ? `อัปโหลดแล้ว ${done} รูป${skipped ? ` (เกินจำนวนที่รับได้ ${skipped} รูป ไม่ได้อัปโหลด)` : ''} อย่าลืมกด “เผยแพร่ให้ลูกค้า”` : '');
}

// The picture field of the set being edited: thumbnail, note about the link and which built-in picture is chosen.
function syncSetImage() {
  const pack = currentPackage();
  const preview = $('setImagePreview');
  if (!preview) return;
  const raw = String(pack.image || '').trim();
  const valid = raw === '' || isValidSetImage(raw);
  const url = valid ? setImageUrl(raw) : '';
  preview.innerHTML = url
    ? `<img src="${esc(resolveSetImage(url, '../business-card/'))}" alt="ภาพของเซต" referrerpolicy="no-referrer">`
    : '<span>ยังไม่ได้เลือกภาพ<br>หน้าลูกค้าใช้ภาพมาตรฐาน</span>';
  const note = $('setImageNote');
  note.textContent = !valid ? 'ลิงก์ต้องขึ้นต้นด้วย https:// (ลิงก์จาก Google Drive ต้องเป็นลิงก์รูปตรง ไม่ใช่ลิงก์หน้าแชร์)' : url ? 'ถ้าภาพไม่ขึ้นที่หน้าลูกค้า ระบบจะใช้ภาพมาตรฐานแทน' : '';
  note.classList.toggle('error', !valid);
  const field = document.querySelector('[data-package-field="image"]');
  if (field && field.value !== raw) field.value = raw;
  document.querySelectorAll('[data-image-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.imagePreset === raw)));
}

function renderCustomerPreview() {
  const product = currentProduct(), pack = currentPackage();
  const items = new Map(catalogItems().map(item => [item.id, item]));
  const groups = product.optionGroups.filter(group => group.enabled).map(group => ({ ...group, choices: group.itemIds.filter(id => pack.optionIds.includes(id)).map(id => items.get(id)).filter(Boolean) })).filter(group => group.choices.length);
  if (pack.inquiryOnly) {
    $('customerPreview').innerHTML = `<article class="customer-card"><div class="mockup${setImageUrl(pack.image) ? ' has-image' : ''}">${setImageUrl(pack.image) ? `<img src="${esc(resolveSetImage(pack.image, '../business-card/'))}" alt="">` : esc(product.name)}</div><span class="set-label">${esc(product.name)}</span><h3>${esc(pack.name)}</h3><p>${esc(pack.description || '')}</p><button type="button">ติดต่อสอบถาม</button></article>`;
    return;
  }
  $('customerPreview').innerHTML = `<article class="customer-card"><div class="mockup${setImageUrl(pack.image) ? ' has-image' : ''}">${setImageUrl(pack.image) ? `<img src="${esc(resolveSetImage(pack.image, '../business-card/'))}" alt="" referrerpolicy="no-referrer">` : esc(product.name.trim().charAt(0) || 'P')}</div><span class="set-label">${esc(product.name)}</span><h3>${esc(pack.name)}</h3><p>${esc(pack.description || 'เซตพร้อมสั่งที่ Admin จัดไว้')}</p>${(() => { const lines = setBullets({ product, pack, catalog }); return lines.length ? `<ul class="preview-bullets">${lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>` : ''; })()}<div class="price-block"><span>เริ่มต้น ${Number(pack.quantity).toLocaleString('th-TH')} ชิ้น</span><b>฿${fmt(pack.price)}</b></div>${groups.map(group => `<div class="preview-group"><b>${esc(group.name)}</b><small class="preview-rule">${esc(groupRuleText({ mode: group.source === 'material' ? 'single' : group.selectionMode, required: group.source === 'material' || group.required }))}</small><div>${group.choices.map(item => { const inc = product.mode === 'packages' && group.source === 'service' && includedIdsOf(product, pack).includes(item.id); return `<span class="${inc ? 'inc' : ''}">${esc(item.name)}${inc ? '<small>รวมในเซต</small>' : ''}</span>`; }).join('')}</div></div>`).join('')}<button type="button">เลือกเซตนี้</button></article>`;
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

const clockTime = iso => (iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : '');

function renderSaveState() {
  const chip = $('saveState');
  chip.textContent = saveStateLabel(saveState, draftMeta?.savedAt);
  chip.className = `save-state ${saveState}`;
  const banner = $('draftBanner');
  const lines = [];
  if (draftMeta) {
    const at = clockTime(draftMeta.savedAt);
    lines.push(saveState === 'unsaved'
      ? `กำลังแก้จากฉบับร่างที่บันทึกไว้${at ? ` เวลา ${at}` : ''} · มีการแก้ไขที่ยังไม่ได้บันทึก`
      : `กำลังแก้ฉบับร่าง${at ? ` (บันทึกล่าสุด ${at})` : ''} · ลูกค้ายังเห็นราคาที่เผยแพร่ล่าสุด`);
    if (draftMeta.baseVersion && draftMeta.baseVersion !== publishedVersion) {
      lines.push('มีการเผยแพร่ราคาใหม่หลังจากสร้างฉบับร่างนี้ การเผยแพร่ฉบับร่างจะเขียนทับราคาที่เผยแพร่ล่าสุด');
    }
  }
  banner.hidden = !lines.length;
  banner.innerHTML = lines.length ? `<div>${lines.map(line => `<p>${esc(line)}</p>`).join('')}</div><button type="button" class="text-button" id="discardDraft">ทิ้งฉบับร่าง</button>` : '';
}

function setSaveState(state) { saveState = state; renderSaveState(); }
function dirty() { if (saveState !== 'unsaved') { setStatus(''); setSaveState('unsaved'); } }
function setBusy(busy) { $('save').disabled = busy; $('saveDraft').disabled = busy; }
window.addEventListener('beforeunload', event => { if (saveState === 'unsaved') { event.preventDefault(); event.returnValue = ''; } });

function selectFirstProduct() {
  if (!settings.products.some(item => item.id === selectedProductId)) selectedProductId = settings.products[0].id;
  ensureKitchen(currentProduct());
  if (!currentProduct().packages.some(pack => pack.id === selectedPackageId)) selectedPackageId = currentProduct().packages[0].id;
}

async function restoreDraft() {
  if (!LOCAL && !$('key').value.trim()) { setStatus('ใส่ API Key เพื่อเปิดหรือบันทึกฉบับร่าง'); return false; }
  try {
    const draft = await loadDraft($('key').value);
    if (!draft) return false;
    settings = draft.settings;
    draftMeta = { savedAt: draft.savedAt, baseVersion: draft.baseVersion };
    setSaveState('draft');
    return true;
  } catch (error) {
    setStatus(`โหลดฉบับร่างไม่สำเร็จ: ${error.message}`, true);
    return false;
  }
}

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
  if (input.id === 'galleryFile' || input.id === 'galleryLink') return; // they change the gallery only through their own actions
  const product = currentProduct(), pack = currentPackage();
  if (input.dataset.productField) {
    const key = input.dataset.productField;
    product[key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    if (key === 'enabled') render();
    else if (key === 'name') { renderProductRail(); renderCustomerPreview(); }
    else previewPrice();
  } else if (input.dataset.packageField) {
    const key = input.dataset.packageField;
    pack[key] = input.type === 'checkbox' ? input.checked : key === 'lineOaId' ? input.value.trim() : key === 'bullets' ? parseBullets(input.value) : key === 'image' ? input.value.trim() : input.type === 'number' ? Number(input.value) : input.value;
    if (key === 'inquiryOnly') { dirty(); render(); return; }
    if (key === 'image') syncSetImage();
    renderCustomerPreview(); previewPrice();
  } else if (input.dataset.groupToggle != null) {
    product.optionGroups[Number(input.dataset.groupToggle)].enabled = input.checked;
    render();
  } else if (input.dataset.groupField) {
    const group = product.optionGroups[Number(input.dataset.groupIndex)];
    const key = input.dataset.groupField;
    group[key] = input.type === 'checkbox' ? input.checked : input.value;
    if (key === 'source') { group.itemIds = []; if (group.source === 'material') { group.selectionMode = 'single'; group.required = true; } render(); }
    else if (key === 'name') {
      input.closest('.option-group').querySelector('h3').textContent = group.name;
      renderCustomerPreview();
    } else render();
  } else if (input.dataset.includedId != null) {
    setIncluded(product, selectedPackageId, Number(input.dataset.groupIndex), input.dataset.includedId, input.checked);
    render();
  } else if (input.dataset.promoField) {
    const promo = product.promotions[Number(input.closest('[data-promo]').dataset.promo)];
    promo[input.dataset.promoField] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    previewPrice();
  }
  dirty();
});

$('editor').addEventListener('change', event => {
  if (event.target.id !== 'galleryFile') return;
  const files = [...event.target.files];
  event.target.value = '';
  if (files.length) uploadGalleryFiles(files);
});
$('editor').addEventListener('click', event => {
  const product = currentProduct();
  const imagePreset = event.target.closest('[data-image-preset]');
  if (imagePreset) {
    currentPackage().image = imagePreset.dataset.imagePreset;
    syncSetImage(); renderCustomerPreview(); dirty(); return;
  }
  const galleryRemove = event.target.closest('[data-gallery-remove]');
  if (galleryRemove) {
    const urls = galleryUrls(currentPackage().gallery);
    urls.splice(Number(galleryRemove.dataset.index), 1);
    setGallery(urls); syncGallery(); return;
  }
  const galleryMove = event.target.closest('[data-gallery-move]');
  if (galleryMove) {
    const urls = galleryUrls(currentPackage().gallery);
    const from = Number(galleryMove.dataset.index), to = from + Number(galleryMove.dataset.galleryMove);
    if (to >= 0 && to < urls.length) [urls[from], urls[to]] = [urls[to], urls[from]];
    setGallery(urls); syncGallery(); return;
  }
  if (event.target.closest('[data-gallery-add-link]')) {
    const field = $('galleryLink');
    const link = field.value.trim();
    const urls = galleryUrls(currentPackage().gallery);
    if (!link || !isValidSetImage(link) || !setImageUrl(link)) { syncGallery('ลิงก์ต้องขึ้นต้นด้วย https:// (เป็นลิงก์รูปตรง)', true); return; }
    if (urls.includes(link)) { syncGallery('มีภาพนี้ในแกลเลอรี่แล้ว', true); return; }
    field.value = '';
    setGallery([...urls, link]); syncGallery(); return;
  }
  if (event.target.closest('[data-clear-image]')) {
    currentPackage().image = '';
    syncSetImage(); renderCustomerPreview(); dirty(); return;
  }
  const toggleGroup = event.target.closest('[data-toggle-group]');
  if (toggleGroup) {
    const group = product.optionGroups[Number(toggleGroup.dataset.toggleGroup)];
    if (openGroups.has(group.id)) openGroups.delete(group.id); else openGroups.add(group.id);
    render(); return;
  }
  const openPickerButton = event.target.closest('[data-open-picker]');
  if (openPickerButton) { openPicker(Number(openPickerButton.dataset.openPicker)); return; }
  const packageButton = event.target.closest('[data-package]');
  if (packageButton) { selectedPackageId = packageButton.dataset.package; render(); return; }
  if (event.target.closest('[data-add-package]')) {
    const id = `set-${crypto.randomUUID().slice(0, 8)}`;
    product.packages.push({ id, name: 'เซตใหม่', description: 'พร้อมจัดรายการและตัวเลือก', quantity: 100, price: 0, optionIds: [], includedIds: [] });
    product.mode = 'packages'; selectedPackageId = id; render(); dirty(); return;
  }
  if (event.target.closest('[data-remove-package]') && product.packages.length > 1) {
    product.packages = product.packages.filter(pack => pack.id !== selectedPackageId);
    selectedPackageId = product.packages[0].id; render(); dirty(); return;
  }
  if (event.target.closest('[data-add-group]')) {
    const added = { id:`group-${crypto.randomUUID().slice(0,8)}`, name:'หมวดใหม่', enabled:true, source:'service', selectionMode:'single', required:false, itemIds:[] };
    product.optionGroups.push(added); openGroups.add(added.id);
    render(); dirty(); return;
  }
  const removeGroup = event.target.closest('[data-remove-group]');
  if (removeGroup) {
    const target = product.optionGroups[Number(removeGroup.dataset.removeGroup)];
    if (target.itemIds.length && !confirm(`ลบหมวด “${target.name}” และรายการ ${target.itemIds.length} รายการที่จัดไว้ในหมวดนี้ใช่ไหม? (รายการในแคตตาล็อกไม่ถูกลบ)`)) return;
    product.optionGroups.splice(Number(removeGroup.dataset.removeGroup), 1); openGroups.delete(target.id); render(); dirty(); return;
  }
  const moveGroup = event.target.closest('[data-move-group]');
  if (moveGroup) {
    const from = Number(moveGroup.dataset.groupIndex), to = from + (moveGroup.dataset.moveGroup === 'up' ? -1 : 1);
    if (to >= 0 && to < product.optionGroups.length) [product.optionGroups[from], product.optionGroups[to]] = [product.optionGroups[to], product.optionGroups[from]];
    render(); dirty(); return;
  }
  const ingredient = event.target.closest('[data-option-id]');
  if (ingredient) {
    const pack = currentPackage(), id = ingredient.dataset.optionId;
    toggleOffered(pack, id);
    render(); dirty(); return;
  }
  if (event.target.closest('[data-add-promo]')) {
    product.promotions.push({ id: crypto.randomUUID(), name: 'โปรโมชันใหม่', enabled: true, type: 'percent', scope: 'base', value: 10, minQuantity: 0, minSpend: 0, code: '', start: '', end: '' });
    render(); dirty(); return;
  }
  const removePromo = event.target.closest('[data-remove-promo]');
  if (removePromo) { product.promotions.splice(Number(removePromo.dataset.removePromo), 1); render(); dirty(); }
});

function setPickerNotice(message = '', error = false) {
  $('pickerNotice').textContent = message;
  $('pickerNotice').classList.toggle('error', error);
  $('pickerNotice').classList.toggle('visible', Boolean(message));
}

function renderPicker() {
  const group = currentProduct()?.optionGroups[pickerGroupIndex];
  if (!group) return;
  const isMaterial = group.source === 'material';
  const kind = isMaterial ? 'วัสดุ' : 'บริการ';
  $('pickerKind').textContent = `หมวดตัวเลือก · ${kind}`;
  $('pickerTitle').textContent = `รายการในหมวด “${group.name}”`;
  $('pickerCreateTitle').textContent = `＋ สร้าง${kind}ใหม่`;
  $('pickerForm').querySelector('.picker-service-fields').hidden = isMaterial;
  if (!$('pickerForm').unit.options.length) {
    $('pickerForm').unit.innerHTML = UNIT_OPTIONS.map(unit => option(unit.value, unit.label, unit.value === 'sheet')).join('');
    $('pickerForm').capacityBasis.innerHTML = CAPACITY_BASIS_OPTIONS.map(basis => option(basis.value, basis.label)).join('');
  }
  $('pickerCategories').innerHTML = [...new Set(catalog.services.map(item => item.category).filter(Boolean))].map(name => `<option value="${esc(name)}"></option>`).join('');
  const all = catalogListFor(catalog, group.source);
  const rows = filterCatalogItems(all, $('pickerSearch').value);
  $('pickerList').innerHTML = rows.length ? rows.map(item => {
    const inGroup = group.itemIds.includes(item.id);
    const price = item.price ? `฿${fmt(item.price)} / ${esc(formatUnit(item.unit))}` : 'ไม่มีราคา';
    const action = pickerConfirmId === item.id
      ? `<div class="picker-confirm"><p>${esc(describeUsage(itemUsage(settings, item.id)))}<br>ปิดแล้วรายการจะหายจากหมวดและเซตเหล่านี้ และลูกค้าจะไม่เห็นในเครื่องคิดราคา (เก็บประวัติเดิมไว้)</p><div><button type="button" class="remove" data-picker-confirm="${esc(item.id)}">ยืนยันปิดใช้งาน</button> <button type="button" class="text-button" data-picker-cancel>ยกเลิก</button></div></div>`
      : `<button type="button" class="text-danger" data-picker-deactivate="${esc(item.id)}">ปิดใช้งาน</button>`;
    return `<div class="picker-row ${inGroup ? 'in-group' : ''}"><label><input type="checkbox" data-picker-item="${esc(item.id)}" ${inGroup ? 'checked' : ''}><span><b>${esc(item.name)}</b><small>${price}</small></span></label>${action}</div>`;
  }).join('') : `<p class="picker-empty">${all.length ? 'ไม่พบรายการที่ค้นหา' : `ยังไม่มี${kind}ในแคตตาล็อก สร้างรายการแรกได้ด้านล่าง`}</p>`;
}

function openPicker(groupIndex) {
  pickerGroupIndex = groupIndex; pickerConfirmId = null;
  $('pickerSearch').value = ''; setPickerNotice(); $('pickerForm').reset(); $('pickerCreate').open = false;
  renderPicker();
  $('itemPicker').showModal();
}

async function deactivatePickerItem(id) {
  const group = currentProduct().optionGroups[pickerGroupIndex];
  const collection = group.source === 'material' ? 'materials' : 'services';
  const item = catalog[collection].find(entry => entry.id === id);
  if (!item) return;
  try {
    await deactivateCatalogItem(group.source, item, $('key').value);
    catalog[collection] = catalog[collection].filter(entry => entry.id !== id);
    removeItemEverywhere(settings, id);
    pickerConfirmId = null;
    dirty(); render(); renderPicker();
    setPickerNotice(`ปิดใช้งาน “${item.name}” แล้ว โดยยังเก็บประวัติเดิมไว้`);
  } catch (error) {
    setPickerNotice(error.message, true);
  }
}

async function createPickerItem(event) {
  event.preventDefault();
  const product = currentProduct();
  const group = product.optionGroups[pickerGroupIndex];
  const form = new FormData($('pickerForm'));
  const check = newCatalogItemPayload(group.source, Object.fromEntries(form.entries()));
  if (!check.success) return setPickerNotice(check.errors.join(' • '), true);
  $('pickerCreateButton').disabled = true;
  try {
    const item = await createCatalogItem(group.source, check.value, $('key').value);
    catalog[group.source === 'material' ? 'materials' : 'services'].push(item);
    setGroupItem(product, pickerGroupIndex, item.id, true, { selectInPackageId: selectedPackageId });
    $('pickerForm').reset(); $('pickerCreate').open = false;
    dirty(); render(); renderPicker();
    setPickerNotice(`สร้าง “${item.name}” แล้วและเพิ่มเข้าหมวดนี้ (แคตตาล็อกมีผลทันที)`);
  } catch (error) {
    setPickerNotice(error.message, true);
  } finally {
    $('pickerCreateButton').disabled = false;
  }
}

$('itemPicker').addEventListener('click', event => {
  if (event.target === $('itemPicker') || event.target.closest('[data-picker-close]')) { $('itemPicker').close(); return; }
  const deactivate = event.target.closest('[data-picker-deactivate]');
  if (deactivate) { pickerConfirmId = deactivate.dataset.pickerDeactivate; setPickerNotice(); renderPicker(); return; }
  if (event.target.closest('[data-picker-cancel]')) { pickerConfirmId = null; renderPicker(); return; }
  const confirmButton = event.target.closest('[data-picker-confirm]');
  if (confirmButton) deactivatePickerItem(confirmButton.dataset.pickerConfirm);
});
$('itemPicker').addEventListener('change', event => {
  const box = event.target.closest('[data-picker-item]');
  if (!box) return;
  setGroupItem(currentProduct(), pickerGroupIndex, box.dataset.pickerItem, box.checked, { selectInPackageId: selectedPackageId });
  dirty(); render(); renderPicker();
});
$('pickerSearch').addEventListener('input', renderPicker);
$('pickerForm').addEventListener('submit', createPickerItem);
$('itemPicker').addEventListener('close', () => { pickerConfirmId = null; render(); });

$('add').addEventListener('click', () => {
  const product = newProduct(`product-${crypto.randomUUID().slice(0, 8)}`, 'สินค้าใหม่');
  settings.products.push(product); selectedProductId = product.id; ensureKitchen(product); selectedPackageId = product.packages[0].id; render(); dirty();
});

$('save').addEventListener('click', async () => {
  setBusy(true);
  try {
    if (!LOCAL) {
      const latest = await loadPricing();
      if (latest.version !== publishedVersion && !confirm('มีการเผยแพร่ราคาที่ใหม่กว่าข้อมูลที่คุณเปิดอยู่ การเผยแพร่ตอนนี้จะเขียนทับการเปลี่ยนแปลงนั้น ต้องการดำเนินการต่อหรือไม่?')) return;
    }
    settings = await savePricing(settings, $('key').value);
    publishedVersion = settings.version;
    if (draftMeta) { try { await discardDraft($('key').value); } catch (error) { /* the published settings are already saved */ } }
    draftMeta = null;
    setSaveState('published');
    setStatus(LOCAL ? 'เผยแพร่บนเครื่องนี้แล้ว · หน้าขายจะใช้ค่าหลังรีเฟรช' : 'เผยแพร่ให้ลูกค้าแล้ว');
    render();
  }
  catch (error) { setStatus(error.message, true); }
  finally { setBusy(false); }
});

async function storeDraft(force = false) {
  const draft = await saveDraft(settings, { baseVersion: draftMeta?.baseVersion ?? publishedVersion, expectedSavedAt: draftMeta?.savedAt ?? '', force }, $('key').value);
  draftMeta = { savedAt: draft.savedAt, baseVersion: draft.baseVersion };
  setSaveState('draft');
  setStatus('บันทึกฉบับร่างแล้ว · ลูกค้ายังเห็นราคาที่เผยแพร่ล่าสุด');
}

$('saveDraft').addEventListener('click', async () => {
  setBusy(true);
  try { await storeDraft(); }
  catch (error) {
    if (error.code === 'DRAFT_CONFLICT') {
      const at = clockTime(error.current?.savedAt);
      if (confirm(`มีคนอื่นบันทึกฉบับร่างไว้${at ? ` เมื่อเวลา ${at}` : ''} ต้องการเขียนทับด้วยฉบับของคุณหรือไม่?`)) {
        try { await storeDraft(true); } catch (retry) { setStatus(retry.message, true); }
      }
    } else setStatus(error.message, true);
  }
  finally { setBusy(false); }
});

$('draftBanner').addEventListener('click', async event => {
  if (!event.target.closest('#discardDraft')) return;
  if (!confirm('ทิ้งฉบับร่างและกลับไปใช้ราคาที่เผยแพร่ล่าสุดใช่ไหม? การแก้ไขในฉบับร่างจะหายไป')) return;
  setBusy(true);
  try {
    await discardDraft($('key').value);
    settings = await loadPricing();
    publishedVersion = settings.version || '';
    if (!settings.products.length) settings.products.push(newBusinessCardProduct());
    draftMeta = null;
    settings.products.forEach(ensureKitchen);
    selectFirstProduct();
    setSaveState('published');
    setStatus('ทิ้งฉบับร่างแล้ว');
    render();
  } catch (error) { setStatus(error.message, true); }
  finally { setBusy(false); }
});

$('key').addEventListener('change', async () => {
  if (saveState !== 'published' || draftMeta || LOCAL) return;
  if (await restoreDraft()) { settings.products.forEach(ensureKitchen); selectFirstProduct(); setStatus('เปิดฉบับร่างที่บันทึกไว้แล้ว'); render(); }
});

$('previewPackage').addEventListener('change', event => { selectedPackageId = event.target.value; $('quantity').value = currentPackage().quantity; render(); });
for (const id of ['quantity','sheets','cost','previewMaterial','previewServices','code','date']) $(id).addEventListener('input', previewPrice);

$('environment').textContent = LOCAL ? 'โหมดทดลอง · บันทึกในเบราว์เซอร์นี้' : 'ระบบจริง · Staff only';
$('keyWrap').hidden = LOCAL;
$('date').value = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
$('key').value = storedWriteKey();
setBusy(true); $('add').disabled = true;
try {
  [settings, catalog] = await Promise.all([loadPricing(), loadCatalog()]);
  publishedVersion = settings.version || '';
  await restoreDraft();
  if (!settings.products.length) settings.products.push(newBusinessCardProduct());
  settings.products.forEach(ensureKitchen);
  selectedProductId = settings.products[0].id;
  selectedPackageId = settings.products[0].packages[0].id;
  renderSaveState(); render(); setBusy(false); $('add').disabled = false;
} catch (error) { setStatus(error.message, true); }
