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
  const sourceQuiz = input?.quiz && typeof input.quiz === 'object' ? input.quiz : {};
  const configuredOptions = Array.isArray(sourceQuiz.options) ? sourceQuiz.options : [];
  const optionKeys = configuredOptions.map(option => String(option?.value || '').trim()).filter(Boolean);
  const allJobTypes = [...new Set([...FLOW_SETTING_JOB_TYPES, ...Object.keys(sourceRules), ...optionKeys])];
  const jobTypes = {};
  allJobTypes.forEach(jobType => {
    const rule = sourceRules[jobType] && typeof sourceRules[jobType] === 'object' ? sourceRules[jobType] : {};
    const uniqueIds = values => [...new Set((Array.isArray(values) ? values : []).map(String).map(value => value.trim()).filter(Boolean))];
    const presetIds = uniqueIds(rule.presetIds);
    const materialIds = Array.isArray(rule.materialIds) ? uniqueIds(rule.materialIds) : ['*'];
    const defaultPresetId = String(rule.defaultPresetId || '').trim();
    if (defaultPresetId && !presetIds.includes(defaultPresetId)) presetIds.unshift(defaultPresetId);
    jobTypes[jobType] = {
      enabled: rule.enabled !== false,
      configured: rule.configured === true,
      presetIds,
      defaultPresetId,
      lockPreset: rule.lockPreset === true,
      materialIds,
      serviceIds: uniqueIds(rule.serviceIds)
    };
  });
  const fallbackOptions = FLOW_SETTING_JOB_TYPES.map(value => ({ value, label: FLOW_SETTING_LABELS[value] || value }));
  const options = (configuredOptions.length ? configuredOptions : fallbackOptions).map(option => ({
    value: String(option?.value || '').trim(),
    label: String(option?.label || option?.value || '').trim()
  })).filter(option => option.value && option.label).slice(0, 20);
  const sourceSteps = sourceQuiz.steps && typeof sourceQuiz.steps === 'object' ? sourceQuiz.steps : {};
  const step = (key, title, description) => ({
    enabled: sourceSteps[key]?.enabled !== false,
    title: String(sourceSteps[key]?.title || title).trim().slice(0, 160),
    description: String(sourceSteps[key]?.description || description).trim().slice(0, 500)
  });
  return {
    version: 2,
    quiz: {
      title: String(sourceQuiz.title || 'งานนี้เป็นงานประเภทอะไร?').trim().slice(0, 160),
      description: String(sourceQuiz.description || 'เลือกคำตอบที่ใกล้เคียงที่สุด เดี๋ยวผมช่วยตั้งค่าเริ่มต้นให้ครับ').trim().slice(0, 500),
      options,
      steps: {
        nickname: step('nickname', 'อยากเรียกงานนี้ว่าอะไร?', 'ชื่อนี้มีไว้สำหรับเป็นชื่อออร์เดอร์หลัก และจะถูกใช้เป็นหัวข้อในการส่งบรีฟงานครับ'),
        delivery: step('delivery', 'อยากรับงานเมื่อไหร่ครับ', 'เลือกวันมารับงานที่ร้านได้เลย หรือถ้าส่งเป็นพัสดุวันอาจคลาดเคลื่อนเล็กน้อยขึ้นอยู่กับบริการขนส่งครับ')
      }
    },
    jobTypes
  };
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

function flowMaterialsForJobType(items, jobType = selectedJobType) {
  const list = Array.isArray(items) ? items : [];
  const rule = getFlowRule(jobType);
  if (!rule?.configured) return list;
  const allowed = new Set(rule.materialIds.map(String));
  if (allowed.has('*')) return list;
  return list.filter(material => allowed.has(String(material.id)));
}

function syncFlowJobTypeVisibility() {
  const normalized = normalizeClientFlowSettings(flowSettings || {});
  const container = $('jobTypeOptions');
  if (!container) return;
  const thumbClass = value => value === 'งานกระดาษ' ? 'paper' : /50/.test(value) ? 'kisscut' : /100/.test(value) ? 'diecut' : 'other';
  container.innerHTML = normalized.quiz.options.filter(option => normalized.jobTypes[option.value]?.enabled !== false).map(option => `<button type="button" data-job-type="${flowEscape(option.value)}" aria-pressed="${selectedJobType === option.value}"><span class="job-type-thumb job-type-thumb-${thumbClass(option.value)}" aria-hidden="true"></span><span>${flowEscape(option.label)}</span></button>`).join('');
  const title = $('jobTypeQuestion');
  const description = title?.nextElementSibling;
  if (title) title.textContent = normalized.quiz.title;
  if (description) description.textContent = normalized.quiz.description;
  const nicknameTitle = $('jobNicknameQuestion');
  const deliveryTitle = $('jobDatesQuestion');
  if (nicknameTitle) nicknameTitle.textContent = normalized.quiz.steps.nickname.title;
  if (nicknameTitle?.nextElementSibling) nicknameTitle.nextElementSibling.textContent = normalized.quiz.steps.nickname.description;
  if (deliveryTitle) deliveryTitle.textContent = normalized.quiz.steps.delivery.title;
  if (deliveryTitle?.nextElementSibling) deliveryTitle.nextElementSibling.textContent = normalized.quiz.steps.delivery.description;
  const enabledSteps = [1, ...(normalized.quiz.steps.nickname.enabled ? [2] : []), ...(normalized.quiz.steps.delivery.enabled ? [3] : [])];
  document.querySelectorAll('[data-job-quiz-step]').forEach(marker => { marker.hidden = !enabledSteps.includes(Number(marker.dataset.jobQuizStep)); });
  enabledSteps.forEach((stepNumber, index) => {
    const panel = document.querySelector(`[data-job-quiz-question="${stepNumber}"]`);
    const counter = panel?.querySelector(':scope > small');
    if (counter) counter.textContent = `คำถาม ${index + 1} จาก ${enabledSteps.length}`;
  });
  document.querySelector('.job-quiz-progress')?.setAttribute('aria-label', `คำถาม ${enabledSteps.length} ข้อ`);
}

function isFlowQuizStepEnabled(step) {
  return normalizeClientFlowSettings(flowSettings || {}).quiz.steps[step]?.enabled !== false;
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(API.staffFlowSettings, {
      method: 'PUT', headers: writeHeaders(), body: JSON.stringify(normalizeClientFlowSettings(settings)), signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || `บันทึก Flow Settings ไม่สำเร็จ (${response.status})`);
    return normalizeClientFlowSettings(data.settings || settings);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('บันทึกไม่สำเร็จ: Worker ตอบกลับช้าเกิน 20 วินาที');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

window.normalizeClientFlowSettings = normalizeClientFlowSettings;
window.getFlowRule = getFlowRule;
window.flowPresetsForJobType = flowPresetsForJobType;
window.flowDefaultPresetId = flowDefaultPresetId;
window.isFlowPresetLocked = isFlowPresetLocked;
window.flowServicesForJobType = flowServicesForJobType;
window.flowMaterialsForJobType = flowMaterialsForJobType;
window.syncFlowJobTypeVisibility = syncFlowJobTypeVisibility;
window.isFlowQuizStepEnabled = isFlowQuizStepEnabled;
