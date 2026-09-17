# Product pricing settings

Open `/pricing/` from the Staff Catalog link. Settings apply to the business-card storefront; the legacy general calculator keeps its existing formula. Additional products can be created and priced in the simulator; a storefront adapter is needed to sell another product type.

## Pricing rules

- Formula: production + material + selected service amounts, with a cost markup percentage. This is markup, not gross margin.
- Quantity tiers: the last eligible minimum quantity gives the unit price for all pieces. Watch for a total-price drop at a threshold.
- Packages: exact package ID and quantity, with a fixed base price. Storefront package choices follow saved packages.
- Included services and allowed materials are currently product-wide. Included services are not charged again in tier/package modes. Other selected services use Catalog units and the product markup.
- Promotions: fixed or percentage discounts on base or subtotal, code optional, minimum quantity/spend, inclusive start/end dates in Bangkok time. The greatest eligible discount wins; promotions never stack.
- Order: base + extras, discount, minimum price, rounding up, then existing Boost and VAT calculation.
- Cost/profit estimates use existing Catalog `price` inputs, consistent with the original business-card calculator; they are not a separate accounting cost ledger.

## Local and production

Localhost uses `iprint-product-pricing-preview-v1` in localStorage and bundled preview catalog. Save and refresh the business-card page in the same browser/origin. It never writes live Notion settings.

Production adds `GET /pricing-settings` and authenticated `PUT /staff/pricing-settings` using the existing X-API-Key. Deploy Worker and frontend together. The Notion repository stores an inactive `__IPRINT_PRICING_SETTINGS__` row with `Pricing Rules` rich text in the preset data source, creating the property at first save. No live deployment or schema mutation is performed by this implementation task.

Each save generates a version. The business-card payload carries productId and a full pricing snapshot. The Worker checks configured pricing against current rules after catalog validation, rejects stale totals/versions and persists its recalculated snapshot in the order item Snapshot property. Existing orders retain their snapshot. Simultaneous settings saves currently use last-write-wins.

Settings returned to the browser include promotion codes; these are public campaign codes, not private or single-use coupons. Usage limits, customer-specific campaigns, stacking, free-service promotions and area/page-based formula adapters are not implemented in this first version.

Run `node tests/run-all.mjs` from `iprint-plus-cost-calculator`.
