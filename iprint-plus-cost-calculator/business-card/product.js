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

// What a new item of a set starts with: the set's included print + coatings and the first material.
export function defaultSelection({ product, catalog, pack }) {
  const materials = allowedMaterials(product, catalog);
  const prints = catalog.services.filter(isPrintService);
  const coats = catalog.services.filter(isCoatService);
  const included = new Set(includedIdsFor(product, pack));
  return {
    quantity: pack.quantity,
    material: materials[0] || catalog.materials[0] || null,
    services: [prints.find(service => included.has(service.id)) || prints[0], ...coats.filter(service => included.has(service.id))].filter(Boolean)
  };
}

// Rebuilds the selection stored in a cart item from the current catalog.
// `problems` lists choices that are no longer sold (the item must be edited before it can be ordered).
export function selectionFromItem({ item, settings, catalog }) {
  const product = findProduct(settings);
  const pack = resolveSets(product).find(set => set.id === item.packageId) || null;
  const problems = [];
  if (!pack) problems.push('เซตนี้ไม่มีขายแล้ว');
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
