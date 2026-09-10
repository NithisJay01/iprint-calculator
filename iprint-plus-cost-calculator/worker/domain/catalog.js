export const CATALOG_TYPES = Object.freeze(['material', 'service']);
export const CATALOG_UNITS = Object.freeze(['sheet', 'piece', 'job']);
export const CAPACITY_BASES = Object.freeze(['job', 'sheet', 'piece']);
export const SERVICE_ROLES = Object.freeze(['PRINT_SINGLE', 'PRINT_DOUBLE', 'LAMINATION', 'CUTTING', 'CUTTING_50', 'CUTTING_100', 'ROUNDED_CORNER', 'OTHER']);

export function normalizeCatalogUnit(value) {
  const unit = String(value || '').trim().toLowerCase();
  if (unit === 'sheets' || unit === 'แผ่น') return 'sheet';
  if (unit === 'pieces' || unit === 'ชิ้น' || unit === 'ดวง') return 'piece';
  if (unit === 'งาน') return 'job';
  return CATALOG_UNITS.includes(unit) ? unit : '';
}

export function normalizeCatalogItem(input = {}) {
  const type = CATALOG_TYPES.includes(input.type) ? input.type : '';
  return {
    id: String(input.id || '').trim(),
    externalId: String(input.externalId || input.id || '').trim(),
    type,
    name: String(input.name || '').trim(),
    category: type === 'service' ? String(input.category || 'บริการเพิ่มเติม').trim() : '',
    serviceRole: type === 'service' && SERVICE_ROLES.includes(String(input.serviceRole || '').trim().toUpperCase())
      ? String(input.serviceRole).trim().toUpperCase()
      : '',
    material: String(input.material || '').trim(),
    cost: Number(input.cost) || 0,
    price: Number(input.price) || 0,
    unit: normalizeCatalogUnit(input.unit),
    active: input.active === true,
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 9999,
    capacityPoints: type === 'service' && Number.isFinite(Number(input.capacityPoints)) ? Number(input.capacityPoints) : 0,
    capacityBasis: type === 'service' && CAPACITY_BASES.includes(String(input.capacityBasis || '').toLowerCase())
      ? String(input.capacityBasis).toLowerCase()
      : 'job',
    capacityStep: type === 'service' && Number.isFinite(Number(input.capacityStep)) && Number(input.capacityStep) > 0
      ? Number(input.capacityStep)
      : 1,
    version: Number.isInteger(Number(input.version)) ? Number(input.version) : 1,
    createdAt: String(input.createdAt || ''),
    updatedAt: String(input.updatedAt || ''),
    previewRenderer: String(input.previewRenderer || ''),
    previewEffect: String(input.previewEffect || ''),
    shaderPreset: String(input.shaderPreset || ''),
    textureUrl: String(input.textureUrl || ''),
    imageUrl: type === 'service' ? String(input.imageUrl || '').trim() : ''
  };
}

export function validateCatalogMutation(input = {}) {
  const item = normalizeCatalogItem(input);
  const errors = [];
  if (!item.type) errors.push('type must be material or service');
  if (!item.name) errors.push('name is required');
  if (!Number.isFinite(Number(input.price)) || Number(input.price) < 0) errors.push('price must be zero or greater');
  if (!item.unit) errors.push('unit must be sheet, piece, or job');
  if (item.type === 'service' && !item.category) errors.push('service category is required');
  if (item.type === 'service' && input.serviceRole !== undefined && input.serviceRole !== '' && !item.serviceRole) {
    errors.push('serviceRole is invalid');
  }
  if (item.imageUrl && !/^https:\/\//i.test(item.imageUrl)) errors.push('imageUrl must be a public HTTPS URL');
  if (item.type === 'service' && input.capacityPoints !== undefined && input.capacityPoints !== '' &&
      (!Number.isFinite(Number(input.capacityPoints)) || Number(input.capacityPoints) < 0)) {
    errors.push('capacityPoints must be zero or greater');
  }
  if (item.type === 'service' && input.capacityBasis !== undefined && input.capacityBasis !== '' &&
      !CAPACITY_BASES.includes(String(input.capacityBasis).toLowerCase())) {
    errors.push('capacityBasis must be job, sheet, or piece');
  }
  if (item.type === 'service' && input.capacityStep !== undefined && input.capacityStep !== '' &&
      (!Number.isFinite(Number(input.capacityStep)) || Number(input.capacityStep) <= 0)) {
    errors.push('capacityStep must be greater than 0');
  }
  return { success: errors.length === 0, errors, value: item };
}

export function compareCatalogSnapshot(snapshot = {}, currentInput = {}) {
  const current = normalizeCatalogItem(currentInput);
  const reasons = [];
  if (!current.id || !current.active) reasons.push('inactive');
  if (Math.abs((Number(snapshot.price) || 0) - current.price) > 0.0001) reasons.push('price_changed');
  if (normalizeCatalogUnit(snapshot.unit) !== current.unit) reasons.push('unit_changed');
  if (snapshot.updatedAt && current.updatedAt && String(snapshot.updatedAt) !== current.updatedAt) reasons.push('version_changed');
  const capacityChanged = current.type === 'service' && (
    Math.abs((Number(snapshot.capacityPoints) || 0) - current.capacityPoints) > 0.0001 ||
    String(snapshot.capacityBasis || 'job') !== current.capacityBasis ||
    Math.abs((Number(snapshot.capacityStep) || 1) - current.capacityStep) > 0.0001
  );
  if (capacityChanged) reasons.push('capacity_changed');
  if (current.type === 'service' && String(snapshot.serviceRole || '') !== current.serviceRole) reasons.push('service_role_changed');
  return {
    changed: reasons.length > 0,
    reasons,
    previousPrice: Number(snapshot.price) || 0,
    currentPrice: current.price,
    previousUnit: normalizeCatalogUnit(snapshot.unit),
    currentUnit: current.unit,
    currentUpdatedAt: current.updatedAt
  };
}
