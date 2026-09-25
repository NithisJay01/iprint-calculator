import { includedIdsFor } from '../shared/product-pricing.js';
import { calculateBusinessCardQuote } from './logic.js';

// Business card specific rules shared by the order page (configure one item) and the cart (list of items).

export const BUSINESS_CARD_ID = 'business-card';
export const PRESET = Object.freeze({ id: '13x19', name: '13×19 กระดาษมาตรฐาน', usableW: 31.02, usableH: 47.26 });

// Sets shown when the store has not configured its own packages.
export const DEFAULT_SETS = Object.freeze([
  { id: 'essential', name: 'Essential', tagline: 'เรียบง่าย แต่ดูเป็นมืออาชีพ', quantity: 100, price: 0, bullets: ['กระดาษอาร์ตด้าน 300 แกรม', 'พิมพ์ 4 สี', 'ขนาดมาตรฐานยอดนิยม'] },
  { id: 'corporate', name: 'Corporate', tagline: 'น่าเชื่อถือ เหมาะกับองค์กร', quantity: 500, price: 0, bullets: ['กระดาษอาร์ตด้าน 300 แกรม', 'พิมพ์ 4 สี 2 ด้าน', 'เคลือบด้าน'] },
  { id: 'signature', name: 'Signature', tagline: 'สร้างความต่างตั้งแต่แรกสัมผัส', quantity: 1000, price: 0, bullets: ['กระดาษพรีเมียม', 'พิมพ์ 4 สี 2 ด้าน', 'เคลือบเงา'] }
]);

export const isPrintService = service => ['PRINT_SINGLE', 'PRINT_DOUBLE'].includes(String(service.serviceRole || '').toUpperCase()) || /พิมพ์.*หน้า|print/i.test(service.name || '');
export const isCoatService = service => /เคลือบ|laminat/i.test(`${service.name} ${service.category || ''}`);

export const findProduct = settings => settings?.products?.find(product => product.id === BUSINESS_CARD_ID) || null;

export function resolveSets(product) {
  return product?.mode === 'packages'
    ? product.packages.map(pack => ({ ...DEFAULT_SETS.find(set => set.id === pack.id), ...pack }))
    : [...DEFAULT_SETS];
}

export const allowedMaterials = (product, catalog) => (product?.materialIds?.length
  ? catalog.materials.filter(material => product.materialIds.includes(material.id))
  : catalog.materials);

export const quantityChoices = (product, pack) => (product?.mode === 'packages' ? [pack.quantity] : [pack.quantity, pack.quantity * 2, pack.quantity * 4]);

// Text shown under the set name: the description written in the set studio, else the built-in tagline.
export const setDescription = pack => String(pack?.description || '').trim() || String(pack?.tagline || '').trim();

// The "what is in this set" list. The lines written in the studio win; sets that have none keep the built-in
// lines of the three original sets, and any other set lists what it really contains.
export function setBullets({ product, pack, catalog }) {
  if (Array.isArray(pack?.bullets)) return pack.bullets.map(line => String(line).trim()).filter(Boolean);
  const builtIn = DEFAULT_SETS.find(set => set.id === pack?.id)?.bullets;
  if (builtIn) return [...builtIn];
  const start = defaultSelection({ product, catalog, pack });
  return [`${Number(pack?.quantity || 0).toLocaleString('th-TH')} ใบ`, start.material?.name, ...start.services.map(service => service.name)].filter(Boolean);
}

// The option groups the customer sees for a set, in the order set in the studio: each one has a name, one or
// several choices ("single" / "multiple"), may be required, and lists only the options chosen for THIS set.
// A material is always chosen exactly one at a time (the price is calculated for one material).
// Without groups (a store that has not configured any) the classic three are used.
export function resolveOptionGroups({ product, pack, catalog }) {
  const configured = Array.isArray(product?.optionGroups) ? product.optionGroups.filter(group => group && group.enabled !== false) : [];
  const groups = [];
  if (configured.length) {
    const offered = Array.isArray(pack?.optionIds) && pack.optionIds.length ? new Set(pack.optionIds) : null;
    const lists = { material: new Map(catalog.materials.map(item => [item.id, item])), service: new Map(catalog.services.map(item => [item.id, item])) };
    for (const group of configured) {
      const source = group.source === 'material' ? 'material' : 'service';
      if (source === 'material' && groups.some(entry => entry.source === 'material')) continue; // one material group is enough
      const choices = (Array.isArray(group.itemIds) ? group.itemIds : []).filter(id => !offered || offered.has(id)).map(id => lists[source].get(id)).filter(Boolean);
      if (!choices.length) continue;
      groups.push({
        id: String(group.id), name: String(group.name || '').trim() || 'ตัวเลือก', source,
        mode: source === 'material' || group.selectionMode !== 'multiple' ? 'single' : 'multiple',
        required: source === 'material' || group.required === true,
        choices
      });
    }
    // The price needs a material: if the studio offers none, fall back to the allowed ones.
    if (!groups.some(group => group.source === 'material')) {
      const materials = allowedMaterials(product, catalog);
      if (materials.length) groups.unshift({ id: 'materials', name: 'เลือกวัสดุ', source: 'material', mode: 'single', required: true, choices: materials });
    }
    return groups;
  }
  const coats = catalog.services.filter(isCoatService);
  const extras = catalog.services.filter(service => !isPrintService(service) && !isCoatService(service));
  return [
    { id: 'materials', name: 'เลือกวัสดุ', source: 'material', mode: 'single', required: true, choices: allowedMaterials(product, catalog) },
    { id: 'printing', name: 'รูปแบบการพิมพ์', source: 'service', mode: 'single', required: true, choices: catalog.services.filter(isPrintService) },
    { id: 'extras', name: 'ออปชันเพิ่มเติม', source: 'service', mode: 'multiple', required: false, choices: [...coats, ...extras] }
  ].filter(group => group.choices.length);
}

// The rule of the groups for the customer's current choice: what is missing (required groups with nothing chosen).
export function missingGroups({ groups, material, services }) {
  const chosen = new Set(services.map(service => service.id));
  return groups.filter(group => group.required && !(group.source === 'material'
    ? group.choices.some(item => item.id === material?.id)
    : group.choices.some(item => chosen.has(item.id))));
}

// How a group is worded for the customer: one or several, and whether it must be answered. Takes { mode, required }.
export const groupRuleText = group => (group.mode === 'single'
  ? (group.required ? 'เลือก 1 อย่าง · จำเป็น' : 'เลือกได้ 1 อย่าง · ไม่บังคับ')
  : (group.required ? 'เลือกได้หลายอย่าง · อย่างน้อย 1' : 'เลือกได้หลายอย่าง · ไม่บังคับ'));

// The lines typed in the studio (one per line) as a list: blank lines dropped, at most 8 lines of 120 characters.
export const parseBullets = text => String(text ?? '').split(/\r?\n/).map(line => line.trim().slice(0, 120)).filter(Boolean).slice(0, 8);

// The services after the customer taps a card of a group.
//  - single: the tapped card replaces the others of its group; tapping it again clears it unless the group is required
//  - multiple: the card is switched on or off; a required group keeps at least one
// Materials are always one and are set by the caller.
export function chooseInGroup(group, item, services) {
  if (group.source === 'material') return services;
  const inGroup = new Set(group.choices.map(entry => entry.id));
  const selected = services.some(entry => entry.id === item.id);
  const others = services.filter(entry => inGroup.has(entry.id) && entry.id !== item.id);
  if (group.mode === 'single') {
    if (selected) return group.required ? services : services.filter(entry => entry.id !== item.id);
    return [...services.filter(entry => !inGroup.has(entry.id)), item];
  }
  if (selected) return group.required && !others.length ? services : services.filter(entry => entry.id !== item.id);
  return [...services, item];
}

// What a new item of a set starts with: for every group the choices that are included in the set (free), and for a
// required group without any the first choice; the first material.
export function defaultSelection({ product, catalog, pack }) {
  const groups = resolveOptionGroups({ product, pack, catalog });
  const included = new Set(includedIdsFor(product, pack));
  let material = null;
  const services = [];
  for (const group of groups) {
    if (group.source === 'material') { material ||= group.choices[0]; continue; }
    const free = group.choices.filter(item => included.has(item.id));
    if (group.mode === 'single') {
      const pick = free[0] || (group.required ? group.choices[0] : null);
      if (pick) services.push(pick);
    } else {
      services.push(...free);
      if (group.required && !free.length) services.push(group.choices[0]);
    }
  }
  return { quantity: pack.quantity, material: material || allowedMaterials(product, catalog)[0] || catalog.materials[0] || null, services };
}

// Rebuilds the selection stored in a cart item from the current catalog.
// `problems` lists choices that are no longer sold (the item must be edited before it can be ordered).
export function selectionFromItem({ item, settings, catalog }) {
  const product = findProduct(settings);
  const pack = resolveSets(product).find(set => set.id === item.packageId) || null;
  const problems = [];
  if (!pack) problems.push('เซตนี้ไม่มีขายแล้ว');
  if (pack?.inquiryOnly) problems.push('เซตนี้ต้องติดต่อสอบถามก่อนสั่งซื้อ');
  const material = catalog.materials.find(entry => entry.id === item.materialId) || null;
  if (!material) problems.push('วัสดุที่เลือกไม่มีขายแล้ว');
  const services = [];
  for (const id of item.serviceIds || []) {
    const service = catalog.services.find(entry => entry.id === id);
    if (service) services.push(service);
    else if (!problems.includes('บริการที่เลือกไม่มีขายแล้ว')) problems.push('บริการที่เลือกไม่มีขายแล้ว');
  }
  return { product, pack, material, services, quantity: Number(item.quantity) || pack?.quantity || 0, problems };
}

export function quoteSelection({ settings, pack, material, services, quantity, code = '' }) {
  if (pack?.inquiryOnly) throw new Error('เซตนี้ต้องติดต่อสอบถามก่อนสั่งซื้อ');
  return calculateBusinessCardQuote({ preset: PRESET, material, services, quantity, pricingSettings: settings, packageId: pack.id, code });
}

// The choices stored in the cart. Prices are not stored: they are recalculated from the current settings.
export function cartItemFromSelection({ pack, quantity, material, services, promoCode = '', driveLink = '' }) {
  return {
    productId: BUSINESS_CARD_ID,
    packageId: pack.id,
    quantity: Number(quantity),
    materialId: material?.id || '',
    serviceIds: services.map(service => service.id),
    promoCode: String(promoCode).trim().slice(0, 80),
    driveLink: String(driveLink).trim().slice(0, 500)
  };
}
