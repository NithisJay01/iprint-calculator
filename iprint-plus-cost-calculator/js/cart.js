const CART_STORAGE_KEY = IPRINT_TEST_MODE ? 'iprint_test_order_cart_v1' : 'iprint_order_cart_v1';
const CART_ASSET_DB = IPRINT_TEST_MODE ? 'iprint_test_order_cart_assets_v1' : 'iprint_order_cart_assets_v1';
const CART_ASSET_STORE = 'briefs';
const CART_MAX_ITEMS = 20;

function cartId(prefix = 'item') {
  const id = globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) + Math.random().toString(36).slice(2);

  return prefix + '-' + id;
}

function cartEscape(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function openCartAssetDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CART_ASSET_DB, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CART_ASSET_STORE)) {
        database.createObjectStore(CART_ASSET_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('เปิดพื้นที่เก็บภาพชั่วคราวไม่สำเร็จ'));
  });
}

async function cartAsset(action, key, value) {
  const database = await openCartAssetDb();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(CART_ASSET_STORE, 'readwrite');
      const store = transaction.objectStore(CART_ASSET_STORE);
      const request = action === 'put'
        ? store.put(value, key)
        : action === 'delete'
          ? store.delete(key)
          : store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('จัดการภาพชั่วคราวไม่สำเร็จ'));
    });
  } finally {
    database.close();
  }
}

function loadCart() {
  try {
    if (IPRINT_RESET_TEST_DATA) localStorage.removeItem(CART_STORAGE_KEY);
    const stored = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    cartItems = Array.isArray(stored)
      ? stored.filter(item => item && item.id && item.size).slice(0, CART_MAX_ITEMS)
      : [];
  } catch (error) {
    cartItems = [];
  }

  renderCart();
}

function saveCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  } catch (error) {
    console.warn('Save cart', error);
  }

  renderCart();
}

function cartTotal() {
  return cartItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
}

function cartItemName(calc, index = cartItems.length + 1) {
  const jobName = String($('jobName')?.value || '').trim();
  if (jobName) return jobName;
  const materialName = String(calc.material?.name || '').trim();
  const size = `${(Number(calc.W) || 0).toFixed(2)} × ${(Number(calc.H) || 0).toFixed(2)} cm`;

  return materialName
    ? `${materialName} • ${size}`
    : `งานพิมพ์ ${index} • ${size}`;
}

function snapshotCartItem(calc, id) {
  const artworkSides = typeof getArtworkSideState === 'function'
    ? getArtworkSideState()
    : { hasFront: false, hasBack: false, useFrontForBack: false };
  const material = calc.material
    ? {
        id: String(calc.material.id || ''),
        name: String(calc.material.name || ''),
        unit: String(calc.material.unit || ''),
        price: Number(calc.material.price) || 0,
        previewRenderer: String(calc.material.previewRenderer || ''),
        previewEffect: String(calc.material.previewEffect || ''),
        shaderPreset: String(calc.material.shaderPreset || ''),
        textureUrl: String(calc.material.textureUrl || '')
      }
    : null;
  const selectedServices = (Array.isArray(calc.services) ? calc.services : []).map(service => ({
    id: String(service.id || ''),
    name: String(service.name || ''),
    unit: String(service.unit || ''),
    price: Number(service.price) || 0,
    previewRenderer: String(service.previewRenderer || ''),
    previewEffect: String(service.previewEffect || ''),
    shaderPreset: String(service.shaderPreset || ''),
    textureUrl: String(service.textureUrl || '')
  }));

  return {
    id,
    name: cartItemName(calc),
    size: `${(Number(calc.W) || 0).toFixed(2)} × ${(Number(calc.H) || 0).toFixed(2)} cm`,
    width: Number(calc.W) || 0,
    height: Number(calc.H) || 0,
    quantity: Number(calc.Q) || 0,
    unit: 'ดวง',
    paper: {
      key: String(selectedSheet || ''),
      id: String(calc.paper?.pageId || calc.paper?.id || ''),
      name: String(calc.paper?.name || '')
    },
    sheets: Number(calc.sheets) || 0,
    yield: Number(calc.b?.yield) || 0,
    gap: Number(calc.gap) || 0,
    bleed: Number(calc.bleed) || 0,
    material,
    services: selectedServices,
    price: Number(calc.sale) || 0,
    variants: typeof getJobVariants === 'function' ? getJobVariants() : [],
    printSide: typeof getSelectedPrintSide === 'function' ? getSelectedPrintSide() : 'unspecified',
    productionService: typeof getSelectedHomeService === 'function' ? getSelectedHomeService() : 'laser',
    artworkSides: {
      hasFront: Boolean(artworkSides.hasFront),
      hasBack: Boolean(artworkSides.hasBack),
      useFrontForBack: Boolean(artworkSides.useFrontForBack),
      frontRotation: Number(artworkSides.frontRotation) || 0,
      backRotation: Number(artworkSides.backRotation) || 0
    },
    briefFileLink: String($('briefFileLink')?.value || '').trim(),
    brief: String($('graphicBriefDescription')?.value || '').trim(),
    briefDeadline: typeof normalizeFlowDateValue === 'function' ? normalizeFlowDateValue($('briefDeadline')?.value) : String($('briefDeadline')?.value || '').trim(),
    deliveryDeadline: typeof normalizeFlowDateValue === 'function' ? normalizeFlowDateValue($('deliveryDeadline')?.value) : String($('deliveryDeadline')?.value || '').trim(),
    editor: {
      costPerSheet: Number(calc.C) || 0,
      profitPercent: Number(calc.P) || 0
    },
    createdAt: new Date().toISOString()
  };
}

async function addCurrentJobToCart() {
  const button = $('addToCart');
  const status = $('cartStatus');

  if (!lastCalc) {
    status.textContent = 'กรุณากรอกข้อมูลชิ้นงานให้ครบก่อนเพิ่มลงตะกร้า';
    status.className = 'brief-status status warn';
    return false;
  }

  if (typeof validateJobVariants === 'function' && !validateJobVariants(true)) {
    status.textContent = 'กรุณาตรวจสอบจำนวนของแต่ละแบบก่อนเพิ่มลงตะกร้า';
    status.className = 'brief-status status warn';
    return false;
  }

  if (!editingCartItemId && cartItems.length >= CART_MAX_ITEMS) {
    status.textContent = `หนึ่งออเดอร์เพิ่มได้สูงสุด ${CART_MAX_ITEMS} รายการ`;
    status.className = 'brief-status status warn';
    return false;
  }

  const defaultLabel = button.textContent;
  button.disabled = true;
  button.textContent = editingCartItemId ? 'กำลังอัปเดตรายการ…' : 'กำลังเพิ่มลงตะกร้า…';

  try {
    const itemId = editingCartItemId || cartId();
    const briefImage = await captureBriefImage(lastCalc);
    const item = snapshotCartItem(lastCalc, itemId);
    const existingIndex = cartItems.findIndex(entry => entry.id === itemId);

    await cartAsset('put', itemId, briefImage);

    if (existingIndex >= 0) {
      cartItems.splice(existingIndex, 1, item);
    } else {
      cartItems.push(item);
    }

    editingCartItemId = '';
    saveCart();
    if (typeof clearTemporaryImages === 'function') clearTemporaryImages();
    if ($('graphicBriefDescription')) $('graphicBriefDescription').value = '';
    if ($('briefDeadline')) $('briefDeadline').value = '';
    if ($('deliveryDeadline')) $('deliveryDeadline').value = '';
    status.textContent = existingIndex >= 0
      ? 'อัปเดตรายการในตะกร้าแล้ว'
      : `เพิ่มลงตะกร้าแล้ว • ${cartItems.length} รายการ`;
    status.className = 'brief-status status ok';
    if (typeof showAppView === 'function') showAppView('cart');
    return true;
  } catch (error) {
    console.error('Add cart item', error);
    status.textContent = 'เพิ่มรายการไม่สำเร็จ: ' + (error.message || String(error));
    status.className = 'brief-status status warn';
    return false;
  } finally {
    button.disabled = false;
    button.textContent = editingCartItemId
      ? 'อัปเดตรายการในตะกร้า'
      : 'เพิ่มงานลงตะกร้า';
  }
}

function renderCart() {
  const count = $('cartCount');
  const list = $('cartList');
  const total = $('cartTotal');
  const openQuoteButton = $('openQuote');

  if (count) count.textContent = String(cartItems.length);
  if (total) total.textContent = '฿' + money(cartTotal());
  if ($('cartItemLabel')) $('cartItemLabel').textContent = `${cartItems.length.toLocaleString('th-TH')} รายการ`;
  const subtotal = cartTotal();
  const vat = subtotal * 0.07;
  if ($('cartSubtotal')) $('cartSubtotal').textContent = '฿' + money(subtotal);
  if ($('cartDiscount')) $('cartDiscount').textContent = '-฿0.00';
  if ($('cartVat')) $('cartVat').textContent = '฿' + money(vat);
  if ($('cartGrandTotal')) $('cartGrandTotal').textContent = '฿' + money(subtotal + vat);
  if (openQuoteButton) openQuoteButton.disabled = cartItems.length === 0;
  if (!list) return;

  if (!cartItems.length) {
    list.innerHTML = '<div class="cart-empty">ยังไม่มีชิ้นงานในตะกร้า</div>';
    return;
  }

  list.innerHTML = cartItems.map((item, index) => {
    const services = (item.services || []).map(service => service.name).filter(Boolean).join(', ');
    const detail = [item.paper?.name, item.material?.name, services].filter(Boolean).join(' • ');
    const variants = Array.isArray(item.variants) && item.variants.length
      ? item.variants
      : [{ name: '', quantity: item.quantity }];

    return `<article class="cart-item" data-cart-id="${cartEscape(item.id)}">
      <div class="cart-item-head"><div><small>รายการที่ ${index + 1}</small><strong>${cartEscape(item.name)}</strong><span>${cartEscape(item.size)} • ${cartEscape(detail || 'ยังไม่ได้เลือกวัสดุหรือบริการ')}</span></div><button class="cart-item-remove" type="button" data-cart-action="remove" aria-label="ลบรายการ">×</button></div>
      <div class="cart-variant-list">${variants.map((variant, variantIndex) => `<div class="cart-variant-row"><b>แบบที่ ${variantIndex + 1}</b><span>${cartEscape(variant.name || '-')}</span><strong>${Number(variant.quantity || 0).toLocaleString('th-TH')} ชิ้น</strong></div>`).join('')}</div>
      <div class="cart-production-row"><span>จัดวาง ${Number(item.yield || 0).toLocaleString('th-TH')} ชิ้น/แผ่น</span><span>ใช้ ${Number(item.sheets || 0).toLocaleString('th-TH')} แผ่น</span><span>รวม ${Number(item.quantity || 0).toLocaleString('th-TH')} ชิ้น</span><strong>฿${money(item.price)}</strong></div>
      <div class="cart-item-actions"><button type="button" data-cart-action="edit">แก้ไขรายการ</button><button type="button" data-cart-action="duplicate">+ สร้างก็อปปี้ลิสต์</button></div>
    </article>`;
  }).join('');
}

function openCart() {
  renderCart();
  if (typeof showAppView === 'function') showAppView('cart');
}

function closeCart() {
  if (typeof showAppView === 'function') showAppView('home');
}

function restoreCartItem(item) {
  if (!item) return;

  editingCartItemId = item.id;
  if (item.paper?.key && presets[item.paper.key]) {
    selectedSheet = item.paper.key;
    $('sheet').value = selectedSheet;
  }
  $('w').value = item.width;
  $('h').value = item.height;
  $('qty').value = item.quantity;
  $('cost').value = item.editor?.costPerSheet ?? 2.5;
  $('profitPercent').value = item.editor?.profitPercent ?? 30;
  $('pieceGap').value = item.gap || 3;
  $('bleed').value = item.bleed || 3;
  selectedMaterialId = String(item.material?.id || '');
  selectedServiceIds = {};
  (item.services || []).forEach(service => {
    if (service.id) selectedServiceIds[String(service.id)] = true;
  });
  $('graphicBriefDescription').value = item.brief || '';
  $('briefDeadline').value = typeof formatFlowDateInput === 'function' ? formatFlowDateInput(item.briefDeadline) : (item.briefDeadline || '');
  $('deliveryDeadline').value = typeof formatFlowDateInput === 'function' ? formatFlowDateInput(item.deliveryDeadline) : (item.deliveryDeadline || '');
  if ($('jobName')) $('jobName').value = item.name || '';
  if ($('briefFileLink')) {
    $('briefFileLink').value = item.briefFileLink || '';
    $('briefFileLink').hidden = !item.briefFileLink;
  }
  if (typeof setJobVariants === 'function') setJobVariants(item.variants || [{ name: '', quantity: item.quantity }]);
  renderMaterials();
  renderServices();
  saveState();
  calculate();
  $('addToCart').textContent = 'อัปเดตรายการในตะกร้า';
  $('cartStatus').textContent = 'กำลังแก้ไขรายการจากตะกร้า';
  $('cartStatus').className = 'brief-status status';
  closeCart();
  if (typeof showAppView === 'function') showAppView('layout');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function handleCartAction(event) {
  const actionButton = event.target.closest('[data-cart-action]');
  if (!actionButton) return;
  const itemElement = actionButton.closest('[data-cart-id]');
  const item = cartItems.find(entry => entry.id === itemElement?.dataset.cartId);
  if (!item) return;

  const action = actionButton.dataset.cartAction;
  if (action === 'edit') {
    restoreCartItem(item);
    return;
  }

  if (action === 'duplicate') {
    if (cartItems.length >= CART_MAX_ITEMS) return;
    const copy = JSON.parse(JSON.stringify(item));
    copy.id = cartId();
    copy.name = item.name + ' (สำเนา)';
    copy.createdAt = new Date().toISOString();
    const brief = await cartAsset('get', item.id);
    if (brief) await cartAsset('put', copy.id, brief);
    cartItems.push(copy);
    saveCart();
    return;
  }

  if (action === 'remove') {
    cartItems = cartItems.filter(entry => entry.id !== item.id);
    if (editingCartItemId === item.id) editingCartItemId = '';
    await cartAsset('delete', item.id);
    saveCart();
  }
}

async function cartBriefImages() {
  return Promise.all(cartItems.map(item => cartAsset('get', item.id)));
}

function publicOrderItems() {
  return cartItems.map((item, index) => ({
    id: item.id,
    lineNo: index + 1,
    name: item.name,
    size: item.size,
    quantity: item.quantity,
    unit: item.unit,
    paper: item.paper,
    sheets: item.sheets,
    yield: item.yield,
    material: item.material,
    services: item.services,
    price: item.price,
    brief: item.brief,
    briefDeadline: item.briefDeadline || '',
    deliveryDeadline: item.deliveryDeadline || ''
    ,variants: item.variants || []
    ,printSide: item.printSide || 'unspecified'
    ,productionService: item.productionService || 'laser'
    ,artworkSides: item.artworkSides || { hasFront: false, hasBack: false, useFrontForBack: false }
    ,briefFileLink: item.briefFileLink || ''
  }));
}

async function clearCartAfterOrder() {
  await Promise.all(cartItems.map(item => cartAsset('delete', item.id).catch(() => null)));
  cartItems = [];
  editingCartItemId = '';
  localStorage.removeItem(CART_STORAGE_KEY);
  renderCart();
}

function bindCart() {
  loadCart();
  $('addToCart').addEventListener('click', addCurrentJobToCart);
  $('openCart').addEventListener('click', openCart);
  $('closeCart').addEventListener('click', closeCart);
  $('cancelCart').addEventListener('click', closeCart);
  $('cartList').addEventListener('click', handleCartAction);
}
