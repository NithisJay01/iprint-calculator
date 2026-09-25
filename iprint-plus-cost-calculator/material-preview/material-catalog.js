// Notion record identity and shader identity are separate. Never infer a shader from a name/category.
const KEYS = new Set(['smooth', 'uncoated', 'coated', 'kraft', 'pet_matte_white', 'pet_translucent']);
export function resolveMaterial(record = {}) {
  const key = String(record.material3dKey || '').trim();
  const renderer = String(record.previewRenderer || '').trim().toLowerCase();
  const supported = renderer === 'webgl' && KEYS.has(key);
  return { key: supported ? key : 'smooth', fallback: !supported };
}

export async function loadMaterials(apiRoot, fetcher = fetch) {
  if (!apiRoot) throw new Error('ยังไม่ได้ตั้งค่าฐานข้อมูลวัสดุ');
  const response = await fetcher(`${apiRoot.replace(/\/$/, '')}/materials`, {
    cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('โหลดฐานข้อมูลวัสดุไม่สำเร็จ');
  const data = await response.json();
  if (data.success === false || !Array.isArray(data.materials)) throw new Error('ข้อมูลวัสดุไม่ถูกต้อง');
  return data.materials.filter(item => item && item.id && item.name && item.active !== false);
}

// Reset every optical field when switching back from PET to an opaque stock.
export function applyOpticalParams(material, cfg) {
  const transmission = cfg.transmission ?? 0;
  const changed = (material.transmission > 0) !== (transmission > 0);
  material.transmission = transmission;
  material.ior = cfg.ior ?? 1.5;
  material.thickness = cfg.thickness ?? 0;
  material.opacity = 1;
  material.transparent = false;
  if (changed) material.needsUpdate = true;
}
