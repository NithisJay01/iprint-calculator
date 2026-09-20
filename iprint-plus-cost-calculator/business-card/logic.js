import { calculateProductPrice } from '../shared/product-pricing.js';
export const BUSINESS_CARD_SIZE = Object.freeze({ width: 9, height: 5.4, bleed: 3, gap: 0 });
export const PRICING = Object.freeze({ panelCost: 2.5, marginPercent: 30, vatPercent: 7 });

export function normalizeUnit(value) {
  const unit = String(value || '').toLowerCase();
  if (['sheet', 'sheets', 'แผ่น'].includes(unit)) return 'sheet';
  if (['piece', 'pieces', 'ชิ้น', 'ดวง'].includes(unit)) return 'piece';
  return 'job';
}

export function findBestLayout(preset, widthCm = 9, heightCm = 5.4, gapMm = 0) {
  const usableWidth = Number(preset?.usableW) * 10;
  const usableHeight = Number(preset?.usableH) * 10;
  const width = Number(widthCm) * 10;
  const height = Number(heightCm) * 10;
  let best = null;
  [[width, height, false], [height, width, true]].forEach(([pieceWidth, pieceHeight, rotated]) => {
    const columns = Math.floor((usableWidth + gapMm) / (pieceWidth + gapMm));
    const rows = Math.floor((usableHeight + gapMm) / (pieceHeight + gapMm));
    const yieldCount = columns * rows;
    if (yieldCount > 0 && (!best || yieldCount > best.yield)) {
      best = { yield: yieldCount, columns, rows, rotated };
    }
  });
  return best;
}

function quantityFor(component, sheets, pieces) {
  const unit = normalizeUnit(component?.unit);
  return unit === 'sheet' ? sheets : unit === 'piece' ? pieces : 1;
}

export function componentCost(component, sheets, pieces) {
  return (Number(component?.price) || 0) * quantityFor(component, sheets, pieces);
}

export function capacityPoints(component, sheets, pieces) {
  const points = Number(component?.capacityPoints) || 0;
  if (!points) return 0;
  const basis = String(component?.capacityBasis || 'job').toLowerCase();
  const amount = basis === 'sheet' ? sheets : basis === 'piece' ? pieces : 1;
  return points * Math.ceil(amount / Math.max(1, Number(component?.capacityStep) || 1));
}

export function calculateBusinessCardQuote({ preset, material, services = [], quantity, boost = null, pricingSettings = null, packageId = '', code = '' }) {
  const pieces = Math.max(1, Math.floor(Number(quantity) || 0));
  const layout = findBestLayout(preset, BUSINESS_CARD_SIZE.width, BUSINESS_CARD_SIZE.height, BUSINESS_CARD_SIZE.gap);
  if (!layout) throw new Error('ขนาดนามบัตรไม่สามารถจัดวางบนกระดาษที่เลือกได้');
  const sheets = Math.ceil(pieces / layout.yield);
  const materialCost = componentCost(material, sheets, pieces);
  const serviceCost = services.reduce((sum, service) => sum + componentCost(service, sheets, pieces), 0);
  const productionCost = sheets * PRICING.panelCost;
  const product = pricingSettings?.products?.find(item => item.id === 'business-card');
  const pricing = product ? calculateProductPrice({ product, version: pricingSettings.version, quantity: pieces, sheets, baseCost: productionCost + materialCost, services, materialId: material?.id, packageId, code }) : null;
  const basePrice = pricing ? pricing.total : roundMoney((productionCost + materialCost + serviceCost) * (1 + PRICING.marginPercent / 100));
  const multiplier = boost ? Number(boost.multiplier) || 0 : 0;
  const price = roundMoney(basePrice * (1 + multiplier));
  const points = roundMoney(1 + capacityPoints(material, sheets, pieces) + services.reduce((sum, service) => sum + capacityPoints(service, sheets, pieces), 0));
  return { pieces, sheets, layout, productionCost, materialCost, serviceCost, basePrice, price, points, pricing };
}

export function catalogSnapshot(item) {
  if (!item) return null;
  return {
    id: String(item.id || ''), name: String(item.name || ''), unit: String(item.unit || ''),
    price: Number(item.price) || 0, updatedAt: String(item.updatedAt || ''),
    capacityPoints: Number(item.capacityPoints) || 0,
    capacityBasis: String(item.capacityBasis || 'job'), capacityStep: Number(item.capacityStep) || 1,
    serviceRole: String(item.serviceRole || '')
  };
}

// One business card order item as the Worker expects it (also used for every item of a cart order).
// includeBrief=false leaves out the generated brief image (a cart order has no artwork file, only a link).
export function buildOrderItem({ state, quote, itemId, quoteNo = '', now = new Date(), includeBrief = true }) {
  const material = catalogSnapshot(state.material);
  const services = state.services.map(catalogSnapshot);
  const printSide = services.some(service => service.serviceRole === 'PRINT_DOUBLE' || /หน้า\s*[-–—/]?\s*หลัง|2\s*หน้า/.test(service.name)) ? 'double' : 'single';
  const previewImages = (includeBrief ? [{ kind: 'brief', side: printSide === 'double' ? 'front-back' : 'front', label: 'ภาพบรีฟงานพิมพ์', filename: `${quoteNo}-brief.png` }] : [])
    .concat((state.references || []).slice(0, 3).map((file, index) => ({ kind: 'reference', side: String(index + 1), label: `ภาพ Ref ${index + 1}`, filename: safeFilename(file.name || `reference-${index + 1}.png`) })));
  return {
    id: itemId, name: state.jobName, version: state.version || 'V1',
    size: '9.00 × 5.40 cm', width: 9, height: 5.4, quantity: quote.pieces, unit: 'ชิ้น',
    paper: { key: String(state.preset.id || ''), id: String(state.preset.id || ''), name: String(state.preset.name || '') },
    sheets: quote.sheets, yield: quote.layout.yield, gap: 0, bleed: 3,
    material, services, basePrice: quote.basePrice, price: quote.price,
    productId: 'business-card', pricingSnapshot: quote.pricing ? structuredClone(quote.pricing) : null,
    boost: state.boost ? { days: Number(state.boost.days), multiplier: Number(state.boost.multiplier), date: state.deliveryDate } : null,
    variants: [{ id: `${itemId}-variant-1`, name: state.jobName, quantity: quote.pieces }],
    jobType: 'งานกระดาษ', jobNickname: state.jobName, printSide, productionService: 'laser',
    artworkSides: { hasFront: Boolean(state.frontFile), hasBack: Boolean(state.backFile), useFrontForBack: false, frontRotation: 0, backRotation: 0 },
    previewImages, briefFileLink: String(state.driveLink || '').trim(),
    brief: [state.note, `แพ็กเกจ: ${state.packageName}`, `ช่องทางชำระเงิน: ${state.paymentMethod || 'รอใบแจ้งชำระ'}`].filter(Boolean).join(' • '),
    briefDeadline: isoDate(now), deliveryDeadline: state.deliveryDate,
    editor: { costPerSheet: PRICING.panelCost, profitPercent: PRICING.marginPercent }, createdAt: now.toISOString()
  };
}

export function buildOrderPayload({ state, quote, now = new Date(), orderKey, quoteNo }) {
  const vat = roundMoney(quote.price * PRICING.vatPercent / 100);
  const itemId = `${orderKey}-item-1`.slice(0, 100);
  const item = buildOrderItem({ state, quote, itemId, quoteNo, now });
  return {
    orderKey, quoteNo, date: isoDate(now), createdAt: now.toISOString(), customer: state.customerName,
    recipient: state.customerName, phone: state.phone, email: state.email || '', lineId: state.lineId || '',
    contact: [state.phone, state.email, state.lineId].filter(Boolean).join(' • '), address: state.address || '-',
    items: [{ id: itemId, name: state.jobName, size: item.size, qty: quote.pieces, unit: 'ชิ้น', price: quote.price }],
    orderItems: [item], total: quote.price, vat, grandTotal: roundMoney(quote.price + vat),
    sheets: quote.sheets, pieceCount: quote.pieces, size: '1 รายการ', paper: ''
  };
}

export function isoDate(date = new Date()) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function roundMoney(value) { return Math.round((Number(value) || 0) * 100) / 100; }
export function safeFilename(value) { return String(value || 'file').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120); }
