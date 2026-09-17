import { emptySettings, newProduct, validateSettings } from './product-pricing.js';
export const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
export const STORAGE_KEY = 'iprint-product-pricing-preview-v1';
const API = 'https://iprint-flow-api.iprint-garphic1.workers.dev';
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
  if (LOCAL) return (await import('./preview-catalog.js')).catalog;
  const [materials, services] = await Promise.all(['materials', 'services'].map(async path => {
    const response = await fetch(`${API}/${path}`);
    if (!response.ok) throw new Error('โหลด Catalog ไม่สำเร็จ');
    return (await response.json())[path].filter(item => item.active !== false);
  }));
  return { materials, services };
}
