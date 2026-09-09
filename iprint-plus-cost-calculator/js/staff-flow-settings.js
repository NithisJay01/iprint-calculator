'use strict';

let staffFlowJobType = 'งานกระดาษ';

function staffFlowEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function staffEffectiveFlowRule(jobType) {
  const rule = getFlowRule(jobType);
  if (rule?.configured) return { ...rule, presetIds: [...rule.presetIds], serviceIds: [...rule.serviceIds] };
  const fallbackPresets = flowPresetsForJobType(jobType);
  const defaultPresetId = flowDefaultPresetId(jobType) || fallbackPresets[0]?.[0] || '';
  return {
    enabled: rule?.enabled !== false,
    configured: false,
    presetIds: fallbackPresets.map(([id]) => String(id)),
    defaultPresetId,
    lockPreset: isFlowPresetLocked(jobType),
    serviceIds: services.map(service => String(service.id))
  };
}

function renderStaffFlowSettings() {
  const rule = staffEffectiveFlowRule(staffFlowJobType);
  const activePresets = Object.entries(presets || {});
  const activeServices = services.filter(service => service.active !== false);
  const serviceGroups = [...new Set(activeServices.map(service => String(service.category || 'บริการเพิ่มเติม')))].sort((a, b) => a.localeCompare(b, 'th'));
  return `<section class="staff-flow-controller" aria-labelledby="staffFlowControllerTitle">
    <div class="staff-flow-controller-head"><div><small>FLOW CONTROLLER</small><h2 id="staffFlowControllerTitle">กำหนดสิ่งที่ลูกค้าเลือกได้</h2></div><span>${rule.configured ? 'ตั้งค่าแล้ว' : 'ใช้ค่าแนะนำ'}</span></div>
    <div class="staff-flow-job-tabs" role="tablist" aria-label="เลือกประเภทงาน">${FLOW_SETTING_JOB_TYPES.map(jobType => `<button type="button" role="tab" data-flow-job-type="${staffFlowEscape(jobType)}" aria-selected="${jobType === staffFlowJobType}" class="${jobType === staffFlowJobType ? 'is-selected' : ''}">${staffFlowEscape(FLOW_SETTING_LABELS[jobType])}</button>`).join('')}</div>
    <label class="staff-flow-master-toggle"><input type="checkbox" data-flow-setting="enabled"${rule.enabled ? ' checked' : ''}><span><strong>แสดงประเภทงานนี้ใน Quiz</strong><small>เมื่อปิด ลูกค้าจะไม่เห็นตัวเลือกนี้ตอนเริ่มงาน</small></span></label>
    <section class="staff-flow-rule-card"><div class="staff-flow-rule-title"><div><small>01</small><h3>Preset หน้ากระดาษ</h3></div><label><input type="checkbox" data-flow-setting="lockPreset"${rule.lockPreset ? ' checked' : ''}> ล็อกไม่ให้ลูกค้าเปลี่ยน</label></div>
      <p>เลือก Preset ที่ใช้ได้ และกำหนดค่าเริ่มต้นหนึ่งรายการ</p>
      <div class="staff-flow-preset-list">${activePresets.map(([id, preset]) => {
        const allowed = rule.presetIds.includes(String(id));
        const selected = rule.defaultPresetId === String(id);
        return `<article class="staff-flow-preset-row${allowed ? ' is-allowed' : ''}"><label><input type="checkbox" data-flow-preset-allowed="${staffFlowEscape(id)}"${allowed ? ' checked' : ''}><span><strong>${staffFlowEscape(preset.name)}</strong><small>${Number(preset.fullW)} × ${Number(preset.fullH)} cm • ${staffFlowEscape(preset.type || 'Preset')}</small></span></label><label class="staff-flow-default"><input type="radio" name="staffFlowDefaultPreset" data-flow-preset-default="${staffFlowEscape(id)}"${selected ? ' checked' : ''}> ค่าเริ่มต้น</label></article>`;
      }).join('') || '<p class="staff-catalog-empty">ไม่พบ Preset ที่เปิดใช้งาน</p>'}</div>
    </section>
    <section class="staff-flow-rule-card"><div class="staff-flow-rule-title"><div><small>02</small><h3>บริการที่แสดงใน Flow</h3></div><span>${rule.serviceIds.length}/${activeServices.length} รายการ</span></div>
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
  return {
    enabled: container.querySelector('[data-flow-setting="enabled"]')?.checked !== false,
    configured: true,
    presetIds,
    defaultPresetId,
    lockPreset: container.querySelector('[data-flow-setting="lockPreset"]')?.checked === true,
    serviceIds
  };
}

async function handleStaffFlowSettingsAction(event) {
  const jobTypeButton = event.target.closest('[data-flow-job-type]');
  if (jobTypeButton) {
    staffFlowJobType = jobTypeButton.dataset.flowJobType;
    renderStaffCatalog();
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
  const nextRule = collectStaffFlowRule(container);
  if (nextRule.enabled && (!nextRule.presetIds.length || !nextRule.defaultPresetId)) {
    setStaffCatalogNotice('กรุณาเลือก Preset ที่อนุญาตและค่าเริ่มต้นอย่างน้อย 1 รายการ', 'warn');
    return true;
  }
  const selectedServices = services.filter(service => nextRule.serviceIds.includes(String(service.id)));
  if (nextRule.enabled && !selectedServices.some(service => typeof isPrintSideService === 'function' && isPrintSideService(service))) {
    setStaffCatalogNotice('Flow ที่เปิดใช้งานต้องมีรูปแบบการพิมพ์อย่างน้อย 1 รายการ', 'warn');
    return true;
  }
  if (nextRule.enabled && /สติกเกอร์|sticker/i.test(staffFlowJobType) && !selectedServices.some(service => typeof isDiecutService === 'function' && isDiecutService(service))) {
    setStaffCatalogNotice('Flow สติกเกอร์ต้องมีบริการไดคัทอย่างน้อย 1 รายการ', 'warn');
    return true;
  }
  if (nextRule.lockPreset) nextRule.presetIds = [nextRule.defaultPresetId];
  const nextSettings = normalizeClientFlowSettings(flowSettings || {});
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
    renderServices();
    renderStaffCatalog();
    setStaffCatalogNotice(`บันทึก Flow “${FLOW_SETTING_LABELS[staffFlowJobType]}” แล้ว`, 'ok');
  } catch (error) {
    setStaffCatalogNotice(error.message || 'บันทึก Flow ไม่สำเร็จ', 'warn');
  }
  return true;
}

window.renderStaffFlowSettings = renderStaffFlowSettings;
window.handleStaffFlowSettingsAction = handleStaffFlowSettingsAction;
