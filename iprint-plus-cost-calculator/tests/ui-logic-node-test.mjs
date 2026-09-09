import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function scriptContext() {
  const context = {
    console,
    document: { readyState: 'loading', addEventListener() {} },
    requestAnimationFrame(callback) { callback(); },
    setTimeout,
    clearTimeout
  };
  context.window = context;
  vm.createContext(context);
  return context;
}

const serviceContext = scriptContext();
vm.runInContext(fs.readFileSync(new URL('../js/services.js', import.meta.url), 'utf8'), serviceContext);
assert.equal(serviceContext.serviceGroupDefinition({ name: 'พิมพ์ 2 หน้า' }).key, 'print');
assert.equal(serviceContext.serviceGroupDefinition({ name: 'เคลือบโฮโลแกรม' }).key, 'lamination');
assert.equal(serviceContext.serviceGroupDefinition({ name: 'เคลือบด้าน Matt Film' }).exclusive, true);
assert.equal(serviceContext.serviceGroupDefinition({ name: 'ไดคัท All Sticker', category: 'Fininshing' }).key, 'cutting');
assert.equal(serviceContext.serviceGroupDefinition({ name: 'ตัด 50%' }).noneLabel, 'ไม่ตัด');
serviceContext.getSelectedJobType = () => 'สติกเกอร์ Die-cut 100%';
assert.equal(serviceContext.isStickerQuizJob(), true);
serviceContext.getSelectedJobType = () => 'งานกระดาษ';
assert.equal(serviceContext.isStickerQuizJob(), false);
assert.equal(serviceContext.isSinglePrintService({ name: 'พิมพ์หน้าเดียว' }), true);
assert.equal(serviceContext.isSinglePrintService({ name: 'พิมพ์ 2 หน้า' }), false);
assert.equal(serviceContext.isDiecutService({ name: 'ไดคัทตัดมุม' }), false);
assert.equal(serviceContext.isDiecutService({ name: 'ไดคัท All Sticker' }), true);
serviceContext.services = [{ id: 'print-single', category: 'รูปแบบการพิมพ์', name: 'พิมพ์หน้าเดียว' }];
serviceContext.selectedServiceIds = {};
assert.equal(serviceContext.hasSelectedPrintService(), false);
serviceContext.selectedServiceIds['print-single'] = true;
assert.equal(serviceContext.hasSelectedPrintService(), true);

const flowSettingsContext = scriptContext();
flowSettingsContext.selectedJobType = 'งานกระดาษ';
flowSettingsContext.flowSettings = null;
flowSettingsContext.presets = {
  paper: { name: '13×19 ตัดเต็มแผ่น Manual' },
  other: { name: 'SRA3' }
};
vm.runInContext(fs.readFileSync(new URL('../js/flow-settings.js', import.meta.url), 'utf8'), flowSettingsContext);
assert.deepEqual(JSON.parse(JSON.stringify(flowSettingsContext.flowPresetsForJobType('งานกระดาษ'))).map(([id]) => id), ['paper']);
assert.equal(flowSettingsContext.flowDefaultPresetId('งานกระดาษ'), 'paper');
assert.equal(flowSettingsContext.isFlowPresetLocked('งานกระดาษ'), true);
flowSettingsContext.flowSettings = flowSettingsContext.normalizeClientFlowSettings({ jobTypes: { 'งานกระดาษ': { configured: true, presetIds: ['other'], defaultPresetId: 'other', lockPreset: false, materialIds: ['material-a'], serviceIds: ['service-a'] } } });
assert.deepEqual(JSON.parse(JSON.stringify(flowSettingsContext.flowServicesForJobType([{ id: 'service-a' }, { id: 'service-b' }], 'งานกระดาษ'))), [{ id: 'service-a' }]);
assert.deepEqual(JSON.parse(JSON.stringify(flowSettingsContext.flowMaterialsForJobType([{ id: 'material-a' }, { id: 'material-b' }], 'งานกระดาษ'))), [{ id: 'material-a' }]);

const previewContext = scriptContext();
vm.runInContext(fs.readFileSync(new URL('../js/material-preview.js', import.meta.url), 'utf8'), previewContext);
assert.deepEqual(
  JSON.parse(JSON.stringify(previewContext.materialPreviewConfig({ services: [{ name: 'เคลือบเงา' }] }))),
  { mode: 'css', effect: 'gloss' }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(previewContext.materialPreviewConfig({ services: [{ name: 'เคลือบโฮโลแกรม' }] }))),
  { mode: 'webgl', effect: 'hologram' }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(previewContext.materialPreviewConfig({ material: { name: 'กระดาษพิเศษ', previewRenderer: 'webgl', shaderPreset: 'gold-foil' } }))),
  { mode: 'webgl', effect: 'foil' }
);

const piecePreviewContext = scriptContext();
vm.runInContext(fs.readFileSync(new URL('../js/piece-preview.js', import.meta.url), 'utf8'), piecePreviewContext);
assert.equal(piecePreviewContext.resolvePiecePreviewInitialSide('front', true), 'front');
assert.equal(piecePreviewContext.resolvePiecePreviewInitialSide('back', true), 'back');
assert.equal(piecePreviewContext.resolvePiecePreviewInitialSide('back', false), 'front');

const capacityContext = scriptContext();
vm.runInContext(fs.readFileSync(new URL('../js/staff-capacity.js', import.meta.url), 'utf8'), capacityContext);
assert.deepEqual(
  JSON.parse(JSON.stringify(capacityContext.capacitySummary([
    { reservedPoints: 4, availablePoints: 16 },
    { reservedPoints: 0, availablePoints: 0, closed: true }
  ]))),
  { total: 20, reserved: 4, available: 16 }
);

const flowContext = scriptContext();
vm.runInContext(fs.readFileSync(new URL('../js/flow.js', import.meta.url), 'utf8'), flowContext);
assert.equal(flowContext.isJobNameSuggestionVisible('สติกเกอร์', 'สติกเกอร์ Die-cut 50%'), true);
assert.equal(flowContext.isJobNameSuggestionVisible('นามบัตร', 'สติกเกอร์ Die-cut 50%'), false);
assert.equal(flowContext.isJobNameSuggestionVisible('สติกเกอร์', 'งานกระดาษ'), false);
assert.equal(flowContext.isJobNameSuggestionVisible('นามบัตร', 'งานกระดาษ'), true);
assert.equal(flowContext.randomJobNickname('นามบัตร', 0), 'นามบัตร ชุดใหม่');
assert.equal(flowContext.randomJobNickname('นามบัตร', 0.999), 'นามบัตร โปรเจกต์');

const quickBriefHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const quickBriefSource = fs.readFileSync(new URL('../js/flow.js', import.meta.url), 'utf8');
const presetSource = fs.readFileSync(new URL('../js/presets.js', import.meta.url), 'utf8');
const materialSource = fs.readFileSync(new URL('../js/materials.js', import.meta.url), 'utf8');
assert.equal((quickBriefHtml.match(/data-quick-step="[1-6]"/g) || []).length, 6);
assert.match(quickBriefHtml, /คำถาม 4 จาก 4/);
assert.match(quickBriefHtml, /ข้อมูลสำคัญครบ พร้อมส่งต่อเพื่อคำนวณและสร้างออร์เดอร์/);
assert.doesNotMatch(quickBriefHtml, /id="quickNarratorMessage"/);
assert.equal((quickBriefHtml.match(/data-quick-job-name-suggestion=/g) || []).length, 7);
assert.match(quickBriefSource, /const QUICK_BRIEF_QUIZ_COUNT = 4/);
assert.doesNotMatch(quickBriefSource, /const QUICK_BRIEF_NARRATION = \[/);
assert.match(quickBriefSource, /Number\.isInteger\(quantity\)/);
assert.match(quickBriefSource, /validQuickBriefSourceLink\(\)/);
assert.match(presetSource, /Preset กระดาษกำหนดไว้ตามประเภทงานที่เลือก/);
assert.doesNotMatch(presetSource, /ไม่สามารถเปลี่ยนได้/);
assert.match(materialSource, /nextButton\.disabled=missing/);
assert.match(quickBriefSource, /button\.dataset\.flowNext === 'brief' && !selectedMaterialId/);
assert.match(quickBriefHtml, /class="preset-preview-guidance"/);
assert.doesNotMatch(quickBriefHtml, /<details class="preview-read-more"/);
assert.match(quickBriefHtml, /layout-settings-lower">\s*<section class="form-card layout-print-services/);
assert.match(quickBriefHtml, /class="layout-form-title">ขนาดชิ้นงาน/);
assert.match(quickBriefHtml, /id="materialSelectionCta"/);
assert.match(materialSource, /classList\.toggle\('is-complete',Boolean\(m\)\)/);
assert.match(quickBriefSource, /function roundedCornerStyle\(width, height\)/);

console.log('UI logic node test passed');
