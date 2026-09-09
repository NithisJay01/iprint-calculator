'use strict';

const FLOW_SETTING_JOB_TYPES = [
  'งานกระดาษ',
  'สติกเกอร์ Die-cut 50%',
  'สติกเกอร์ Die-cut 100%',
  'อื่น ๆ'
];

const FLOW_SETTING_LABELS = {
  'งานกระดาษ': 'งานกระดาษ',
  'สติกเกอร์ Die-cut 50%': 'สติกเกอร์ตัด 50%',
  'สติกเกอร์ Die-cut 100%': 'สติกเกอร์ตัด 100%',
  'อื่น ๆ': 'อื่น ๆ'
};

const FLOW_FALLBACK_PRESET_MATCHERS = {
  'งานกระดาษ': /13\s*[×x*]?\s*19.*(?:manual|ตัดเต็ม|เต็มแผ่น)|(?:manual|ตัดเต็ม|เต็มแผ่น).*13\s*[×x*]?\s*19/i,
  'สติกเกอร์ Die-cut 50%': /13\s*[×x*]?\s*19.*mimaki|mimaki.*13\s*[×x*]?\s*19/i,
  'สติกเกอร์ Die-cut 100%': /13\s*[×x*]?\s*19.*flatblade|flatblade.*13\s*[×x*]?\s*19/i
};

function normalizeClientFlowSettings(input = {}) {
  const sourceRules = input?.jobTypes && typeof input.jobTypes === 'object' ? input.jobTypes : {};
  const jobTypes = {};
  FLOW_SETTING_JOB_TYPES.forEach(jobType => {
    const rule = sourceRules[jobType] && typeof sourceRules[jobType] === 'object' ? sourceRules[jobType] : {};
    const uniqueIds = values => [...new Set((Array.isArray(values) ? values : []).map(String).map(value => value.trim()).filter(Boolean))];
    const presetIds = uniqueIds(rule.presetIds);
    const defaultPresetId = String(rule.defaultPresetId || '').trim();
    if (defaultPresetId && !presetIds.includes(defaultPresetId)) presetIds.unshift(defaultPresetId);
    jobTypes[jobType] = {
      enabled: rule.enabled !== false,
      configured: rule.configured === true,
      presetIds,
      defaultPresetId,
      lockPreset: rule.lockPreset === true,
      serviceIds: uniqueIds(rule.serviceIds)
    };
  });
  return { version: 1, jobTypes };
}

function getFlowRule(jobType = selectedJobType) {
  const normalized = normalizeClientFlowSettings(flowSettings || {});
  const key = String(jobType || '').trim();
  return normalized.jobTypes[key] || (key ? normalized.jobTypes['อื่น ๆ'] : null);
}

function fallbackPresetForJobType(jobType) {
  const matcher = FLOW_FALLBACK_PRESET_MATCHERS[jobType];
  if (!matcher) return null;
  return Object.entries(presets || {}).find(([, preset]) => matcher.test(String(preset?.name || ''))) || null;
}

function flowPresetsForJobType(jobType = selectedJobType) {
  const entries = Object.entries(presets || {});
  const rule = getFlowRule(jobType);
  if (rule?.configured) {
    const allowed = new Set(rule.presetIds);
    const filtered = entries.filter(([id]) => allowed.has(String(id)));
    return filtered.length ? filtered : entries;
  }
  const fallback = fallbackPresetForJobType(jobType);
  return jobType === 'งานกระดาษ' && fallback ? [fallback] : entries;
}

function flowDefaultPresetId(jobType = selectedJobType) {
  const rule = getFlowRule(jobType);
  if (rule?.configured && rule.defaultPresetId && presets[rule.defaultPresetId]) return rule.defaultPresetId;
  return fallbackPresetForJobType(jobType)?.[0] || '';
}

function isFlowPresetLocked(jobType = selectedJobType) {
  const rule = getFlowRule(jobType);
  if (rule?.configured) return rule.lockPreset === true;
  return jobType === 'งานกระดาษ' && Boolean(fallbackPresetForJobType(jobType));
}

function flowServicesForJobType(items, jobType = selectedJobType) {
  const list = Array.isArray(items) ? items : [];
  const rule = getFlowRule(jobType);
  if (!rule?.configured) return list;
  const allowed = new Set(rule.serviceIds.map(String));
  return list.filter(service => allowed.has(String(service.id)));
}

function syncFlowJobTypeVisibility() {
  document.querySelectorAll('[data-job-type]').forEach(button => {
    const rule = getFlowRule(button.dataset.jobType);
    const visible = !rule || rule.enabled !== false;
    button.hidden = !visible;
    button.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });
}

async function syncFlowSettings() {
  try {
    const data = await getJSON(API.flowSettings);
    flowSettings = normalizeClientFlowSettings(data.settings || {});
    cachePut(CACHE.flowSettings, flowSettings);
  } catch (error) {
    const cached = cacheGet(CACHE.flowSettings);
    flowSettings = normalizeClientFlowSettings(cached?.data || {});
    console.error('GET /flow-settings', error);
  }
  syncFlowJobTypeVisibility();
  if (typeof renderPresets === 'function') renderPresets();
  if (typeof renderServices === 'function') renderServices();
  if (typeof calculate === 'function') calculate();
  return flowSettings;
}

async function saveFlowSettingsRemote(settings) {
  const response = await fetch(API.staffFlowSettings, {
    method: 'PUT', headers: writeHeaders(), body: JSON.stringify(normalizeClientFlowSettings(settings))
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || `บันทึก Flow Settings ไม่สำเร็จ (${response.status})`);
  return normalizeClientFlowSettings(data.settings || settings);
}

window.normalizeClientFlowSettings = normalizeClientFlowSettings;
window.getFlowRule = getFlowRule;
window.flowPresetsForJobType = flowPresetsForJobType;
window.flowDefaultPresetId = flowDefaultPresetId;
window.isFlowPresetLocked = isFlowPresetLocked;
window.flowServicesForJobType = flowServicesForJobType;
window.syncFlowJobTypeVisibility = syncFlowJobTypeVisibility;
