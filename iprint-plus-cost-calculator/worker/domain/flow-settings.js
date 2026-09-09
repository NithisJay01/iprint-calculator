export const FLOW_JOB_TYPES = Object.freeze([
  'งานกระดาษ',
  'สติกเกอร์ Die-cut 50%',
  'สติกเกอร์ Die-cut 100%',
  'อื่น ๆ'
]);

export function normalizeFlowSettings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const sourceRules = source.jobTypes && typeof source.jobTypes === 'object' ? source.jobTypes : {};
  const sourceQuiz = source.quiz && typeof source.quiz === 'object' ? source.quiz : {};
  const configuredOptions = Array.isArray(sourceQuiz.options) ? sourceQuiz.options : [];
  const optionKeys = configuredOptions.map(option => String(option?.value || '').trim()).filter(Boolean);
  const jobTypes = {};

  [...new Set([...FLOW_JOB_TYPES, ...Object.keys(sourceRules), ...optionKeys])].forEach(jobType => {
    const rule = sourceRules[jobType] && typeof sourceRules[jobType] === 'object' ? sourceRules[jobType] : {};
    const uniqueIds = values => [...new Set((Array.isArray(values) ? values : [])
      .map(value => String(value || '').trim()).filter(Boolean))].slice(0, 100);
    const presetIds = uniqueIds(rule.presetIds);
    const serviceIds = uniqueIds(rule.serviceIds);
    const materialIds = Array.isArray(rule.materialIds) ? uniqueIds(rule.materialIds) : ['*'];
    let defaultPresetId = String(rule.defaultPresetId || '').trim();
    if (defaultPresetId && !presetIds.includes(defaultPresetId)) presetIds.unshift(defaultPresetId);
    jobTypes[jobType] = {
      enabled: rule.enabled !== false,
      configured: rule.configured === true,
      presetIds,
      defaultPresetId,
      lockPreset: rule.lockPreset === true,
      materialIds,
      serviceIds
    };
  });

  const fallbackOptions = FLOW_JOB_TYPES.map(value => ({ value, label: value.replace('สติกเกอร์ Die-cut', 'สติกเกอร์ตัด') }));
  const options = (configuredOptions.length ? configuredOptions : fallbackOptions).map(option => ({
    value: String(option?.value || '').trim().slice(0, 120),
    label: String(option?.label || option?.value || '').trim().slice(0, 120)
  })).filter(option => option.value && option.label).slice(0, 20);
  const sourceSteps = sourceQuiz.steps && typeof sourceQuiz.steps === 'object' ? sourceQuiz.steps : {};
  const step = (key, title, description) => ({ enabled: sourceSteps[key]?.enabled !== false,
    title: String(sourceSteps[key]?.title || title).trim().slice(0, 160),
    description: String(sourceSteps[key]?.description || description).trim().slice(0, 500) });
  return { version: 2, quiz: {
    title: String(sourceQuiz.title || 'งานนี้เป็นงานประเภทอะไร?').trim().slice(0, 160),
    description: String(sourceQuiz.description || 'เลือกคำตอบที่ใกล้เคียงที่สุด เดี๋ยวผมช่วยตั้งค่าเริ่มต้นให้ครับ').trim().slice(0, 500),
    options,
    steps: {
      nickname: step('nickname', 'อยากเรียกงานนี้ว่าอะไร?', 'ชื่อนี้มีไว้สำหรับเป็นชื่อออร์เดอร์หลัก และจะถูกใช้เป็นหัวข้อในการส่งบรีฟงานครับ'),
      delivery: step('delivery', 'อยากรับงานเมื่อไหร่ครับ', 'เลือกวันมารับงานที่ร้านได้เลย หรือถ้าส่งเป็นพัสดุวันอาจคลาดเคลื่อนเล็กน้อยขึ้นอยู่กับบริการขนส่งครับ')
    }
  }, jobTypes };
}

export function validateFlowSettings(input = {}) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) errors.push('settings must be an object');
  const value = normalizeFlowSettings(input);
  Object.entries(value.jobTypes).forEach(([jobType, rule]) => {
    if (rule.lockPreset && !rule.defaultPresetId) errors.push(`${jobType}: locked preset requires a default preset`);
  });
  if (!value.quiz.options.length) errors.push('quiz must have at least one option');
  return { success: errors.length === 0, errors, value };
}
