'use strict';

let staffFlowJobType = 'งานกระดาษ';

function staffFlowEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function staffEffectiveFlowRule(jobType) {
  const rule = getFlowRule(jobType);
  if (rule?.configured) return { ...rule, presetIds: [...rule.presetIds], materialIds: rule.materialIds.includes('*') ? materials.map(material => String(material.id)) : [...rule.materialIds], serviceIds: [...rule.serviceIds] };
  const fallbackPresets = flowPresetsForJobType(jobType);
  const defaultPresetId = flowDefaultPresetId(jobType) || fallbackPresets[0]?.[0] || '';
  return {
    enabled: rule?.enabled !== false,
    configured: false,
    presetIds: fallbackPresets.map(([id]) => String(id)),
    defaultPresetId,
    lockPreset: isFlowPresetLocked(jobType),
    materialIds: materials.map(material => String(material.id)),
    serviceIds: services.map(service => String(service.id))
  };
}

function renderStaffFlowSettings() {
  const normalizedSettings = normalizeClientFlowSettings(flowSettings || {});
  const quizOptions = normalizedSettings.quiz.options;
  if (!quizOptions.some(option => option.value === staffFlowJobType)) staffFlowJobType = quizOptions[0]?.value || 'งานกระดาษ';
  const rule = staffEffectiveFlowRule(staffFlowJobType);
  const activePresets = Object.entries(presets || {});
  const activeServices = services.filter(service => service.active !== false);
  const activeMaterials = materials.filter(material => material.active !== false);
  const serviceGroups = [...new Set(activeServices.map(service => String(service.category || 'บริการเพิ่มเติม')))].sort((a, b) => a.localeCompare(b, 'th'));
  const currentOption = quizOptions.find(option => option.value === staffFlowJobType) || { value: staffFlowJobType, label: staffFlowJobType };
  return `<section class="staff-flow-controller" aria-labelledby="staffFlowControllerTitle">
    <div class="staff-flow-controller-head"><div><small>FLOW CONTROLLER</small><h2 id="staffFlowControllerTitle">กำหนดสิ่งที่ลูกค้าเลือกได้</h2></div><span>${rule.configured ? 'ตั้งค่าแล้ว' : 'ใช้ค่าแนะนำ'}</span></div>
    <div class="staff-flow-node-map" aria-label="โครงสร้าง Flow"><article><b>เริ่ม</b><small>ลูกค้าเริ่มงาน</small></article><i>→</i><article class="is-active"><b>Quiz</b><small>${quizOptions.length} ตัวเลือก</small></article><i>→</i><article><b>Preset</b><small>${rule.presetIds.length} รายการ</small></article><i>→</i><article><b>วัสดุ</b><small>${rule.materialIds.length} รายการ</small></article><i>→</i><article><b>บริการ</b><small>${rule.serviceIds.length} รายการ</small></article><i>→</i><article><b>Layout</b><small>คำนวณราคา</small></article></div>
    <section class="staff-flow-rule-card staff-flow-quiz-editor"><div class="staff-flow-rule-title"><div><small>Q</small><h3>แก้ไข Quiz</h3></div><span>เพิ่ม ลด หรือเปลี่ยนข้อความได้</span></div><div class="field"><label class="label" for="staffFlowQuizTitle">คำถามประเภทงาน</label><input id="staffFlowQuizTitle" data-flow-quiz="title" maxlength="160" value="${staffFlowEscape(normalizedSettings.quiz.title)}"></div><div class="field"><label class="label" for="staffFlowQuizDescription">คำอธิบาย</label><textarea id="staffFlowQuizDescription" data-flow-quiz="description" maxlength="500">${staffFlowEscape(normalizedSettings.quiz.description)}</textarea></div><div class="staff-flow-quiz-step-list">${[['nickname','ชื่องาน'],['delivery','วันรับงาน']].map(([key,label]) => { const step = normalizedSettings.quiz.steps[key]; return `<article><label class="staff-flow-step-toggle"><input type="checkbox" data-flow-step-enabled="${key}"${step.enabled ? ' checked' : ''}><span>แสดงคำถาม ${label}</span></label><input data-flow-step-title="${key}" maxlength="160" value="${staffFlowEscape(step.title)}"><textarea data-flow-step-description="${key}" maxlength="500">${staffFlowEscape(step.description)}</textarea></article>`; }).join('')}</div><div class="staff-flow-add-option"><input data-flow-new-option maxlength="120" placeholder="ชื่อตัวเลือกประเภทงานใหม่"><button type="button" data-flow-setting-action="add-option">+ เพิ่มตัวเลือก</button></div></section>
    <div class="staff-flow-job-tabs" role="tablist" aria-label="เลือกประเภทงาน">${quizOptions.map(option => `<button type="button" role="tab" data-flow-job-type="${staffFlowEscape(option.value)}" aria-selected="${option.value === staffFlowJobType}" class="${option.value === staffFlowJobType ? 'is-selected' : ''}">${staffFlowEscape(option.label)}</button>`).join('')}</div>
    <div class="staff-flow-option-editor"><label><span>ชื่อที่แสดงใน Quiz</span><input data-flow-option-label maxlength="120" value="${staffFlowEscape(currentOption.label)}"></label><button type="button" data-flow-setting-action="delete-option"${quizOptions.length <= 1 ? ' disabled' : ''}>ลบตัวเลือกนี้</button></div>
    <label class="staff-flow-master-toggle"><input type="checkbox" data-flow-setting="enabled"${rule.enabled ? ' checked' : ''}><span><strong>แสดงประเภทงานนี้ใน Quiz</strong><small>เมื่อปิด ลูกค้าจะไม่เห็นตัวเลือกนี้ตอนเริ่มงาน</small></span></label>
    <section class="staff-flow-rule-card"><div class="staff-flow-rule-title"><div><small>01</small><h3>Preset หน้ากระดาษ</h3></div><label><input type="checkbox" data-flow-setting="lockPreset"${rule.lockPreset ? ' checked' : ''}> ล็อกไม่ให้ลูกค้าเปลี่ยน</label></div>
      <p>เลือก Preset ที่ใช้ได้ และกำหนดค่าเริ่มต้นหนึ่งรายการ</p>
      <div class="staff-flow-preset-list">${activePresets.map(([id, preset]) => {
        const allowed = rule.presetIds.includes(String(id));
        const selected = rule.defaultPresetId === String(id);
        return `<article class="staff-flow-preset-row${allowed ? ' is-allowed' : ''}"><label><input type="checkbox" data-flow-preset-allowed="${staffFlowEscape(id)}"${allowed ? ' checked' : ''}><span><strong>${staffFlowEscape(preset.name)}</strong><small>${Number(preset.fullW)} × ${Number(preset.fullH)} cm • ${staffFlowEscape(preset.type || 'Preset')}</small></span></label><label class="staff-flow-default"><input type="radio" name="staffFlowDefaultPreset" data-flow-preset-default="${staffFlowEscape(id)}"${selected ? ' checked' : ''}> ค่าเริ่มต้น</label></article>`;
      }).join('') || '<p class="staff-catalog-empty">ไม่พบ Preset ที่เปิดใช้งาน</p>'}</div>
    </section>
    <section class="staff-flow-rule-card"><div class="staff-flow-rule-title"><div><small>02</small><h3>วัสดุที่แสดงใน Flow</h3></div><span>${rule.materialIds.length}/${activeMaterials.length} รายการ</span></div>
      <p>เลือกวัสดุที่ลูกค้าสามารถใช้กับประเภทงานนี้ วัสดุที่ปิดใน Catalog จะไม่แสดง</p>
      <div class="staff-flow-material-list">${activeMaterials.map(material => `<label><input type="checkbox" data-flow-material-id="${staffFlowEscape(material.id)}"${rule.materialIds.includes(String(material.id)) ? ' checked' : ''}><span><strong>${staffFlowEscape(material.name)}</strong><small>฿${money(material.price)} / ${staffFlowEscape(unit(material.unit))}</small></span></label>`).join('') || '<p class="staff-catalog-empty">ไม่พบวัสดุที่เปิดใช้งาน</p>'}</div>
    </section>
    <section class="staff-flow-rule-card"><div class="staff-flow-rule-title"><div><small>03</small><h3>บริการที่แสดงใน Flow</h3></div><span>${rule.serviceIds.length}/${activeServices.length} รายการ</span></div>
      <p>บริการที่ปิดใน Catalog จะไม่แสดง แม้เลือกไว้ในส่วนนี้</p>
      <div class="staff-flow-service-groups">${serviceGroups.map(category => `<fieldset><legend>${staffFlowEscape(category)}</legend>${activeServices.filter(service => String(service.category || 'บริการเพิ่มเติม') === category).map(service => `<label><input type="checkbox" data-flow-service-id="${staffFlowEscape(service.id)}"${rule.serviceIds.includes(String(service.id)) ? ' checked' : ''}><span>${staffFlowEscape(service.name)}</span></label>`).join('')}</fieldset>`).join('')}</div>
    </section>
    <div class="staff-flow-save-bar"><p>กฎนี้จะมีผลกับหน้าเลือกงาน, Preset และบริการของลูกค้า</p><button class="primary-action" type="button" data-flow-setting-action="save">บันทึก Flow</button></div>
  </section>`;
}

function collectStaffFlowRule(container) {
  const presetIds = [...container.querySelectorAll('[data-flow-preset-allowed]:checked')].map(input => input.dataset.flowPresetAllowed);
  const defaultPresetId = container.querySelector('[data-flow-preset-default]:checked')?.dataset.flowPresetDefault || '';
  const serviceIds = [...container.querySelectorAll('[data-flow-service-id]:checked')].map(input => input.dataset.flowServiceId);
  const materialIds = [...container.querySelectorAll('[data-flow-material-id]:checked')].map(input => input.dataset.flowMaterialId);
  return {
    enabled: container.querySelector('[data-flow-setting="enabled"]')?.checked !== false,
    configured: true,
    presetIds,
    defaultPresetId,
    lockPreset: container.querySelector('[data-flow-setting="lockPreset"]')?.checked === true,
    materialIds,
    serviceIds
  };
}

async function handleStaffFlowSettingsAction(event) {
  const jobTypeButton = event.target.closest('[data-flow-job-type]');
  if (jobTypeButton) {
    const container = event.target.closest('.staff-flow-controller');
    const draft = normalizeClientFlowSettings(flowSettings || {});
    draft.quiz.title = container?.querySelector('[data-flow-quiz="title"]')?.value.trim() || draft.quiz.title;
    draft.quiz.description = container?.querySelector('[data-flow-quiz="description"]')?.value.trim() || '';
    const currentLabel = container?.querySelector('[data-flow-option-label]')?.value.trim();
    const currentOption = draft.quiz.options.find(option => option.value === staffFlowJobType);
    if (currentOption && currentLabel) currentOption.label = currentLabel;
    flowSettings = normalizeClientFlowSettings(draft);
    staffFlowJobType = jobTypeButton.dataset.flowJobType;
    renderStaffCatalog();
    return true;
  }
  if (event.target.closest('[data-flow-setting-action="add-option"]')) {
    const input = event.target.closest('.staff-flow-controller')?.querySelector('[data-flow-new-option]');
    const label = String(input?.value || '').trim();
    if (!label) return true;
    const nextSettings = normalizeClientFlowSettings(flowSettings || {});
    const value = `custom-${Date.now()}`;
    nextSettings.quiz.options.push({ value, label });
    nextSettings.jobTypes[value] = { enabled: true, configured: false, presetIds: [], defaultPresetId: '', lockPreset: false, materialIds: [], serviceIds: [] };
    flowSettings = normalizeClientFlowSettings(nextSettings);
    staffFlowJobType = value;
    renderStaffCatalog();
    setStaffCatalogNotice(`เพิ่มตัวเลือก Quiz “${label}” แล้ว กดบันทึก Flow เพื่อยืนยัน`, 'ok');
    return true;
  }
  if (event.target.closest('[data-flow-setting-action="delete-option"]')) {
    const nextSettings = normalizeClientFlowSettings(flowSettings || {});
    nextSettings.quiz.options = nextSettings.quiz.options.filter(option => option.value !== staffFlowJobType);
    delete nextSettings.jobTypes[staffFlowJobType];
    flowSettings = normalizeClientFlowSettings(nextSettings);
    staffFlowJobType = flowSettings.quiz.options[0]?.value || 'งานกระดาษ';
    renderStaffCatalog();
    setStaffCatalogNotice('นำตัวเลือกออกจาก Quiz แล้ว กดบันทึก Flow เพื่อยืนยัน', 'ok');
    return true;
  }
  const allowedControl = event.target.closest('[data-flow-preset-allowed]');
  if (allowedControl && !allowedControl.checked) {
    const defaultControl = document.querySelector(`[data-flow-preset-default="${CSS.escape(allowedControl.dataset.flowPresetAllowed)}"]`);
    if (defaultControl?.checked) defaultControl.checked = false;
    return true;
  }
  const defaultControl = event.target.closest('[data-flow-preset-default]');
  if (defaultControl) {
    const allowed = document.querySelector(`[data-flow-preset-allowed="${CSS.escape(defaultControl.dataset.flowPresetDefault)}"]`);
    if (allowed) allowed.checked = true;
    return true;
  }
  if (!event.target.closest('[data-flow-setting-action="save"]')) return false;
  const container = event.target.closest('.staff-flow-controller');
  const saveButton = event.target.closest('[data-flow-setting-action="save"]');
  saveButton.disabled = true;
  saveButton.textContent = 'กำลังบันทึก…';
  setStaffCatalogNotice('กำลังบันทึก Flow กรุณารอสักครู่', 'ok');
  const nextRule = collectStaffFlowRule(container);
  if (nextRule.enabled && (!nextRule.presetIds.length || !nextRule.defaultPresetId)) {
    saveButton.disabled = false;
    saveButton.textContent = 'บันทึก Flow';
    setStaffCatalogNotice('กรุณาเลือก Preset ที่อนุญาตและค่าเริ่มต้นอย่างน้อย 1 รายการ', 'warn');
    return true;
  }
  const selectedServices = services.filter(service => nextRule.serviceIds.includes(String(service.id)));
  if (nextRule.enabled && !nextRule.materialIds.length) {
    saveButton.disabled = false;
    saveButton.textContent = 'บันทึก Flow';
    setStaffCatalogNotice('Flow ที่เปิดใช้งานต้องมีวัสดุอย่างน้อย 1 รายการ', 'warn');
    return true;
  }
  if (nextRule.enabled && !selectedServices.some(service => typeof isPrintSideService === 'function' && isPrintSideService(service))) {
    saveButton.disabled = false;
    saveButton.textContent = 'บันทึก Flow';
    setStaffCatalogNotice('Flow ที่เปิดใช้งานต้องมีรูปแบบการพิมพ์อย่างน้อย 1 รายการ', 'warn');
    return true;
  }
  if (nextRule.enabled && /สติกเกอร์|sticker/i.test(staffFlowJobType) && !selectedServices.some(service => typeof isDiecutService === 'function' && isDiecutService(service))) {
    saveButton.disabled = false;
    saveButton.textContent = 'บันทึก Flow';
    setStaffCatalogNotice('Flow สติกเกอร์ต้องมีบริการไดคัทอย่างน้อย 1 รายการ', 'warn');
    return true;
  }
  if (nextRule.lockPreset) nextRule.presetIds = [nextRule.defaultPresetId];
  const nextSettings = normalizeClientFlowSettings(flowSettings || {});
  nextSettings.quiz.title = container.querySelector('[data-flow-quiz="title"]')?.value.trim() || nextSettings.quiz.title;
  nextSettings.quiz.description = container.querySelector('[data-flow-quiz="description"]')?.value.trim() || '';
  ['nickname', 'delivery'].forEach(key => {
    nextSettings.quiz.steps[key].enabled = container.querySelector(`[data-flow-step-enabled="${key}"]`)?.checked !== false;
    nextSettings.quiz.steps[key].title = container.querySelector(`[data-flow-step-title="${key}"]`)?.value.trim() || nextSettings.quiz.steps[key].title;
    nextSettings.quiz.steps[key].description = container.querySelector(`[data-flow-step-description="${key}"]`)?.value.trim() || '';
  });
  const optionLabel = container.querySelector('[data-flow-option-label]')?.value.trim();
  const option = nextSettings.quiz.options.find(item => item.value === staffFlowJobType);
  if (option && optionLabel) option.label = optionLabel;
  nextSettings.jobTypes[staffFlowJobType] = nextRule;
  try {
    if (IPRINT_TEST_MODE) {
      flowSettings = normalizeClientFlowSettings(nextSettings);
      cachePut(CACHE.flowSettings, flowSettings);
    } else {
      flowSettings = await saveFlowSettingsRemote(nextSettings);
    }
    syncFlowJobTypeVisibility();
    renderPresets();
    renderMaterials();
    renderServices();
    renderStaffCatalog();
    const savedLabel = flowSettings.quiz.options.find(option => option.value === staffFlowJobType)?.label || FLOW_SETTING_LABELS[staffFlowJobType] || staffFlowJobType;
    setStaffCatalogNotice(`บันทึก Flow “${savedLabel}” แล้ว`, 'ok');
  } catch (error) {
    if (saveButton.isConnected) {
      saveButton.disabled = false;
      saveButton.textContent = 'บันทึก Flow';
    }
    setStaffCatalogNotice(error.message || 'บันทึก Flow ไม่สำเร็จ', 'warn');
  }
  return true;
}

window.renderStaffFlowSettings = renderStaffFlowSettings;
window.handleStaffFlowSettingsAction = handleStaffFlowSettingsAction;
