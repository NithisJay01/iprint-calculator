// Shared by the settings preview, storefront and Worker.
export const money = value => Math.round(value * 100) / 100;
export const emptySettings = () => ({ version: '', products: [] });
export function newProduct(id = 'business-card', name = 'นามบัตร') {
  return { id, name, enabled: true, mode: 'formula', markup: 30, minimum: 0, rounding: 0.01, includedServiceIds: [], materialIds: [], tiers: [], packages: [], promotions: [] };
}
export function validateSettings(input) {
  const errors = [];
  const number = (value, label, minimum = 0) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) errors.push(label);
  };
  if (!input || !Array.isArray(input.products) || input.products.length > 100) return { success: false, errors: ['รายการสินค้าไม่ถูกต้อง'] };
  const ids = new Set();
  for (const p of input.products) {
    if (!p || typeof p !== 'object') { errors.push('สินค้าไม่ถูกต้อง'); continue; }
    if (!/^[a-z0-9-]{1,80}$/.test(p.id) || ids.has(p.id)) errors.push('รหัสสินค้าต้องไม่ซ้ำ และใช้ a-z, 0-9, -');
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 160) errors.push('กรุณาระบุชื่อสินค้า');
    if (typeof p.enabled !== 'boolean') errors.push('สถานะสินค้าไม่ถูกต้อง');
    if (!['formula', 'tiers', 'packages'].includes(p.mode)) errors.push('รูปแบบราคาไม่ถูกต้อง');
    number(p.markup, 'กำไรต้องไม่ติดลบ'); number(p.minimum, 'ราคาขั้นต่ำไม่ถูกต้อง'); number(p.rounding, 'การปัดเศษต้องมากกว่า 0', 0.01);
    for (const key of ['includedServiceIds', 'materialIds', 'tiers', 'packages', 'promotions']) if (!Array.isArray(p[key]) || p[key].length > 100) errors.push(`${key} ไม่ถูกต้อง`);
    if (errors.length) continue;
    for (const key of ['includedServiceIds', 'materialIds']) if (p[key].some(id => typeof id !== 'string' || id.length > 100)) errors.push(`${key} ไม่ถูกต้อง`);
    let previous = 0;
    for (const t of p.tiers) {
      if (!t || typeof t !== 'object') { errors.push('ช่วงราคาไม่ถูกต้อง'); continue; }
      number(t.min, 'จำนวนเริ่มต้นไม่ถูกต้อง', 1); number(t.price, 'ราคาต่อชิ้นไม่ถูกต้อง');
      if (!Number.isInteger(t.min) || t.min <= previous) errors.push('ช่วงจำนวนต้องเรียงจากน้อยไปมากและไม่ซ้ำ'); previous = t.min;
    }
    const packageIds = new Set();
    for (const t of p.packages) {
      if (!t || typeof t !== 'object') { errors.push('แพ็กเกจไม่ถูกต้อง'); continue; }
      if (typeof t.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(t.id) || packageIds.has(t.id) || typeof t.name !== 'string' || !t.name.trim()) errors.push('รหัสแพ็กเกจต้องไม่ซ้ำและมีชื่อ'); packageIds.add(t.id);
      number(t.quantity, 'จำนวนแพ็กเกจไม่ถูกต้อง', 1); number(t.price, 'ราคาแพ็กเกจไม่ถูกต้อง');
      if (!Number.isInteger(t.quantity)) errors.push('จำนวนต้องเป็นจำนวนเต็ม');
    }
    if (p.mode === 'tiers' && !p.tiers.length) errors.push('เพิ่มช่วงราคาอย่างน้อยหนึ่งช่วง');
    if (p.mode === 'packages' && !p.packages.length) errors.push('เพิ่มแพ็กเกจอย่างน้อยหนึ่งรายการ');
    const promoIds = new Set();
    for (const t of p.promotions) {
      if (!t || typeof t !== 'object') { errors.push('โปรโมชันไม่ถูกต้อง'); continue; }
      if (typeof t.id !== 'string' || !t.id || promoIds.has(t.id) || typeof t.name !== 'string' || !t.name.trim()) errors.push('โปรโมชันต้องมีชื่อและรหัสไม่ซ้ำ'); promoIds.add(t.id);
      if (typeof t.code !== 'string' || t.code.length > 80 || typeof t.enabled !== 'boolean') errors.push('โค้ดหรือสถานะโปรโมชันไม่ถูกต้อง');
      if (!['percent', 'fixed'].includes(t.type) || !['base', 'total'].includes(t.scope)) errors.push('ประเภทส่วนลดไม่ถูกต้อง');
      number(t.value, 'ส่วนลดไม่ถูกต้อง'); number(t.minQuantity, 'จำนวนขั้นต่ำไม่ถูกต้อง'); number(t.minSpend, 'ยอดขั้นต่ำไม่ถูกต้อง');
      if (t.type === 'percent' && t.value > 100) errors.push('ส่วนลดต้องไม่เกิน 100%');
      for (const date of [t.start, t.end]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) errors.push('วันที่โปรโมชันไม่ถูกต้อง');
      if (t.start && t.end && t.start > t.end) errors.push('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
    }
  }
  if (JSON.stringify(input).length > 150000) errors.push('ข้อมูลมีขนาดใหญ่เกินไป');
  return { success: !errors.length, errors, value: input };
}
export const SHEET_UNITS = Object.freeze(['sheet', 'sheets', 'แผ่น']);
export const PIECE_UNITS = Object.freeze(['piece', 'pieces', 'ชิ้น', 'ดวง']);
export const unitKind = unit => (SHEET_UNITS.includes(unit) ? 'sheet' : PIECE_UNITS.includes(unit) ? 'piece' : 'job');
// What one catalog item costs for a job and how much of it is charged to the customer.
// `charge` is not rounded; it is exactly what calculateProductPrice adds to the subtotal.
//  - service: included services of a package/tier product are free, otherwise cost x markup
//  - material (isMaterial): only formula pricing charges it (it is part of the base cost x markup)
export function itemCost({ product, item, sheets = 0, quantity = 1, isMaterial = false }) {
  const kind = unitKind(item.unit);
  const amount = kind === 'sheet' ? sheets : kind === 'piece' ? quantity : 1;
  const unitPrice = Number(item.price) || 0;
  const cost = unitPrice * amount;
  const factor = 1 + product.markup / 100;
  const included = isMaterial ? product.mode !== 'formula' : product.mode !== 'formula' && product.includedServiceIds.includes(item.id);
  return { kind, amount, unitPrice, factor, cost, included, charge: included ? 0 : cost * factor };
}
export function calculateProductPrice({ product, version = '', quantity, sheets = 0, baseCost = 0, services = [], materialId = '', packageId = '', code = '', date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }) }) {
  const validation = validateSettings({ products: [product] });
  if (!validation.success) throw new Error(validation.errors.join(' • '));
  if (!product.enabled) throw new Error('สินค้านี้ปิดใช้งาน');
  if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(baseCost) || baseCost < 0 || !Number.isFinite(sheets) || sheets < 0) throw new Error('จำนวนหรือต้นทุนไม่ถูกต้อง');
  if (product.materialIds.length && !product.materialIds.includes(materialId)) throw new Error('วัสดุนี้ไม่อยู่ในเงื่อนไขราคา');
  const factor = 1 + product.markup / 100;
  let base = baseCost * factor;
  let selectedPackage = null;
  if (product.mode === 'tiers') {
    const tier = product.tiers.filter(t => quantity >= t.min).at(-1);
    if (!tier) throw new Error('จำนวนต่ำกว่าช่วงราคาที่กำหนด');
    base = tier.price * quantity;
  }
  if (product.mode === 'packages') {
    selectedPackage = product.packages.find(p => p.id === packageId && p.quantity === quantity);
    if (!selectedPackage) throw new Error('กรุณาเลือกแพ็กเกจและจำนวนให้ตรงกัน');
    base = selectedPackage.price;
  }
  let cost = baseCost, extras = 0;
  for (const service of services) {
    if (!Number.isFinite(Number(service.price)) || Number(service.price) < 0) throw new Error('ราคาบริการไม่ถูกต้อง');
    const line = itemCost({ product, item: service, sheets, quantity });
    cost += line.cost;
    extras += line.charge;
  }
  base = money(base); extras = money(extras);
  const subtotal = money(base + extras);
  // Promotions do not stack: choose the greatest eligible discount.
  const eligible = product.promotions.filter(p => p.enabled && (!p.start || date >= p.start) && (!p.end || date <= p.end) && quantity >= p.minQuantity && subtotal >= p.minSpend && (!p.code || p.code.toUpperCase() === code.trim().toUpperCase()));
  let discount = 0, promotion = null;
  for (const p of eligible) {
    const target = p.scope === 'base' ? base : subtotal;
    const value = money(Math.min(target, p.type === 'percent' ? target * p.value / 100 : p.value));
    if (value > discount) { discount = value; promotion = p; }
  }
  const afterDiscount = Math.max(product.minimum, subtotal - discount);
  const total = money(Math.ceil((afterDiscount - 1e-8) / product.rounding) * product.rounding);
  if (!Number.isFinite(total) || total > 1e12) throw new Error('ราคาเกินขอบเขตที่รองรับ');
  return { productId: product.id, version, code: code.trim(), mode: product.mode, package: selectedPackage ? { ...selectedPackage } : null, base, extras, subtotal, discount, adjustment: money(total - (subtotal - discount)), total, cost: money(cost), profit: money(total - cost), promotion: promotion ? { ...promotion } : null, rule: structuredClone(product) };
}
