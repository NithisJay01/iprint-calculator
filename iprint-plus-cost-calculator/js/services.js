function isPrintSideService(service) {
  return /พิม|พิพม์|print/i.test(String(service?.name || '')) && /หน้า|side/i.test(String(service?.name || ''));
}

function isLaminationService(service) {
  const text = `${service?.category || ''} ${service?.name || ''}`;
  return /เคลือบ|laminat|film|flim|hologram|holo|โฮโลแกรม|foil|ฟอยล์/i.test(text);
}

function isCuttingService(service) {
  const text = `${service?.category || ''} ${service?.name || ''}`;
  return /ไดคัท|ไดคัต|ตัด\s*(?:50|100|ครึ่ง|เต็ม)|die.?cut|kiss.?cut|cutting/i.test(text);
}

function serviceGroupDefinition(service) {
  if (isPrintSideService(service)) return { key: 'print', title: 'รูปแบบการพิมพ์', exclusive: true, noneLabel: '' };
  if (isLaminationService(service)) return { key: 'lamination', title: 'การเคลือบ', exclusive: true, noneLabel: 'ไม่เคลือบ' };
  if (/DIY Solution/i.test(String(service?.category || ''))) return { key: 'other-DIY-Solution', title: 'DIY Solution', exclusive: false, noneLabel: '' };
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

function renderServiceRow(service, group) {
  const row = document.createElement('label');
  row.className = 'service-row';
  const control = document.createElement('input');
  control.type = group.definition.exclusive ? 'radio' : 'checkbox';
  if (group.definition.exclusive) control.name = `service-${group.definition.key}`;
  control.checked = Boolean(selectedServiceIds[String(service.id)]);
  row.classList.toggle('is-selected', control.checked);
  control.addEventListener('change', () => {
    if (group.definition.exclusive && control.checked) {
      group.services.forEach(candidate => delete selectedServiceIds[String(candidate.id)]);
      selectedServiceIds[String(service.id)] = true;
    } else if (control.checked) {
      selectedServiceIds[String(service.id)] = true;
    } else {
      delete selectedServiceIds[String(service.id)];
    }
    saveState();
    if (group.definition.exclusive) renderServices();
    else row.classList.toggle('is-selected', control.checked);
    calculate();
  });

  const main = document.createElement('div');
  main.className = 'service-main';
  const name = document.createElement('div');
  name.className = 'service-name';
  name.textContent = service.name;
  const meta = document.createElement('div');
  meta.className = 'service-meta';
  meta.textContent = service.material || '';
  meta.hidden = !meta.textContent;
  main.append(name, meta);
  const priceBlock = document.createElement('div');
  priceBlock.className = 'service-price-block';
  const price = document.createElement('div');
  price.className = 'service-price';
  price.textContent = `฿${money(service.price)}`;
  const priceUnit = document.createElement('small');
  priceUnit.className = 'service-price-unit';
  priceUnit.textContent = `/ต่อ${unit(service.unit)}`;
  priceBlock.append(price, priceUnit);
  row.append(control, main, priceBlock);
  return row;
}

function renderNoneServiceRow(group) {
  const row = document.createElement('label');
  row.className = 'service-row service-row-none';
  const control = document.createElement('input');
  control.type = 'radio';
  control.name = `service-${group.definition.key}`;
  control.checked = !group.services.some(service => selectedServiceIds[String(service.id)]);
  row.classList.toggle('is-selected', control.checked);
  control.addEventListener('change', () => {
    if (!control.checked) return;
    group.services.forEach(service => delete selectedServiceIds[String(service.id)]);
    saveState();
    renderServices();
    calculate();
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

function renderServices() {
  const box = $('servicesContainer');
  box.innerHTML = '';
  if (!services.length) {
    box.innerHTML = '<div class="ms-status">ไม่พบบริการที่ Active</div>';
    return;
  }

  const groupMap = new Map();
  services.forEach(service => {
    const definition = serviceGroupDefinition(service);
    if (!groupMap.has(definition.key)) groupMap.set(definition.key, { definition, services: [] });
    groupMap.get(definition.key).services.push(service);
  });
  const groups = [...groupMap.values()].sort((a, b) => {
    const priority = serviceGroupPriority(a.definition) - serviceGroupPriority(b.definition);
    return priority || a.definition.title.localeCompare(b.definition.title, 'th');
  });
  normalizeExclusiveSelections(groups);

  groups.forEach(groupData => {
    const group = document.createElement('div');
    group.className = `service-group service-group-${groupData.definition.key.replace(/[^a-z0-9-]/gi, '-')}`;
    group.dataset.serviceGroup = groupData.definition.key;
    const title = document.createElement('div');
    title.className = 'service-group-title';
    title.textContent = groupData.definition.title;
    group.appendChild(title);
    if (groupData.definition.noneLabel) group.appendChild(renderNoneServiceRow(groupData));
    groupData.services.forEach(service => group.appendChild(renderServiceRow(service, groupData)));
    box.appendChild(group);
  });
  $('serviceStatus').textContent = `${dataSourceLabel()} • ${services.length} บริการ`;
  if (typeof syncArtworkSideControls === 'function') syncArtworkSideControls();
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
