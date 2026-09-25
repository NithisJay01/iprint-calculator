import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The "check the position" pop-up of the 3D preview: paper size inside it, "edit position" buttons for the front, the
// back and the special-technique shape, the request summary as bullets, and no crop marks toggle.
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

// ---------- the request summary: one fact per line ----------
const { requestSummary, requestSummaryItems, REQUEST_SUMMARY_NOTE } = await import('../shared/print-request.js');
const request = (extra = {}, spec = {}) => ({
  jobName: 'Business-Card', quantity: 100, hasBack: false, materialName: 'อาร์ตด้าน 300g',
  spec: { paper: 'smooth', coating: 'none', finish: 'none', kind: 'rect', width: 90, height: 54, radius: 3, bleed: 3, ...spec }, ...extra
});
let items = requestSummaryItems(request());
assert.deepEqual(items, [
  'งาน: Business-Card', 'จำนวน: 100 ใบ', 'การพิมพ์: ด้านหน้า', 'ขนาด: 90 × 54 mm', 'รูปทรง: สี่เหลี่ยม', 'Bleed: 3 mm',
  'วัสดุ: อาร์ตด้าน 300g', 'เคลือบ: ไม่เคลือบ', 'เทคนิคด้านหน้า: ไม่มี'
], 'each fact is its own line');
assert.ok(items.every(item => !item.includes('\n') && !item.includes(' · ')), 'a line holds one fact, not several joined together');
assert.equal(REQUEST_SUMMARY_NOTE, 'รอทีมงานยืนยันวัสดุ ราคา และวันผลิตก่อนเริ่มงาน');
items = requestSummaryItems(request({ hasBack: true, quantity: 1500 }, { kind: 'rounded', radius: 4 }));
assert.ok(items.includes('การพิมพ์: หน้า–หลัง'));
assert.ok(items.includes('มุมโค้ง: 4 mm'), 'a rounded card lists its corner radius');
assert.ok(items.includes('ด้านหลัง: พิมพ์สี ไม่มีเทคนิคพิเศษ'));
assert.ok(items.includes('จำนวน: 1,500 ใบ'));
assert.ok(!requestSummaryItems(request()).some(item => item.startsWith('มุมโค้ง')), 'no corner radius on a square card');

// the text the Worker writes into the Notion brief (and LINE) is NOT changed by the pop-up's bullets
const text = requestSummary(request({ hasBack: true }));
assert.match(text, /งาน Business-Card · 100 ใบ · พิมพ์หน้า–หลัง/, 'the brief keeps its original wording');
assert.match(text, /90 × 54 mm · สี่เหลี่ยม · Bleed 3 mm/);
assert.ok(text.endsWith('รอทีมงานยืนยันวัสดุ ราคา และวันผลิตก่อนเริ่มงาน'));
assert.equal(text.split('\n').length, 4);

// ---------- layers.setPlacement: move a file that is already loaded ----------
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
const { createLayers } = await import('../material-preview/layers.js');
const setSpecCalls = [];
const makeCard = () => {
  const card = {
    spec: { bounds: { w: 90, h: 54 } }, view: { rings: [], bounds: {} }, artwork: { demo: () => ({ print: {}, shape: null }) },
    failNext: false,
    async setSpec(spec) { setSpecCalls.push(spec); if (card.failNext) { card.failNext = false; throw new Error('cannot draw'); } card.spec = spec; }
  };
  return card;
};
const card = makeCard();
const layers = createLayers({ card, studio: { setShape() {} } });
const placement = { base: 'fill', zoom: 1.25, dx: 2, dy: -1 };

await layers.setPlacement('art', placement); // nothing loaded yet: nothing happens
assert.equal(setSpecCalls.length, 0, 'no file in that slot: the card is left alone');

layers.state.art = { name: 'front.svg', aspect: 1.6, placement: null, render: async () => ({}) };
layers.state.backArt = { name: 'back.png', aspect: 1.6, placement: null, render: async () => ({}) };
layers.state.mask = { name: 'foil.png', aspect: 1.6, placement: null, render: async () => ({}) };
await layers.setPlacement('art', placement);
assert.deepEqual(layers.state.art.placement, placement, 'the front sits where the customer put it');
assert.equal(setSpecCalls.length, 1, 'and the card is drawn again once');
assert.equal(layers.state.backArt.placement, null, 'the other files are untouched');
assert.equal(layers.state.mask.placement, null);
await layers.setPlacement('backArt', { base: 'fit', zoom: 0.8, dx: 0, dy: 0 });
await layers.setPlacement('mask', { base: 'fit', zoom: 1, dx: 1, dy: 1 });
assert.equal(layers.state.backArt.placement.zoom, 0.8);
assert.equal(layers.state.mask.placement.dx, 1);
await layers.setPlacement('art', null);
assert.equal(layers.state.art.placement, null, 'null puts the file back to automatic');
assert.equal(layers.exportSources().art.placement, null, 'and the export sees the same placement');
await layers.setPlacement('mask', placement);
assert.deepEqual(layers.exportSources().mask.placement, placement, 'the export uses the placement chosen in the pop-up');

card.failNext = true;
await assert.rejects(layers.setPlacement('art', placement), /cannot draw/, 'a card that cannot be drawn reports it');
assert.equal(layers.state.art.placement, null, 'and the previous placement is kept');

// ---------- the pages: wiring ----------
const [html, panelJs, requestJs, css] = ['../material-preview/index.html', '../material-preview/panel.js', '../material-preview/request-print.js', '../material-preview/style.css'].map(read);

// crop marks: the toggle is gone and nothing switches them on
assert.ok(!/exportMarks/.test(html + panelJs + requestJs), 'the crop marks toggle is removed');
assert.ok(!/cropMarks\s*:\s*true/.test(panelJs + requestJs), 'exports never switch crop marks on');
assert.match(panelJs, /const exportOptions = \(\) => \(\{ colorMode: \$\('#exportColor'\)\.value, jobPage: \$\('#exportJob'\)\.checked \}\)/);

// summary as a list
assert.match(html, /<ul class="request-summary" id="requestSummary">/);
assert.match(requestJs, /requestSummaryItems\(payload\(\)\)/, 'the pop-up lists the facts one per line');
assert.ok(requestJs.includes('item.textContent = text;'), 'each bullet shows exactly one fact');

// paper size inside the pop-up
for (const id of ['artCheckPreset', 'artCheckW', 'artCheckH', 'artCheckSize']) assert.ok(html.includes(`id="${id}"`), `${id} is in the pop-up`);
assert.match(panelJs, /layers\.setShape\(\{ width: w \* 10, height: h \* 10 \}\)/, 'the size typed in the pop-up sets the card size (cm to mm)');
assert.match(panelJs, /SIZE_PRESETS\.map\(\(p\) => new Option\(p\.label, p\.id\)\)/, 'the same presets as the size panel');
assert.match(panelJs, /\$\('#artCheckSize'\)\.hidden = custom/, 'a die-cut file decides its own size: the fields are hidden');
assert.match(panelJs, /layers\.setShape\(\{ width: original\.width, height: original\.height \}\)/, 'leaving without using the file puts the size back');
assert.match(panelJs, /const original = resolve && !use && check\?\.size;/, 'only when the answer was still pending (closing after "use" keeps the size)');
assert.match(panelJs, /open\.underlay = await renderUnderlay\(layers\.state\.art, open\.spec\)/, 'the special-technique pop-up redraws the printed front for the new size');

// edit position: front, back and special technique
for (const id of ['frontEdit', 'backEdit', 'maskEdit']) {
  assert.ok(html.includes(`id="${id}"`), `${id} button exists`);
  assert.ok(new RegExp(`id="${id}"[^>]*hidden`).test(html), `${id} is hidden until there is a file`);
  assert.ok(panelJs.includes(`$('#${id}').addEventListener('click', () => act(() => editPosition('${id.replace('Edit', '')}')))`), `${id} opens the pop-up`);
}
assert.match(panelJs, /\$\('#frontEdit'\)\.hidden = !d\.artName/);
assert.match(panelJs, /\$\('#backEdit'\)\.hidden = !d\.backArtName/);
assert.match(panelJs, /\$\('#maskEdit'\)\.hidden = !d\.maskName/);
assert.match(panelJs, /await layers\.setPlacement\(slot, ok\.placement\)/, 'saving the position only moves the file, nothing is uploaded again');
assert.match(panelJs, /if \(side === 'front'\) mine\.frontPlacement = ok\.placement/, 'switching back to "การ์ดของคุณ" keeps the edited position');
assert.match(panelJs, /if \(side === 'back'\) mine\.backPlacement = ok\.placement/);
assert.match(panelJs, /\$\('#artCheckAgain'\)\.hidden = edit/, '"choose another file" is only for a new file');
assert.match(panelJs, /edit \? 'บันทึกตำแหน่ง' : 'ใช้ภาพนี้'/);
assert.match(panelJs, /layer\.dispose\?\.\(\); \/\/ read only for this pop-up/, 'a file read only for the pop-up is released');
assert.ok(!/editPosition[\s\S]{0,400}dispose/.test(panelJs.slice(panelJs.indexOf('async function editPosition'), panelJs.indexOf('/** Open the pop-up on'))), 'editing never disposes the file that is in use');
assert.match(css, /\.art-check-size \{/);
assert.match(css, /\.side-action\.is-secondary/);

console.log('Art check edit test passed');
