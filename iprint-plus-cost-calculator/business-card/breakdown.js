import { itemCost } from '../shared/product-pricing.js';
import { PRICING } from './logic.js';

// Per-item totals for the order page. They use the same rules as calculateProductPrice (via itemCost),
// so what a button says it adds is what the customer is really charged.

const money = value => Math.round((Number(value) || 0) * 100) / 100;
export const formatBaht = value => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const UNIT_LABEL = Object.freeze({ sheet: 'แผ่น', piece: 'ใบ', job: 'งาน' });
const count = value => Number(value).toLocaleString('th-TH');

// Pricing rules used when the store has no business-card product configured (same as calculateBusinessCardQuote).
export const fallbackPricingModel = () => ({ mode: 'formula', markup: PRICING.marginPercent, includedServiceIds: [], minimum: 0, rounding: 0.01 });

// Unit price shown with up to 4 decimals so that "unit price x amount" always matches the line total.
const formatUnitPrice = value => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

// Wording of the small line under an item in the price summary, e.g. "แผ่นละ ฿1.56 (ใช้ทั้งหมด 20 แผ่น)".
function chargeBasis(cost) {
  if (cost.kind === 'job') return 'คิดต่องาน (ครั้งเดียว)';
  const label = UNIT_LABEL[cost.kind];
  return `${label}ละ ฿${formatUnitPrice(cost.unitPrice * cost.factor)} (ใช้ทั้งหมด ${count(cost.amount)} ${label})`;
}

// Price tag for one selectable material/service.
export function optionPrice({ product, item, sheets, quantity, isMaterial = false }) {
  const cost = itemCost({ product, item, sheets, quantity, isMaterial });
  const charge = money(cost.charge);
  const included = cost.included || charge === 0;
  return { included, charge, text: included ? 'รวมในเซต' : `+฿${formatBaht(charge)}`, basis: included ? '' : chargeBasis(cost) };
}

// Lines of the price summary. baseLine + material + services - discount + adjustment always equals the total.
export function buildPriceBreakdown({ product, quote, packName, quantity, material, services }) {
  const { sheets, pieces, pricing } = quote;
  const model = product || fallbackPricingModel();
  const factor = 1 + model.markup / 100;
  const lines = [];

  const materialTag = material ? optionPrice({ product: model, item: material, sheets, quantity: pieces, isMaterial: true }) : null;
  const serviceTags = services.map(service => ({ service, tag: optionPrice({ product: model, item: service, sheets, quantity: pieces }) }));
  const baseValue = pricing ? money(pricing.base - (materialTag?.charge || 0)) : money(quote.productionCost * factor);
  lines.push({ kind: 'base', label: `${packName} (${count(quantity)} ใบ)`, value: baseValue, text: `฿${formatBaht(baseValue)}` });
  if (material) lines.push({ kind: 'material', label: material.name, value: materialTag.charge, included: materialTag.included, text: materialTag.text, basis: materialTag.basis });
  for (const { service, tag } of serviceTags) lines.push({ kind: 'service', label: service.name, value: tag.charge, included: tag.included, text: tag.text, basis: tag.basis });

  const discount = pricing ? money(pricing.discount) : 0;
  if (discount > 0) lines.push({ kind: 'discount', label: `ส่วนลด${pricing.promotion?.name ? ` (${pricing.promotion.name})` : ''}`, value: -discount, text: `−฿${formatBaht(discount)}` });

  const listed = lines.reduce((sum, line) => sum + line.value, 0);
  const adjustment = money(quote.basePrice - listed);
  if (Math.abs(adjustment) >= 0.01) {
    lines.push({ kind: 'adjustment', label: 'ปัดราคา', value: adjustment, text: `${adjustment > 0 ? '+' : '−'}฿${formatBaht(Math.abs(adjustment))}` });
  }
  const rush = money(quote.price - quote.basePrice);
  if (rush > 0) lines.push({ kind: 'rush', label: 'ค่าเร่งด่วน', value: rush, text: `+฿${formatBaht(rush)}` });
  lines.push({ kind: 'total', label: 'ราคารวม', value: quote.price, text: `฿${formatBaht(quote.price)}` });
  return lines;
}
