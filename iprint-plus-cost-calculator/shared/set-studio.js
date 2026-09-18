// Pure helpers for the set studio (pricing page). No DOM access, so they can be unit tested in Node.

export const UNIT_OPTIONS = Object.freeze([
  { value: 'sheet', label: 'ต่อแผ่น' },
  { value: 'piece', label: 'ต่อชิ้น' },
  { value: 'job', label: 'ต่องาน' }
]);
export const CAPACITY_BASIS_OPTIONS = Object.freeze([
  { value: 'job', label: 'ต่องาน' },
  { value: 'sheet', label: 'ต่อแผ่น' },
  { value: 'piece', label: 'ต่อชิ้น' }
]);
export const DEFAULT_SERVICE_CATEGORY = 'บริการเพิ่มเติม';

const unitLabel = value => UNIT_OPTIONS.find(unit => unit.value === value)?.label.replace('ต่อ', '') || 'งาน';
export const formatUnit = value => unitLabel(String(value || '').toLowerCase());

// Same rules as the staff catalog form, so a service created here gets the role the catalog would infer.
export function inferServiceRole({ category = '', name = '' } = {}) {
  const text = `${category} ${name}`;
  if (/หน้าเดียว|single/i.test(text)) return 'PRINT_SINGLE';
  if (/หน้า\s*[-–—/]?\s*หลัง|2\s*หน้า|สองหน้า|double/i.test(text)) return 'PRINT_DOUBLE';
  if (/ตัดมุม|rounded.?corner/i.test(text)) return 'ROUNDED_CORNER';
  if (/50|ครึ่ง|kiss|mimaki/i.test(text) && /ไดคัท|ไดคัต|die.?cut|cutting|ตัด/i.test(text)) return 'CUTTING_50';
  if (/100|เต็ม|flatblade/i.test(text) && /ไดคัท|ไดคัต|die.?cut|cutting|ตัด/i.test(text)) return 'CUTTING_100';
  if (/ไดคัท|ไดคัต|die.?cut|cutting/i.test(text)) return 'CUTTING';
  if (/เคลือบ|laminat|film|hologram|foil/i.test(text)) return 'LAMINATION';
  return 'OTHER';
}

// Validates the quick "create item" form and builds the body for POST /staff/materials|services.
export function newCatalogItemPayload(type, input = {}) {
  const errors = [];
  const name = String(input.name ?? '').trim();
  const price = Number(input.price);
  const unit = String(input.unit ?? '').trim();
  if (!['material', 'service'].includes(type)) errors.push('ประเภทรายการไม่ถูกต้อง');
  if (!name) errors.push('กรุณาระบุชื่อ');
  else if (name.length > 120) errors.push('ชื่อยาวเกิน 120 ตัวอักษร');
  if (input.price === '' || input.price == null || !Number.isFinite(price) || price < 0) errors.push('กรุณาระบุราคาที่ไม่ติดลบ');
  if (!UNIT_OPTIONS.some(option => option.value === unit)) errors.push('กรุณาเลือกหน่วย');
  const value = { name, price, unit, active: true };
  if (type === 'service') {
    const category = String(input.category ?? '').trim() || DEFAULT_SERVICE_CATEGORY;
    const capacityPoints = input.capacityPoints === '' || input.capacityPoints == null ? 0 : Number(input.capacityPoints);
    const capacityBasis = String(input.capacityBasis || 'job');
    if (!Number.isFinite(capacityPoints) || capacityPoints < 0) errors.push('แต้มกำลังผลิตต้องไม่ติดลบ');
    if (!CAPACITY_BASIS_OPTIONS.some(option => option.value === capacityBasis)) errors.push('หน่วยกำลังผลิตไม่ถูกต้อง');
    Object.assign(value, {
      category,
      serviceRole: inferServiceRole({ category, name }),
      capacityPoints,
      capacityBasis,
      capacityStep: 1
    });
  }
  return { success: errors.length === 0, errors, value };
}

export const catalogListFor = (catalog, source) => (source === 'material' ? catalog.materials : catalog.services);

export function filterCatalogItems(items, query) {
  const term = String(query || '').trim().toLowerCase();
  return term ? items.filter(item => String(item.name || '').toLowerCase().includes(term)) : items;
}

// Where a catalog item is used across all products: one entry per option group that lists it.
export function itemUsage(settings, itemId) {
  const usage = [];
  for (const product of settings?.products || []) {
    for (const group of product.optionGroups || []) {
      if (!(group.itemIds || []).includes(itemId)) continue;
      usage.push({
        productId: product.id,
        productName: product.name,
        groupId: group.id,
        groupName: group.name,
        packageNames: (product.packages || []).filter(pack => (pack.optionIds || []).includes(itemId)).map(pack => pack.name)
      });
    }
  }
  return usage;
}

export function describeUsage(usage) {
  if (!usage.length) return 'ยังไม่ถูกใช้ในหมวดหรือเซตใด';
  const packages = new Set(usage.flatMap(entry => entry.packageNames.map(name => `${entry.productId}/${name}`)));
  const places = usage.slice(0, 3).map(entry => `${entry.productName} › ${entry.groupName}`).join(', ');
  const more = usage.length > 3 ? ` และอีก ${usage.length - 3} หมวด` : '';
  return `ใช้ใน ${usage.length} หมวด (${places}${more}) และ ${packages.size} เซต`;
}

// Adds/removes an item in one option group. A newly added item is switched on in `selectInPackageId`;
// removing it also switches it off in every set unless another group of the same product still lists it.
export function setGroupItem(product, groupIndex, itemId, included, { selectInPackageId = '' } = {}) {
  const group = product.optionGroups[groupIndex];
  if (!group) return false;
  group.itemIds = Array.isArray(group.itemIds) ? group.itemIds : [];
  if (included) {
    if (!group.itemIds.includes(itemId)) group.itemIds.push(itemId);
    const pack = product.packages.find(item => item.id === selectInPackageId);
    if (pack && !pack.optionIds.includes(itemId)) pack.optionIds.push(itemId);
    return true;
  }
  group.itemIds = group.itemIds.filter(id => id !== itemId);
  const stillListed = product.optionGroups.some(other => (other.itemIds || []).includes(itemId));
  if (!stillListed) product.packages.forEach(pack => { pack.optionIds = (pack.optionIds || []).filter(id => id !== itemId); });
  return true;
}

// Used after an item is deactivated in the catalog: drop every reference to it.
export function removeItemEverywhere(settings, itemId) {
  for (const product of settings?.products || []) {
    for (const group of product.optionGroups || []) group.itemIds = (group.itemIds || []).filter(id => id !== itemId);
    for (const pack of product.packages || []) pack.optionIds = (pack.optionIds || []).filter(id => id !== itemId);
    for (const key of ['includedServiceIds', 'materialIds']) if (Array.isArray(product[key])) product[key] = product[key].filter(id => id !== itemId);
  }
}

export function groupSummary(group, itemsById, pack) {
  if (group.enabled === false) return { tone: 'off', text: 'ปิดอยู่ · ลูกค้าจะไม่เห็นหมวดนี้' };
  const items = (group.itemIds || []).map(id => itemsById.get(id)).filter(Boolean);
  if (!items.length) return { tone: 'empty', text: 'ยังไม่มีรายการ · กด “เพิ่ม/แก้ไขรายการ” เพื่อเลือก' };
  const selected = items.filter(item => (pack?.optionIds || []).includes(item.id)).length;
  const parts = [`${items.length} รายการ`, `ใช้ในเซตนี้ ${selected}`, group.selectionMode === 'multiple' ? 'เลือกได้หลายรายการ' : 'เลือกได้ 1 รายการ'];
  if (group.required) parts.push('บังคับเลือก');
  return { tone: selected ? 'ok' : 'warn', text: parts.join(' · ') };
}

// state: 'unsaved' (edits not stored anywhere), 'draft' (stored as draft, not published), 'published'.
export function saveStateLabel(state, savedAt = '', timeZone = 'Asia/Bangkok') {
  if (state === 'unsaved') return 'ยังไม่ได้บันทึก';
  if (state === 'draft') {
    const time = savedAt && Number.isFinite(Date.parse(savedAt))
      ? new Date(savedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone })
      : '';
    return time ? `ฉบับร่างบันทึกแล้ว ${time}` : 'ฉบับร่างบันทึกแล้ว';
  }
  return 'เผยแพร่แล้ว';
}
