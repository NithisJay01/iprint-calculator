import { emptySettings, newProduct, validateSettings } from './product-pricing.js';
import { resizeImageFile } from './image-resize.js';
export const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
export const STORAGE_KEY = 'iprint-product-pricing-preview-v1';
export const API_ROOT = 'https://iprint-flow-api.iprint-garphic1.workers.dev';
const API = API_ROOT;
export async function loadPricing() {
  if (LOCAL) {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : { ...emptySettings(), products: [newProduct()] };
    if (!validateSettings(data).success) throw new Error('การตั้งค่าราคาที่บันทึกไว้ไม่ถูกต้อง');
    return data;
  }
  const response = await fetch(`${API}/pricing-settings`, { cache: 'no-store' });
  if (response.status === 404) return emptySettings();
  const data = await response.json();
  if (!response.ok || !validateSettings(data.settings).success) throw new Error('โหลดการตั้งค่าราคาไม่สำเร็จ');
  return data.settings;
}
export async function savePricing(settings, key) {
  const check = validateSettings(settings);
  if (!check.success) throw new Error(check.errors.join(' • '));
  if (LOCAL) {
    const saved = { ...settings, version: crypto.randomUUID() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    return saved;
  }
  if (!key.trim()) throw new Error('กรุณาระบุ API Key ของพนักงาน');
  const response = await fetch(`${API}/staff/pricing-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-API-Key': key.trim() }, body: JSON.stringify(settings) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.errors?.join(' • ') || data.error || 'บันทึกไม่สำเร็จ');
  return data.settings;
}
export async function loadCatalog() {
  if (LOCAL) return applyPreviewOverlay((await import('./preview-catalog.js')).catalog);
  const [materials, services] = await Promise.all(['materials', 'services'].map(async path => {
    const response = await fetch(`${API}/${path}`);
    if (!response.ok) throw new Error('โหลด Catalog ไม่สำเร็จ');
    return (await response.json())[path].filter(item => item.active !== false);
  }));
  return { materials, services };
}

// ---------------------------------------------------------------------------
// API key shared with the main staff app (same storage keys as js/core.js).
export function storedWriteKey() {
  try {
    return sessionStorage.getItem('iprint_write_api_key_session') || localStorage.getItem('iprint_write_api_key') || '';
  } catch (error) {
    return '';
  }
}

async function staffRequest(method, path, key, body) {
  const apiKey = String(key || '').trim();
  if (!apiKey) throw Object.assign(new Error('กรุณาระบุ API Key ของพนักงาน'), { code: 'NO_KEY' });
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw Object.assign(new Error('API Key ไม่ถูกต้อง'), { code: 'UNAUTHORIZED' });
  return { response, data };
}

// ---------------------------------------------------------------------------
// Drafts: work in progress that customers do not see. Stored next to (never inside) the published settings.
export const DRAFT_STORAGE_KEY = 'iprint-product-pricing-draft-v1';

export async function loadDraft(key) {
  if (LOCAL) {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  const { response, data } = await staffRequest('GET', '/staff/pricing-settings/draft', key);
  if (!response.ok) throw new Error(data.error || 'โหลดฉบับร่างไม่สำเร็จ');
  return data.draft || null;
}

export async function saveDraft(settings, { baseVersion = '', expectedSavedAt, force = false } = {}, key = '') {
  if (LOCAL) {
    const draft = { savedAt: new Date().toISOString(), baseVersion, settings };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return draft;
  }
  const { response, data } = await staffRequest('PUT', '/staff/pricing-settings/draft', key, { baseVersion, settings, expectedSavedAt, force });
  if (response.status === 409) throw Object.assign(new Error('มีคนอื่นบันทึกฉบับร่างไว้ก่อนหน้านี้'), { code: 'DRAFT_CONFLICT', current: data.current || null });
  if (!response.ok) throw new Error(data.errors?.join(' • ') || data.error || 'บันทึกฉบับร่างไม่สำเร็จ');
  return data.draft;
}

export async function discardDraft(key) {
  if (LOCAL) {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return true;
  }
  const { response, data } = await staffRequest('DELETE', '/staff/pricing-settings/draft', key);
  if (!response.ok) throw new Error(data.error || 'ทิ้งฉบับร่างไม่สำเร็จ');
  return true;
}

// ---------------------------------------------------------------------------
// Catalog edits made from the set studio. They apply to the catalog immediately (they are not part of a draft).
const OVERLAY_KEY = 'iprint-preview-catalog-overlay-v1';
const collectionOf = type => (type === 'service' ? 'services' : 'materials');
const readOverlay = () => {
  try { return { added: { materials: [], services: [] }, removed: [], ...JSON.parse(localStorage.getItem(OVERLAY_KEY) || '{}') }; }
  catch (error) { return { added: { materials: [], services: [] }, removed: [] }; }
};

export function applyPreviewOverlay(base) {
  const overlay = readOverlay();
  const hidden = new Set(overlay.removed);
  return {
    materials: [...base.materials, ...(overlay.added.materials || [])].filter(item => !hidden.has(item.id)),
    services: [...base.services, ...(overlay.added.services || [])].filter(item => !hidden.has(item.id))
  };
}

export async function createCatalogItem(type, payload, key = '') {
  if (LOCAL) {
    const overlay = readOverlay();
    const item = { ...payload, id: `local-${type}-${crypto.randomUUID().slice(0, 8)}`, updatedAt: new Date().toISOString() };
    overlay.added[collectionOf(type)] = [...(overlay.added[collectionOf(type)] || []), item];
    localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay));
    return item;
  }
  const { response, data } = await staffRequest('POST', `/staff/${collectionOf(type)}`, key, payload);
  if (!response.ok || !data.success) throw new Error(data.errors?.join(' • ') || data.error || 'สร้างรายการไม่สำเร็จ');
  return data.item;
}

export async function deactivateCatalogItem(type, item, key = '') {
  if (LOCAL) {
    const overlay = readOverlay();
    overlay.removed = [...new Set([...overlay.removed, item.id])];
    localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay));
    return true;
  }
  // The Worker merges this with the stored record, so only the flag and the conflict guard are sent.
  const { response, data } = await staffRequest('PATCH', `/staff/${collectionOf(type)}/${encodeURIComponent(item.id)}`, key, { active: false, expectedUpdatedAt: item.updatedAt || '' });
  if (response.status === 409) throw Object.assign(new Error('รายการนี้ถูกแก้ไขจากที่อื่น กรุณารีเฟรชหน้าแล้วลองอีกครั้ง'), { code: 'CATALOG_WRITE_CONFLICT' });
  if (!response.ok || !data.success) throw new Error(data.error || 'ปิดใช้งานรายการไม่สำเร็จ');
  return true;
}

// ---------------------------------------------------------------------------
// Gallery pictures: made smaller in the browser, then stored by the Worker (staff only). Returns the public link.
// `prepare` and `fetcher` can be replaced (the tests do); `local` is true on localhost, where there is no storage.
export async function uploadGalleryImage(file, key, { prepare = resizeImageFile, fetcher = fetch, local = LOCAL } = {}) {
  if (local) throw Object.assign(new Error('อัปโหลดไฟล์ใช้ได้เมื่อเปิดบนเว็บจริง (ในเครื่องนี้ให้ใช้ลิงก์รูปแทน)'), { code: 'LOCAL' });
  const apiKey = String(key || '').trim();
  if (!apiKey) throw Object.assign(new Error('กรุณาระบุ API Key ของพนักงาน'), { code: 'NO_KEY' });
  const picture = await prepare(file);
  const form = new FormData();
  form.append('file', picture, picture.type === 'image/webp' ? 'photo.webp' : 'photo.jpg');
  let response;
  try {
    response = await fetcher(`${API}/staff/uploads`, { method: 'POST', headers: { 'X-API-Key': apiKey }, body: form });
  } catch (error) {
    throw Object.assign(new Error('เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'), { code: 'NETWORK' });
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw Object.assign(new Error('API Key ไม่ถูกต้อง'), { code: 'UNAUTHORIZED' });
  if (response.status === 503) throw Object.assign(new Error('ยังไม่ได้ตั้งค่าที่เก็บรูปบน Worker (ดูขั้นตอนใน worker/MEDIA_SETUP.md) ระหว่างนี้ใช้ลิงก์รูปแทนได้'), { code: 'NOT_CONFIGURED' });
  if (response.status === 413) throw Object.assign(new Error('ไฟล์ภาพใหญ่เกินไป'), { code: 'TOO_LARGE' });
  if (response.status === 415) throw Object.assign(new Error('รองรับเฉพาะรูป JPG, PNG และ WebP'), { code: 'UNSUPPORTED' });
  if (!response.ok || data.success !== true || typeof data.url !== 'string') throw Object.assign(new Error('อัปโหลดไม่สำเร็จ กรุณาลองใหม่'), { code: 'UPLOAD_FAILED' });
  return data.url;
}
