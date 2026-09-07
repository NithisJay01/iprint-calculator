let cuttingDefaultSelectionPending = true;

function isPrintSideService(service) {
  const text = `${service?.category || ''} ${service?.name || ''}`;
  return /รูปแบบการพิมพ์/i.test(text) || (/พิม|พิพม์|print/i.test(text) && /หน้า|side/i.test(text));
}

function isLaminationService(service) {
  const text = `${service?.category || ''} ${service?.name || ''}`;
  return /เคลือบ|laminat|film|flim|hologram|holo|โฮโลแกรม|foil|ฟอยล์/i.test(text);
}

function isCuttingService(service) {
  const text = `${service?.category || ''} ${service?.name || ''}`;
  return /การตัด|ไดคัท|ไดคัต|ตัด\s*(?:50|100|ครึ่ง|เต็ม)|die.?cut|kiss.?cut|cutting/i.test(text);
}

function isDiecutService(service) {
  const text = `${service?.category || ''} ${service?.name || ''}`;
  return /ไดคัท|ไดคัต|die.?cut/i.test(text);
}

function isStickerQuizJob() {
  const jobType = typeof getSelectedJobType === 'function' ? getSelectedJobType() : '';
  return /สติกเกอร์|sticker/i.test(String(jobType || ''));
}

function isSinglePrintService(service) {
  return /หน้าเดียว|single/i.test(String(service?.name || ''));
}

function hasSelectedPrintService() {
  return services.some(service => selectedServiceIds[String(service.id)] && isPrintSideService(service));
}

function syncLayoutPreviewVisibility() {
  const ready = hasSelectedPrintService();
  const content = $('layoutPreviewContent');
  const zone = $('previewDropZone');
  const nextButton = $('openMaterialsServices');
  if (content) content.hidden = !ready;
  if (zone) zone.classList.toggle('is-awaiting-print-choice', !ready);
  if (nextButton) {
    nextButton.disabled = !ready;
    nextButton.setAttribute('aria-disabled', ready ? 'false' : 'true');
    nextButton.title = ready ? '' : 'กรุณาเลือกรูปแบบการพิมพ์ก่อน';
  }
}

function hasSelectedDiecutService() {
  return services.some(service => selectedServiceIds[String(service.id)] && isDiecutService(service));
}

function syncDiecutShapeAvailability() {
  const control = $('diecutShapeControl');
  if (!control) return;
  const enabled = hasSelectedDiecutService();
  control.hidden = !enabled;
  control.setAttribute('aria-hidden', enabled ? 'false' : 'true');
  if (typeof syncDiecutShapePreview === 'function') syncDiecutShapePreview();
}

function serviceGroupDefinition(service) {
  if (isPrintSideService(service)) return { key: 'print', title: 'รูปแบบการพิมพ์', exclusive: true, noneLabel: '' };
  if (isLaminationService(service)) return { key: 'lamination', title: 'การเคลือบ', exclusive: true, noneLabel: 'ไม่เคลือบ' };
  if (/DIY Solution/i.test(String(service?.category || ''))) return { key: 'other-DIY-Solution', title: 'บริการอื่นๆ', exclusive: false, noneLabel: '' };
  if (isCuttingService(service)) return { key: 'cutting', title: 'การตัด', exclusive: true, noneLabel: 'ไม่ตัด' };
  const title = String(service?.category || 'บริการเพิ่มเติม');
  return { key: `other-${title}`, title, exclusive: false, noneLabel: '' };
}

function serviceGroupPriority(group) {
  if (group.key === 'print') return 0;
  if (group.key === 'lamination') return 1;
  if (group.key === 'cutting') return 2;
  return 3;
}

function normalizeExclusiveSelections(grouped) {
  grouped.forEach(group => {
    if (!group.definition.exclusive) return;
    const selected = group.services.filter(service => selectedServiceIds[String(service.id)]);
    selected.slice(1).forEach(service => delete selectedServiceIds[String(service.id)]);
  });
}

function renderServiceRow(service, group, scope = 'main') {
  const row = document.createElement(service.pricePending ? 'div' : 'label');
  row.className = 'service-row';
  if (service.pricePending) row.classList.add('service-row-pending-price');
  const control = document.createElement('input');
  control.type = group.definition.exclusive ? 'radio' : 'checkbox';
  if (service.pricePending) control.setAttribute('aria-label', service.baseName || service.name);
  if (group.definition.exclusive) control.name = `service-${scope}-${group.definition.key}`;
  control.checked = Boolean(selectedServiceIds[String(service.id)]);
  row.classList.toggle('is-selected', control.checked);
  let requestInput = null;
  control.addEventListener('change', () => {
    const hadDiecut = hasSelectedDiecutService();
    const hadDoubleSided = typeof getSelectedPrintSide === 'function' && getSelectedPrintSide() === 'double';
    if (group.definition.exclusive && control.checked) {
      group.services.forEach(candidate => delete selectedServiceIds[String(candidate.id)]);
      selectedServiceIds[String(service.id)] = true;
    } else if (control.checked) {
      selectedServiceIds[String(service.id)] = true;
    } else {
      delete selectedServiceIds[String(service.id)];
    }
    saveState();
    renderServices();
    calculate();
    if (service.pricePending && control.checked) requestAnimationFrame(() => requestInput?.focus());
    syncDiecutShapeAvailability();
    const hasDiecut = hasSelectedDiecutService();
    const hasDoubleSided = typeof getSelectedPrintSide === 'function' && getSelectedPrintSide() === 'double';
    const quickTarget = document.querySelector('[data-app-view="quickBrief"].is-active') ? $('quickServicesContainer') : null;
    if (!hadDiecut && hasDiecut) announceUiChange('เลือกบริการไดคัทแล้ว', quickTarget || $('diecutShapeControl'), { scroll: !quickTarget });
    else if (hadDiecut && !hasDiecut) announceUiChange('ซ่อนส่วนอัปโหลด Shape ไดคัทแล้ว');
    if (!hadDoubleSided && hasDoubleSided) announceUiChange('เลือกรูปแบบพิมพ์หน้า–หลังแล้ว', quickTarget || $('artworkSideControls'), { scroll: !quickTarget });
    else if (hadDoubleSided && !hasDoubleSided) announceUiChange('เปลี่ยนกลับเป็น Artwork ด้านเดียวแล้ว');
  });

  const main = document.createElement('div');
  main.className = 'service-main';
  const name = document.createElement('div');
  name.className = 'service-name';
  name.textContent = service.baseName || service.name;
  const meta = document.createElement('div');
  meta.className = 'service-meta';
  meta.textContent = service.material || '';
  meta.hidden = !meta.textContent;
  main.append(name, meta);
  if (service.pricePending) {
    requestInput = document.createElement('input');
    requestInput.type = 'text';
    requestInput.className = 'service-request-input';
    requestInput.dataset.customServiceRequest = scope;
    requestInput.placeholder = 'กรุณาระบุรายละเอียด';
    requestInput.value = customServiceRequest;
    requestInput.disabled = !control.checked;
    requestInput.maxLength = 300;
    requestInput.addEventListener('click', event => event.stopPropagation());
    requestInput.addEventListener('keydown', event => event.stopPropagation());
    requestInput.addEventListener('input', () => {
      requestInput.setCustomValidity('');
      customServiceRequest = requestInput.value;
      service.requestText = customServiceRequest;
      service.name = customServiceRequest.trim() ? `${service.baseName}: ${customServiceRequest.trim()}` : service.baseName;
      document.querySelectorAll('[data-custom-service-request]').forEach(input => {
        if (input !== requestInput) input.value = customServiceRequest;
      });
      saveState();
      calculate();
    });
  }
  const priceBlock = document.createElement('div');
  priceBlock.className = 'service-price-block';
  const price = document.createElement('div');
  price.className = 'service-price';
  price.textContent = service.pricePending ? '?' : `฿${money(service.price)}`;
  const priceUnit = document.createElement('small');
  priceUnit.className = 'service-price-unit';
  priceUnit.textContent = service.pricePending ? 'รอประเมิน' : `/ต่อ${unit(service.unit)}`;
  priceBlock.append(price, priceUnit);
  row.append(control, main, priceBlock);
  if (requestInput) row.appendChild(requestInput);
  return row;
}

function renderNoneServiceRow(group, scope = 'main') {
  const row = document.createElement('label');
  row.className = 'service-row service-row-none';
  const control = document.createElement('input');
  control.type = 'radio';
  control.name = `service-${scope}-${group.definition.key}`;
  control.checked = !group.services.some(service => selectedServiceIds[String(service.id)]);
  row.classList.toggle('is-selected', control.checked);
  control.addEventListener('change', () => {
    if (!control.checked) return;
    const hadDiecut = hasSelectedDiecutService();
    const hadDoubleSided = typeof getSelectedPrintSide === 'function' && getSelectedPrintSide() === 'double';
    group.services.forEach(service => delete selectedServiceIds[String(service.id)]);
    saveState();
    renderServices();
    calculate();
    syncDiecutShapeAvailability();
    if (hadDiecut) announceUiChange('ซ่อนส่วนอัปโหลด Shape ไดคัทแล้ว');
    if (hadDoubleSided) announceUiChange('เปลี่ยนกลับเป็น Artwork ด้านเดียวแล้ว');
  });
  const main = document.createElement('div');
  main.className = 'service-main';
  const name = document.createElement('div');
  name.className = 'service-name';
  name.textContent = group.definition.noneLabel;
  const meta = document.createElement('div');
  meta.className = 'service-meta';
  meta.textContent = 'ไม่คิดค่าบริการเพิ่มเติม';
  main.append(name, meta);
  const price = document.createElement('div');
  price.className = 'service-price';
  price.textContent = '—';
  const priceBlock = document.createElement('div');
  priceBlock.className = 'service-price-block';
  priceBlock.append(price);
  row.append(control, main, priceBlock);
  return row;
}

function createServiceGroup(groupData, scope = 'main') {
  const group = document.createElement('div');
  group.className = `service-group service-group-${groupData.definition.key.replace(/[^a-z0-9-]/gi, '-')}`;
  group.dataset.serviceGroup = groupData.definition.key;
  const title = document.createElement('div');
  title.className = 'service-group-title';
  title.textContent = groupData.definition.title;
  group.appendChild(title);
  const stickerSingleOnly = scope === 'main' && groupData.definition.key === 'print' && isStickerQuizJob();
  if (stickerSingleOnly) {
    group.classList.add('is-sticker-single-only');
    const note = document.createElement('div');
    note.className = 'service-group-lock-note';
    note.textContent = 'งานสติกเกอร์ใช้รูปแบบพิมพ์หน้าเดียว';
    group.appendChild(note);
  }
  if (groupData.definition.noneLabel) group.appendChild(renderNoneServiceRow(groupData, scope));
  const visibleChoices = stickerSingleOnly ? groupData.services.filter(isSinglePrintService) : groupData.services;
  visibleChoices.forEach(service => group.appendChild(renderServiceRow(service, groupData, scope)));
  return group;
}

function createCuttingDropdown(groupData) {
  const field = document.createElement('div');
  field.className = 'layout-cutting-dropdown';
  const label = document.createElement('label');
  label.htmlFor = 'costCuttingSelect';
  label.textContent = 'การตัดและติดเสริมวัสดุ';
  const select = document.createElement('select');
  select.id = 'costCuttingSelect';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = `${groupData.definition.noneLabel || 'ไม่ตัด'} • ไม่คิดค่าบริการเพิ่มเติม`;
  select.appendChild(none);
  groupData.services.forEach(service => {
    const option = document.createElement('option');
    option.value = String(service.id);
    option.textContent = [service.name, service.material, `฿${money(service.price)} /ต่อ${unit(service.unit)}`].filter(Boolean).join(' • ');
    select.appendChild(option);
  });
  const selected = groupData.services.find(service => selectedServiceIds[String(service.id)]);
  select.value = selected ? String(selected.id) : '';
  select.addEventListener('change', () => {
    const hadDiecut = hasSelectedDiecutService();
    groupData.services.forEach(service => delete selectedServiceIds[String(service.id)]);
    if (select.value) selectedServiceIds[select.value] = true;
    saveState();
    renderServices();
    calculate();
    syncDiecutShapeAvailability();
    const hasDiecut = hasSelectedDiecutService();
    if (!hadDiecut && hasDiecut) announceUiChange('เลือกบริการไดคัทแล้ว', $('diecutShapeControl'));
    else if (hadDiecut && !hasDiecut) announceUiChange('ซ่อนส่วนอัปโหลด Shape ไดคัทแล้ว');
  });
  field.append(label, select);
  return field;
}

function renderServices() {
  const box = $('servicesContainer');
  const printBox = $('layoutPrintServices');
  const cuttingBox = $('costCuttingServices');
  const quickBox = $('quickServicesContainer');
  box.innerHTML = '';
  if (printBox) printBox.innerHTML = '';
  if (cuttingBox) cuttingBox.innerHTML = '';
  if (quickBox) quickBox.innerHTML = '';
  if (!services.some(service => String(service.id) === 'ui-custom-request')) {
    services.push({ id:'ui-custom-request', category:'DIY Solution', baseName:'ต้องการรีเควส', name:'ต้องการรีเควส', material:'(กรุณาระบุ)', price:0, pricePending:true, unit:'job', sortOrder:99, active:true, virtual:true });
  }
  const customRequestService = services.find(service => String(service.id) === 'ui-custom-request');
  if (customRequestService) {
    customRequestService.requestText = customServiceRequest;
    customRequestService.name = customServiceRequest.trim() ? `${customRequestService.baseName}: ${customServiceRequest.trim()}` : customRequestService.baseName;
  }
  if (!services.length) {
    box.innerHTML = '<div class="ms-status">ไม่พบบริการที่ Active</div>';
    if (quickBox) quickBox.innerHTML = '<div class="ms-status">ไม่พบบริการที่ Active</div>';
    syncLayoutPreviewVisibility();
    return;
  }

  const groupMap = new Map();
  const visibleServices = services.filter(service => !/^custom$/i.test(String(service.name || '').trim()) && !/DIY\s*ส่วนเสริม/i.test(String(service.name || '')));
  visibleServices.forEach(service => {
    const definition = serviceGroupDefinition(service);
    if (!groupMap.has(definition.key)) groupMap.set(definition.key, { definition, services: [] });
    groupMap.get(definition.key).services.push(service);
  });
  const groups = [...groupMap.values()].sort((a, b) => {
    const priority = serviceGroupPriority(a.definition) - serviceGroupPriority(b.definition);
    return priority || a.definition.title.localeCompare(b.definition.title, 'th');
  });
  normalizeExclusiveSelections(groups);
  const lockedMode = typeof getLockedCuttingMode === 'function' ? getLockedCuttingMode() : '';
  if (lockedMode && cuttingDefaultSelectionPending) {
    const cutting = groups.find(group => group.definition.key === 'cutting');
    if (cutting) {
      cutting.services.forEach(service => delete selectedServiceIds[String(service.id)]);
      const exact = cutting.services.find(service => lockedMode === '50'
        ? /50|ครึ่ง|kiss|mimaki/i.test(`${service.name || ''} ${service.material || ''}`)
        : /100|เต็ม|flatblade/i.test(`${service.name || ''} ${service.material || ''}`));
      const selected = exact || cutting.services.find(isDiecutService);
      if (selected) selectedServiceIds[String(selected.id)] = true;
    }
    cuttingDefaultSelectionPending = false;
  }

  groups.forEach(groupData => {
    const target = groupData.definition.key === 'print' && printBox
      ? printBox
      : groupData.definition.key === 'cutting' && cuttingBox
        ? cuttingBox
        : box;
    target.appendChild(groupData.definition.key === 'cutting' && target === cuttingBox
      ? createCuttingDropdown(groupData)
      : createServiceGroup(groupData, 'main'));
    if (quickBox) quickBox.appendChild(createServiceGroup(groupData, 'quick'));
  });
  $('serviceStatus').textContent = `${dataSourceLabel()} • ${services.length} บริการ`;
  syncLayoutPreviewVisibility();
  if (typeof syncArtworkSideControls === 'function') syncArtworkSideControls();
  syncDiecutShapeAvailability();
}

async function syncServices() {
  try {
    const data = await getJSON(API.services);
    services = (data.services || []).filter(service => service && service.name && service.active !== false)
      .sort((a, b) => (Number(a.sortOrder) || 9999) - (Number(b.sortOrder) || 9999));
    if (!services.some(service => /ไดคัทตัดมุม|rounded.?corner/i.test(String(service.name || '')))) {
      services.push({
        id: 'ui-diy-rounded-corner',
        category: 'DIY Solution',
        name: 'ไดคัทตัดมุม',
        material: 'มุมมน • ค่าเริ่มต้นไม่เลือก = มุมฉาก 0°',
        price: 0,
        unit: 'piece',
        sortOrder: 95,
        active: true,
        virtual: true
      });
    }
    cachePut(CACHE.services, services);
    renderServices();
  } catch (error) {
    const cached = cacheGet(CACHE.services);
    if (cached) {
      services = cached.data;
      renderServices();
      setCachedStatus('serviceStatus', 'Cache Services', cached.timestamp);
    } else {
      services = [];
      renderServices();
      setStatus('serviceStatus', 'เชื่อมต่อ Services ไม่สำเร็จ', 'warn');
    }
    console.error('GET /services', error);
  }
}

function serviceCost(sheetCount, pieceCount) {
  let total = 0;
  services.filter(service => selectedServiceIds[String(service.id)]).forEach(service => {
    const price = Number(service.price) || 0;
    const serviceUnit = normalizeUnit(service.unit);
    total += serviceUnit === 'sheet' ? price * sheetCount : serviceUnit === 'piece' ? price * pieceCount : price;
  });
  return total;
}

window.serviceGroupDefinition = serviceGroupDefinition;
window.hasSelectedPrintService = hasSelectedPrintService;
window.syncLayoutPreviewVisibility = syncLayoutPreviewVisibility;
window.hasSelectedDiecutService = hasSelectedDiecutService;
window.syncDiecutShapeAvailability = syncDiecutShapeAvailability;
window.resetCuttingDefaultSelection = () => { cuttingDefaultSelectionPending = true; };
window.isPendingPriceService = service => Boolean(service?.pricePending);
