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

console.log('UI logic node test passed');
