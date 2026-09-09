export const FLOW_JOB_TYPES = Object.freeze([
  'งานกระดาษ',
  'สติกเกอร์ Die-cut 50%',
  'สติกเกอร์ Die-cut 100%',
  'อื่น ๆ'
]);

export function normalizeFlowSettings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const sourceRules = source.jobTypes && typeof source.jobTypes === 'object' ? source.jobTypes : {};
  const jobTypes = {};

  FLOW_JOB_TYPES.forEach(jobType => {
    const rule = sourceRules[jobType] && typeof sourceRules[jobType] === 'object' ? sourceRules[jobType] : {};
    const uniqueIds = values => [...new Set((Array.isArray(values) ? values : [])
      .map(value => String(value || '').trim()).filter(Boolean))].slice(0, 100);
    const presetIds = uniqueIds(rule.presetIds);
    const serviceIds = uniqueIds(rule.serviceIds);
    let defaultPresetId = String(rule.defaultPresetId || '').trim();
    if (defaultPresetId && !presetIds.includes(defaultPresetId)) presetIds.unshift(defaultPresetId);
    jobTypes[jobType] = {
      enabled: rule.enabled !== false,
      configured: rule.configured === true,
      presetIds,
      defaultPresetId,
      lockPreset: rule.lockPreset === true,
      serviceIds
    };
  });

  return { version: 1, jobTypes };
}

export function validateFlowSettings(input = {}) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) errors.push('settings must be an object');
  const value = normalizeFlowSettings(input);
  Object.entries(value.jobTypes).forEach(([jobType, rule]) => {
    if (rule.lockPreset && !rule.defaultPresetId) errors.push(`${jobType}: locked preset requires a default preset`);
  });
  return { success: errors.length === 0, errors, value };
}
