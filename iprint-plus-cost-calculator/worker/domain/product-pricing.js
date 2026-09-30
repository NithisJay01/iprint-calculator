import { calculateProductPrice } from '../../shared/product-pricing.js';
import { componentCost, PRICING } from '../../business-card/logic.js';
// Catalog snapshots are validated against current catalog records before this check.
export function verifyConfiguredPrice(item, settings) {
  const product = settings.products.find(p => p.id === item.productId);
  if (!product) {
    if (item.pricingSnapshot) throw new Error('การตั้งค่าราคาเปลี่ยนแล้ว กรุณาโหลดราคาใหม่');
    return null;
  }
  const snapshot = item.pricingSnapshot;
  if (!snapshot || snapshot.version !== settings.version) throw new Error('การตั้งค่าราคาเปลี่ยนแล้ว กรุณาโหลดราคาใหม่');
  const pricing = calculateProductPrice({ product, version:settings.version, quantity:Number(item.quantity), sheets:Number(item.sheets), baseCost:Number(item.sheets) * PRICING.panelCost + componentCost(item.material,Number(item.sheets),Number(item.quantity)), services:item.services || [], materialId:item.material?.id, packageId:snapshot.package?.id || '', code:snapshot.code || '' });
  if (Math.abs(pricing.total - Number(item.basePrice)) > .01) throw new Error('ราคา/โปรโมชันเปลี่ยนแล้ว กรุณาโหลดราคาใหม่');
  return pricing;
}

// Items with no configured product (the main calculator/quote flow) price themselves as
// (sheets*panelCost + materialCost + serviceCost) * (1 + marginPercent/100) using the same fixed
// defaults the UI shows every customer (business-card/logic.js PRICING). Material/service unit
// prices are already checked against the live catalog before this runs (see compareCatalogSnapshot
// in worker/index.js), so this only has to confirm nobody tampered with the computed total itself.
export function verifyPlainItemPrice(item) {
  const sheets = Number(item?.sheets) || 0;
  const quantity = Number(item?.quantity) || 0;
  const materialCost = componentCost(item?.material, sheets, quantity);
  const serviceCost = (Array.isArray(item?.services) ? item.services : [])
    .reduce((sum, service) => sum + componentCost(service, sheets, quantity), 0);
  const productionCost = sheets * PRICING.panelCost;
  const expected = (productionCost + materialCost + serviceCost) * (1 + PRICING.marginPercent / 100);
  if (!Number.isFinite(Number(item?.basePrice)) || Math.abs(expected - Number(item.basePrice)) > 0.01) {
    throw Object.assign(new Error('ราคาคำนวณไม่ตรงกับต้นทุนวัสดุและค่าบริการปัจจุบัน กรุณาคำนวณใหม่'), { status: 409 });
  }
  return expected;
}
