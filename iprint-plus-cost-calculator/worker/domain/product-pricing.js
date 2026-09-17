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
