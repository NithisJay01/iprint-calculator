import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProductionPlan, assembleJob, assembleDielineJob } from '../material-preview/productionSpec.js';
import { buildPdf } from '../material-preview/pdfBuild.js';
import { inspectPdf, mmToPt, fmt } from '../material-preview/pdf.js';
import { buildSpec } from '../material-preview/shape.js';
import { segmentsBounds } from '../material-preview/svgPath.js';
import { EXPORT } from '../material-preview/materials.js';
import { artworkFilename } from '../shared/print-request.js';

// The cutting file: a PDF with only the die-line, on the same page and origin as the artwork file.
const now = new Date('2026-09-25T00:00:00Z');
const specFor = (params) => ({ params, spec: buildSpec(params) });
const planFor = ({ spec, params }, extra = {}) => buildProductionPlan({ spec, params, paperId: 'smooth', now, options: { dielineOnly: true, jobPage: false, ...extra } });
const pt = (mm) => +mmToPt(mm).toFixed(2);
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: got ${actual}, expected ${expected} ± ${tolerance}`);

// ---------- no artwork is needed for a cutting file (but it still is for the print file) ----------
const rect = specFor({ kind: 'rect', width: 90, height: 54, radius: 0, bleed: 3 });
assert.equal(planFor(rect).blocking, false, 'the cutting file needs no artwork');
assert.equal(buildProductionPlan({ ...rect, paperId: 'smooth', now, options: { jobPage: false } }).blocking, true, 'the print file still needs Layer 1');
assert.ok(planFor(rect).checks.some((c) => c.level === 'ok' && /ไฟล์เส้นตัดอย่างเดียว/.test(c.text)));

// ---------- the job: the die-line and nothing else ----------
const plan = planFor(rect);
const job = assembleDielineJob({ plan });
assert.deepEqual(job.layers.map((l) => l.name), [EXPORT.spots.dieline.layer], 'one layer: the die-line');
assert.equal(job.layers[0].items.length, 1);
assert.deepEqual(Object.keys(job.spots), ['dieline'], 'one spot colour');
assert.deepEqual(job.images, {}, 'no pictures');
assert.equal(job.jobPage, null, 'no job sheet');
assert.match(job.title, /die-line 90 x 54 mm/);
assert.match(job.fileBase, /-dieline$/);
const full = assembleJob({ plan });
assert.deepEqual([job.media, job.trim, job.bleed, job.frameRect], [full.media, full.trim, full.bleed, full.frameRect], 'same page, trim and bleed boxes as the artwork file');
assert.deepEqual(job.layers[0].items[0].segs, full.layers.find((l) => l.name === 'Dieline').items[0].segs, 'the very same cut path');
assert.equal(job.layers[0].items[0].stroke.spot, 'dieline');
assert.equal(job.layers[0].items[0].fill, null, 'a line, never filled');

// ---------- the PDF ----------
const bytes = await buildPdf(job);
const pdf = await inspectPdf(bytes);
assert.deepEqual(pdf.problems, [], 'valid file structure');
assert.equal(pdf.pages.length, 1, 'one page (no job sheet)');
const page = pdf.pages[0];
assert.deepEqual(page.mediaBox.map((v) => +v.toFixed(2)), [0, 0, pt(96), pt(60)], 'page = the artwork frame (90 x 54 + 3 mm bleed each side)');
assert.deepEqual(page.trimBox.map((v) => +v.toFixed(2)), [pt(3), pt(3), pt(93), pt(57)], 'TrimBox = the cut shape');
assert.deepEqual(pdf.layers, ['Dieline']);
assert.deepEqual(pdf.spots, ['Dieline'], 'only the die-line spot colour');
assert.equal(pdf.imageCount, 0);
assert.match(page.content, /\/CS\d+ CS 1 SCN/, 'stroked in the spot colour');
assert.doesNotMatch(page.content, / rg\n| k\n| g\n/, 'nothing is filled with a process colour');
assert.doesNotMatch(page.content, /Do\n/, 'no picture is drawn');
assert.ok(pdf.objects.some((o) => /\/OP true \/op true/.test(o.dict)), 'overprint, like the die-line in the print file');
const sameBoxes = await inspectPdf(await buildPdf(full));
assert.deepEqual([page.mediaBox, page.trimBox, page.bleedBox], [sameBoxes.pages[0].mediaBox, sameBoxes.pages[0].trimBox, sameBoxes.pages[0].bleedBox], 'its page boxes equal the print file page 1 (they register)');
// the cut path sits on the trim box: 3..93 x 3..57 mm
const bounds = segmentsBounds(job.layers[0].items[0].segs);
for (const [got, want, label] of [[bounds.minX, 3, 'left'], [bounds.maxX, 93, 'right'], [bounds.minY, 3, 'top'], [bounds.maxY, 57, 'bottom']]) near(got, want, 1e-6, `cut ${label} edge in page mm`);

// ---------- other shapes ----------
for (const [name, params] of [
  ['rounded', { kind: 'rounded', width: 90, height: 54, radius: 4, bleed: 3 }],
  ['ellipse', { kind: 'ellipse', width: 60, height: 40, radius: 0, bleed: 3 }],
  ['big square', { kind: 'rect', width: 250, height: 250, radius: 0, bleed: 5 }],
]) {
  const s = specFor(params);
  const p = planFor(s);
  const j = assembleDielineJob({ plan: p });
  const r = await inspectPdf(await buildPdf(j));
  assert.deepEqual(r.problems, [], `${name}: valid PDF`);
  assert.deepEqual(r.layers, ['Dieline'], `${name}: die-line only`);
  const b = segmentsBounds(j.layers[0].items[0].segs);
  near(b.maxX - b.minX, params.width, 1e-6, `${name}: cut width`);
  near(b.maxY - b.minY, params.height, 1e-6, `${name}: cut height`);
  assert.ok(b.minX >= 0 && b.minY >= 0 && b.maxX <= j.media.w && b.maxY <= j.media.h, `${name}: the cut is inside the page`);
}

// ---------- options that belong to the print file are ignored here ----------
const marks = planFor(rect, { cropMarks: true, jobPage: true });
assert.ok(marks.jobLines && marks.marks.length, 'this plan does have crop marks and a job sheet ...');
const marksJob = assembleDielineJob({ plan: marks });
assert.equal(marksJob.layers.length, 1, '... but the cutting file has no crop marks layer');
assert.equal(marksJob.jobPage, null, '... and no job sheet');
assert.deepEqual(Object.keys(marksJob.spots), ['dieline'], '... and no registration colour');
assert.deepEqual(marksJob.images, {});

// ---------- through the real export function ----------
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
const { exportDielineFile } = await import('../material-preview/exportFiles.js');
const result = await exportDielineFile({ spec: rect.spec, params: rect.params, cut: null, paperId: 'smooth', material: null }, { colorMode: 'cmyk', cropMarks: true, jobPage: true });
assert.match(result.filename, /^iprint-\d{8}-90x54mm-smooth-dieline\.pdf$/);
assert.equal(result.blob.type, 'application/pdf');
assert.deepEqual(result.pdf, { pages: 1, layers: ['Dieline'], spots: ['Dieline'] }, 'one page, one layer, one spot colour — even if the print options ask for marks and a job sheet');
assert.ok(result.report[0].includes('Dieline') && /เส้นโค้งสมบูรณ์/.test(result.report[0]));
const again = await inspectPdf(new Uint8Array(await result.blob.arrayBuffer()));
assert.deepEqual(again.problems, [], 'the downloaded file reads back');
assert.deepEqual(again.pages[0].mediaBox.map((v) => +v.toFixed(2)), [0, 0, pt(96), pt(60)], 'the page is the artwork frame: the crop marks margin is never added');
assert.deepEqual(again.pages[0].trimBox.map((v) => +v.toFixed(2)), [pt(3), pt(3), pt(93), pt(57)], 'so the cut sits at the same place as in the print file');

// ---------- the file name ----------
const request = { name: 'ลูกค้า', jobName: 'Namecard', materialName: 'Art300', quantity: 500, spec: { paper: 'smooth', width: 90, height: 54 } };
assert.equal(artworkFilename(request, 'pdf', 'dieline'), '(ลูกค้า)Namecard-(9x5.4cm)Art300-(500piece)-dieline.pdf');
assert.equal(artworkFilename(request, 'pdf', 'front'), '(ลูกค้า)Namecard-(9x5.4cm)Art300-(500piece)-front.pdf', 'the print file names are unchanged');
assert.equal(artworkFilename(request, 'svg', 'back'), '(ลูกค้า)Namecard-(9x5.4cm)Art300-(500piece)-back.svg');

// ---------- the page ----------
const html = readFileSync(new URL('../material-preview/index.html', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../material-preview/panel.js', import.meta.url), 'utf8');
assert.match(html, /id="exportDieline"[^>]*>ดาวน์โหลดเส้นตัด/, 'a download button for the cutting file');
assert.match(panel, /\$\('#exportDieline'\)\.addEventListener\('click', \(\) => act\(\(\) => runExport\('dieline'\)\)\)/);
assert.match(panel, /kind === 'dieline'\s*\n\s*\? \[\{ \.\.\.\(await exportDielineFile\(exportSources\(\), exportOptions\(\)\)\), kind: 'pdf', side: 'dieline' \}\]/, 'it downloads through the same named-file flow');
assert.ok(!/\$\('#exportDieline'\)\.disabled/.test(panel), 'never disabled: no artwork is needed');

console.log('Die-line PDF test passed');
