'use strict';

let staffCatalogType = 'materials';
let staffCatalogView = 'cards';
const staffCatalogCollections = { materials: [], services: [] };
const staffCatalogItems = () => IPRINT_TEST_MODE
  ? (staffCatalogType === 'services' ? services : materials)
  : staffCatalogCollections[staffCatalogType];
const staffCatalogEscape = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

function staffServiceCategories() {
  return [...new Set([
    'รูปแบบการพิมพ์', 'การเคลือบ', 'การตัด', 'DIY Solution', 'บริการเพิ่มเติม',
    ...services.map(service => String(service.category || '').trim()).filter(Boolean)
  ])].sort((a, b) => a.localeCompare(b, 'th'));
}

function syncStaffCategoryControl() {
  const isService = staffCatalogType === 'services';
  $('staffCatalogCategoryWrap').hidden = !isService;
  $('staffCatalogCapacityWrap').hidden = !isService;
  $('staffCatalogCategory').required = isService;
  $('staffCatalogCategoryList').innerHTML = staffServiceCategories()
    .map(category => `<option value="${staffCatalogEscape(category)}"></option>`).join('');
  if (!isService) $('staffCatalogCategory').value = '';
  updateStaffCapacityPreview();
}

function staffCapacityBasisLabel(value) {
  if (value === 'sheet') return 'แผ่น';
  if (value === 'piece') return 'ชิ้น';
  return 'งาน';
}

function updateStaffCapacityPreview() {
  const preview = $('staffCapacityPreview');
  const stepInput = $('staffCapacityStep');
  if (!preview || !stepInput) return;
  const points = Math.max(0, Number($('staffCapacityPoints')?.value) || 0);
  const basis = String($('staffCapacityBasis')?.value || 'job');
  if (basis === 'job') {
    stepInput.value = '1';
    stepInput.disabled = true;
  } else {
    stepInput.disabled = false;
  }
  const step = Math.max(1, Number(stepInput.value) || 1);
  preview.textContent = points > 0
    ? `${points.toLocaleString('th-TH')} แต้ม ต่อทุก ${step.toLocaleString('th-TH')} ${staffCapacityBasisLabel(basis)}`
    : 'บริการนี้ยังไม่เพิ่มภาระในคิว';
}

function staffCatalogResetForm() {
  $('staffCatalogEditId').value = '';
  $('staffCatalogName').value = '';
  $('staffCatalogPrice').value = '';
  $('staffCatalogUnit').value = staffCatalogType === 'materials' ? 'sheet' : 'job';
  $('staffCatalogActive').checked = true;
  $('staffCapacityPoints').value = '0';
  $('staffCapacityBasis').value = 'job';
  $('staffCapacityStep').value = '1';
  syncStaffCategoryControl();
}

function setStaffCatalogNotice(message, kind = '') {
  const notice = $('staffCatalogNotice');
  notice.textContent = message;
  notice.className = `staff-catalog-notice${kind ? ` ${kind}` : ''}`;
}

function formatStaffCatalogUpdatedAt(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'ยังไม่มีประวัติการแก้ไข';
  return `แก้ไขล่าสุด ${date.toLocaleDateString('th-TH-u-ca-gregory', { day: '2-digit', month: 'short', year: 'numeric' })} • ${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
}

function staffCatalogUnitOptions(selectedUnit) {
  return [['sheet', 'ต่อแผ่น'], ['piece', 'ต่อชิ้น'], ['job', 'ต่องาน']]
    .map(([value, label]) => `<option value="${value}"${normalizeUnit(selectedUnit) === value ? ' selected' : ''}>${label}</option>`).join('');
}

function renderStaffCatalogTable(items) {
  const isService = staffCatalogType === 'services';
  return `<div class="staff-catalog-table-wrap"><table class="staff-catalog-table">
    <thead><tr><th>ชื่อที่แสดงบนเว็บ</th>${isService ? '<th>หมวดหมู่</th>' : ''}<th>ราคา</th><th>หน่วย</th><th>ลำดับ</th><th>แสดง</th><th>จัดการ</th></tr></thead>
    <tbody>${items.map(item => `<tr data-catalog-id="${staffCatalogEscape(item.id)}">
      <td><input data-table-field="name" maxlength="120" value="${staffCatalogEscape(item.name || '')}" aria-label="ชื่อรายการ"></td>
      ${isService ? `<td><input data-table-field="category" list="staffCatalogCategoryList" maxlength="80" value="${staffCatalogEscape(item.category || 'บริการเพิ่มเติม')}" aria-label="หมวดหมู่"></td>` : ''}
      <td><input data-table-field="price" type="number" min="0" step="0.01" value="${Number(item.price) || 0}" aria-label="ราคา"></td>
      <td><select data-table-field="unit" aria-label="หน่วย">${staffCatalogUnitOptions(item.unit)}</select></td>
      <td><input data-table-field="sortOrder" type="number" min="0" step="1" value="${Number(item.sortOrder) || 0}" aria-label="ลำดับการแสดง"></td>
      <td><label class="staff-table-active"><input data-table-field="active" type="checkbox"${item.active === false ? '' : ' checked'}><span>${item.active === false ? 'ปิด' : 'เปิด'}</span></label></td>
      <td><div class="staff-table-actions"><button type="button" data-catalog-action="save-row">บันทึก</button><button type="button" data-catalog-action="edit">รายละเอียด</button></div></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderStaffCatalog() {
  const list = $('staffCatalogList');
  if (!list) return;
  const items = [...staffCatalogItems()].sort((a, b) => {
    const aOrder = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 9999;
    const bOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 9999;
    const orderDifference = aOrder - bOrder;
    if (orderDifference) return orderDifference;
    const updatedDifference = (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0);
    return updatedDifference;
  });
  if (!items.length) {
    list.innerHTML = '<div class="staff-catalog-empty">ยังไม่มีรายการในหมวดนี้</div>';
    return;
  }
  if (staffCatalogView === 'table') {
    list.innerHTML = renderStaffCatalogTable(items);
    return;
  }
  list.innerHTML = items.map(item => `
    <article class="staff-catalog-item ${item.active === false ? 'is-inactive' : 'is-active'}" data-catalog-id="${staffCatalogEscape(item.id)}">
      <div><strong>${staffCatalogEscape(item.name || 'ไม่ระบุชื่อ')}</strong><span>${staffCatalogType === 'services' ? `${staffCatalogEscape(item.category || 'บริการเพิ่มเติม')} • ` : ''}฿${money(item.price)} / ${staffCatalogEscape(unit(item.unit))}</span>${staffCatalogType === 'services' ? `<small class="staff-catalog-capacity">กำลังผลิต ${Number(item.capacityPoints || 0).toLocaleString('th-TH')} แต้ม / ${Number(item.capacityStep || 1).toLocaleString('th-TH')} ${staffCatalogEscape(staffCapacityBasisLabel(item.capacityBasis || 'job'))}</small>` : ''}<small class="staff-catalog-updated">${staffCatalogEscape(formatStaffCatalogUpdatedAt(item.updatedAt))}</small></div>
      <div class="staff-catalog-item-side"><span class="staff-catalog-state ${item.active === false ? 'is-off' : ''}">${item.active === false ? 'ปิด' : 'เปิด'}</span><b aria-hidden="true">›</b></div>
      <div class="staff-catalog-quick-actions"><button class="staff-catalog-quick-edit" type="button" data-catalog-action="edit"><img class="button-icon" src="image/edit.svg" alt="">แก้ไขรายละเอียด</button><button class="staff-catalog-quick-toggle ${item.active === false ? 'will-enable' : 'will-disable'}" type="button" data-catalog-action="toggle">${item.active === false ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</button></div>
    </article>`).join('');
}

function showStaffCatalogList() {
  $('staffCatalogEditor').hidden = true;
  $('staffCatalogListPanel').hidden = false;
  $('staffCatalogTabs').hidden = false;
  $('staffCatalogBack').hidden = false;
  renderStaffCatalog();
}

function showStaffCatalogEditor(item = null) {
  staffCatalogResetForm();
  $('staffCatalogListPanel').hidden = true;
  $('staffCatalogEditor').hidden = false;
  $('staffCatalogTabs').hidden = true;
  $('staffCatalogBack').hidden = true;
  $('staffCatalogEditorTitle').textContent = item ? 'แก้ไขรายการ' : 'เพิ่มรายการ';
  $('deleteStaffCatalogItem').hidden = !item;
  if (item) {
    $('staffCatalogEditId').value = item.id;
    $('staffCatalogName').value = item.name || '';
    $('staffCatalogPrice').value = Number(item.price) || 0;
    $('staffCatalogUnit').value = normalizeUnit(item.unit) || 'job';
    $('staffCatalogActive').checked = item.active !== false;
    $('staffCatalogCategory').value = item.category || 'บริการเพิ่มเติม';
    $('staffCapacityPoints').value = Number(item.capacityPoints) || 0;
    $('staffCapacityBasis').value = ['job', 'sheet', 'piece'].includes(item.capacityBasis) ? item.capacityBasis : 'job';
    $('staffCapacityStep').value = Math.max(1, Number(item.capacityStep) || 1);
    updateStaffCapacityPreview();
  }
  setTimeout(() => $('staffCatalogName').focus(), 50);
}

function persistTestCatalog() {
  if (!IPRINT_TEST_MODE) return false;
  cachePut(staffCatalogType === 'services' ? CACHE.services : CACHE.materials, staffCatalogItems());
  return true;
}

async function syncCatalogDependents() {
  if (!IPRINT_TEST_MODE) {
    if (staffCatalogType === 'materials') await syncMaterials();
    else await syncServices();
  } else if (staffCatalogType === 'materials') renderMaterials();
  else renderServices();
  calculate();
}

async function submitStaffCatalog(event) {
  event.preventDefault();
  if (activeAccessRole !== 'staff') return;
  const id = $('staffCatalogEditId').value;
  const name = $('staffCatalogName').value.trim();
  const price = Number($('staffCatalogPrice').value);
  const category = $('staffCatalogCategory').value.trim();
  const capacityPoints = Number($('staffCapacityPoints').value);
  const capacityBasis = $('staffCapacityBasis').value;
  const capacityStep = Number($('staffCapacityStep').value);
  const invalidCapacity = staffCatalogType === 'services' && (
    !Number.isFinite(capacityPoints) || capacityPoints < 0 ||
    !['job', 'sheet', 'piece'].includes(capacityBasis) ||
    !Number.isFinite(capacityStep) || capacityStep <= 0
  );
  if (!name || !Number.isFinite(price) || price < 0 || (staffCatalogType === 'services' && !category) || invalidCapacity) {
    setStaffCatalogNotice('กรุณากรอกชื่อ ราคา หมวดหมู่ และแต้มกำลังผลิตให้ถูกต้อง', 'warn');
    return;
  }
  const collection = staffCatalogItems();
  const existing = collection.find(item => String(item.id) === id);
  const next = { id: id || `test-${staffCatalogType}-${Date.now()}`, name, price, unit: $('staffCatalogUnit').value, active: $('staffCatalogActive').checked, sortOrder: existing?.sortOrder ?? collection.length + 1, updatedAt: new Date().toISOString() };
  if (staffCatalogType === 'services') {
    next.category = category;
    next.capacityPoints = capacityPoints;
    next.capacityBasis = capacityBasis;
    next.capacityStep = capacityBasis === 'job' ? 1 : capacityStep;
  }
  if (!IPRINT_TEST_MODE) {
    const result = await saveStaffCatalogRemote(staffCatalogType, { ...next, id, updatedAt: existing?.updatedAt || '' });
    if (!result.success) {
      setStaffCatalogNotice(result.error || 'บันทึกรายการไม่สำเร็จ', 'warn');
      return;
    }
    if (existing) Object.assign(existing, result.item);
    else collection.push(result.item);
    await syncCatalogDependents();
    setStaffCatalogNotice('บันทึกข้อมูลใน Notion แล้ว', 'ok');
    showStaffCatalogList();
    return;
  }
  if (existing) Object.assign(existing, next);
  else collection.push(next);
  persistTestCatalog();
  syncCatalogDependents();
  renderStaffCatalog();
  staffCatalogResetForm();
  setStaffCatalogNotice('บันทึก Mock catalog แล้ว ข้อมูลใน Notion ยังไม่ถูกเปลี่ยน', 'ok');
  showStaffCatalogList();
}

async function saveStaffCatalogTableRow(row, item) {
  const name = row.querySelector('[data-table-field="name"]')?.value.trim() || '';
  const category = row.querySelector('[data-table-field="category"]')?.value.trim() || '';
  const price = Number(row.querySelector('[data-table-field="price"]')?.value);
  const unitValue = row.querySelector('[data-table-field="unit"]')?.value || '';
  const sortOrder = Number(row.querySelector('[data-table-field="sortOrder"]')?.value);
  const active = row.querySelector('[data-table-field="active"]')?.checked === true;
  if (!name || !Number.isFinite(price) || price < 0 || !['sheet', 'piece', 'job'].includes(unitValue) || !Number.isFinite(sortOrder) || (staffCatalogType === 'services' && !category)) {
    setStaffCatalogNotice('กรุณาตรวจสอบชื่อ หมวดหมู่ ราคา หน่วย และลำดับให้ถูกต้อง', 'warn');
    return;
  }
  const next = { ...item, name, price, unit: unitValue, sortOrder, active };
  if (staffCatalogType === 'services') next.category = category;
  if (!IPRINT_TEST_MODE) {
    const result = await saveStaffCatalogRemote(staffCatalogType, next);
    if (!result.success) return setStaffCatalogNotice(result.error || 'บันทึกแถวไม่สำเร็จ', 'warn');
    Object.assign(item, result.item);
    await syncCatalogDependents();
    setStaffCatalogNotice(`บันทึก “${item.name}” ใน Notion แล้ว`, 'ok');
  } else {
    Object.assign(item, next, { updatedAt: new Date().toISOString() });
    persistTestCatalog();
    await syncCatalogDependents();
    setStaffCatalogNotice(`บันทึก “${item.name}” ใน Mock data แล้ว`, 'ok');
  }
  renderStaffCatalog();
}

async function handleStaffCatalogAction(event) {
  const row = event.target.closest('[data-catalog-id]');
  if (!row || activeAccessRole !== 'staff') return;
  const collection = staffCatalogItems();
  const index = collection.findIndex(item => String(item.id) === row.dataset.catalogId);
  if (index < 0) return;
  if (event.target.closest('[data-catalog-action="save-row"]')) {
    await saveStaffCatalogTableRow(row, collection[index]);
    return;
  }
  if (event.target.closest('[data-catalog-action="toggle"]')) {
    if (!IPRINT_TEST_MODE) {
      const result = await saveStaffCatalogRemote(staffCatalogType, { ...collection[index], active: collection[index].active === false });
      if (!result.success) return setStaffCatalogNotice(result.error || 'เปลี่ยนสถานะไม่สำเร็จ', 'warn');
      Object.assign(collection[index], result.item);
      await syncCatalogDependents();
      renderStaffCatalog();
      setStaffCatalogNotice(`${collection[index].active ? 'เปิด' : 'ปิด'}ใช้งานรายการแล้ว`, 'ok');
      return;
    }
    collection[index].active = collection[index].active === false;
    collection[index].updatedAt = new Date().toISOString();
    persistTestCatalog();
    syncCatalogDependents();
    renderStaffCatalog();
    setStaffCatalogNotice(`${collection[index].active ? 'เปิด' : 'ปิด'}ใช้งานรายการแล้ว`, 'ok');
    return;
  }
  if (staffCatalogView === 'cards' || event.target.closest('[data-catalog-action="edit"]')) showStaffCatalogEditor(collection[index]);
}

async function deleteStaffCatalogItem() {
  const id = $('staffCatalogEditId').value;
  const collection = staffCatalogItems();
  const index = collection.findIndex(item => String(item.id) === id);
  if (index < 0) return;
  if (!IPRINT_TEST_MODE) {
    const result = await saveStaffCatalogRemote(staffCatalogType, { ...collection[index], active: false });
    if (!result.success) return setStaffCatalogNotice(result.error || 'ปิดรายการไม่สำเร็จ', 'warn');
    Object.assign(collection[index], result.item);
    setStaffCatalogNotice('ปิดใช้งานรายการแล้ว โดยยังเก็บประวัติไว้', 'ok');
    showStaffCatalogList();
    return;
  }
  collection.splice(index, 1);
  persistTestCatalog();
  syncCatalogDependents();
  setStaffCatalogNotice('ลบรายการออกจาก Mock catalog แล้ว', 'ok');
  showStaffCatalogList();
}

function selectStaffCatalogTab(event) {
  const button = event.target.closest('[data-catalog-tab]');
  if (!button) return;
  staffCatalogType = button.dataset.catalogTab;
  document.querySelectorAll('[data-catalog-tab]').forEach(tab => {
    const selected = tab === button;
    tab.classList.toggle('is-selected', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  staffCatalogResetForm();
  showStaffCatalogList();
}

function selectStaffCatalogView(event) {
  const button = event.target.closest('[data-catalog-view]');
  if (!button) return;
  staffCatalogView = button.dataset.catalogView === 'table' ? 'table' : 'cards';
  document.querySelectorAll('[data-catalog-view]').forEach(option => {
    const selected = option === button;
    option.classList.toggle('is-selected', selected);
    option.setAttribute('aria-pressed', String(selected));
  });
  renderStaffCatalog();
}

async function openStaffCatalog() {
  if (activeAccessRole !== 'staff') return;
  if (!IPRINT_TEST_MODE) {
    try {
      staffCatalogCollections.materials = await fetchStaffCatalogRemote('materials');
      staffCatalogCollections.services = await fetchStaffCatalogRemote('services');
    } catch (error) {
      setStaffCatalogNotice(error.message || String(error), 'warn');
    }
  }
  showStaffCatalogList();
  setStaffCatalogNotice(IPRINT_TEST_MODE ? 'Test Mode • เปลี่ยนเฉพาะ Mock data ในเบราว์เซอร์' : 'Production • เชื่อมต่อ Staff Catalog แล้ว', 'ok');
  showAppView('staff-catalog');
}

function bindStaffCatalog() {
  $('openStaffCatalog')?.addEventListener('click', openStaffCatalog);
  $('addStaffCatalogItem')?.addEventListener('click', () => showStaffCatalogEditor());
  $('staffCatalogForm')?.addEventListener('submit', submitStaffCatalog);
  $('cancelStaffCatalogEdit')?.addEventListener('click', showStaffCatalogList);
  $('closeStaffCatalogEditor')?.addEventListener('click', showStaffCatalogList);
  $('deleteStaffCatalogItem')?.addEventListener('click', deleteStaffCatalogItem);
  $('staffCatalogList')?.addEventListener('click', handleStaffCatalogAction);
  $('staffCatalogViewToggle')?.addEventListener('click', selectStaffCatalogView);
  $('staffCapacityPoints')?.addEventListener('input', updateStaffCapacityPreview);
  $('staffCapacityBasis')?.addEventListener('change', updateStaffCapacityPreview);
  $('staffCapacityStep')?.addEventListener('input', updateStaffCapacityPreview);
  document.querySelector('.staff-catalog-tabs')?.addEventListener('click', selectStaffCatalogTab);
}
