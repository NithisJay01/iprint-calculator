// Brief Button V1: the shape of a Draft Brief and the rules that keep it honest.
// Used by the Worker (to normalise the AI output and to validate the brief the owner reviewed)
// and by the browser (to group fields while the owner edits). It has no dependencies.
//
// A brief is { customer, note, fields }. `fields` holds the six classified fields, each
//   { value, status, evidence, reason }
// where status is one of confirmed | need_confirmation | missing:
//   confirmed          the customer stated it clearly
//   need_confirmation  it was mentioned but is unclear, conflicting or refers to an earlier job
//   missing            nobody mentioned it (value is always empty)

export const FIELD_KEYS = Object.freeze(['product', 'size', 'quantity', 'material', 'file', 'dueDate']);
export const FIELD_LABELS = Object.freeze({
  customer: 'Customer',
  product: 'Product',
  size: 'Size',
  quantity: 'Quantity',
  material: 'Material',
  file: 'File',
  dueDate: 'Due Date',
  note: 'Note'
});
export const STATUS = Object.freeze({ CONFIRMED: 'confirmed', NEED_CONFIRMATION: 'need_confirmation', MISSING: 'missing' });
export const STATUS_LIST = Object.freeze(Object.values(STATUS));
export const STATUS_LABELS = Object.freeze({
  confirmed: 'Confirmed',
  need_confirmation: 'Need Confirmation',
  missing: 'Missing'
});

export const LIMITS = Object.freeze({ customer: 120, value: 500, evidence: 300, reason: 300, note: 1500 });

const clean = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

export const emptyField = () => ({ value: '', status: STATUS.MISSING, evidence: '', reason: '' });

export function emptyBrief() {
  return {
    customer: '',
    note: '',
    fields: Object.fromEntries(FIELD_KEYS.map(key => [key, emptyField()]))
  };
}

// mode 'ai'    a field the model called missing keeps no value, so a guess can never leak through.
// mode 'owner' the owner typed a value into a field still marked missing: keep it, but ask for confirmation.
export function sanitizeField(input, { mode = 'owner' } = {}) {
  const status = STATUS_LIST.includes(input?.status) ? input.status : '';
  let value = clean(input?.value, LIMITS.value);
  if (status === STATUS.MISSING && mode === 'ai') value = '';
  if (!value) return emptyField();
  return {
    value,
    status: !status || status === STATUS.MISSING ? STATUS.NEED_CONFIRMATION : status,
    evidence: clean(input?.evidence, LIMITS.evidence),
    reason: clean(input?.reason, LIMITS.reason)
  };
}

export function sanitizeBrief(input, { mode = 'owner' } = {}) {
  const fields = {};
  for (const key of FIELD_KEYS) fields[key] = sanitizeField(input?.fields?.[key], { mode });
  return {
    customer: clean(input?.customer, LIMITS.customer),
    note: clean(input?.note, LIMITS.note),
    fields
  };
}

// The three groups the owner reads: keys of the classified fields per status.
// A blank customer counts as missing information as well.
export function groupBrief(brief) {
  const groups = { confirmed: [], needConfirmation: [], missing: [] };
  for (const key of FIELD_KEYS) {
    const status = brief?.fields?.[key]?.status;
    if (status === STATUS.CONFIRMED) groups.confirmed.push(key);
    else if (status === STATUS.NEED_CONFIRMATION) groups.needConfirmation.push(key);
    else groups.missing.push(key);
  }
  if (!String(brief?.customer || '').trim()) groups.missing.unshift('customer');
  return groups;
}

export const missingInformation = brief => groupBrief(brief).missing.map(key => FIELD_LABELS[key]);

export function briefTitle(brief) {
  const customer = String(brief?.customer || '').trim() || 'ลูกค้า LINE';
  const product = String(brief?.fields?.product?.value || '').trim() || 'งานใหม่';
  const quantity = String(brief?.fields?.quantity?.value || '').trim();
  return `[LINE] ${customer} · ${product}${quantity ? ` × ${quantity}` : ''}`.slice(0, 180);
}

// A number for Notion's numeric column, only when the quantity is unambiguous ("500 ดวง" -> 500, "500 หรือ 1000" -> null).
export function parseQuantity(value) {
  const numbers = String(value ?? '').match(/\d[\d,]*(?:\.\d+)?/g) || [];
  if (numbers.length !== 1) return null;
  const parsed = Number(numbers[0].replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Is there anything worth turning into a ticket?
export const hasBriefContent = brief =>
  FIELD_KEYS.some(key => brief?.fields?.[key]?.value) || Boolean(String(brief?.note || '').trim());
