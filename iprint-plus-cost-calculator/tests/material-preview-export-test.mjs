import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  IDENTITY, multiply, apply, scaleOf, parsePathData, rectSegments, ellipseSegments, polySegments, ringsToSegments,
  segmentsBounds, segmentsToPdf, segmentsToSvg, transformSegments
} from '../material-preview/svgPath.js';
import {
  fmt, mmToPt, rgbToCmyk, pdfName, pdfLiteral, pdfText, pdfDate, asciiOnly, PdfWriter, deflate, inflate, inspectPdf
} from '../material-preview/pdf.js';
import { buildProductionPlan, assembleJob, bleedMargins, dielineSegments, cropMarks } from '../material-preview/productionSpec.js';
import { buildPdf } from '../material-preview/pdfBuild.js';
import { buildSvg } from '../material-preview/svgBuild.js';
import { buildSpec, readJpegInfo } from '../material-preview/shape.js';
import { EXPORT, finishes } from '../material-preview/materials.js';

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: got ${actual}, expected ${expected} ± ${tolerance}`);
const types = (segs) => segs.map((s) => s.t).join('');

// ---------- path data ----------
{
  assert.equal(types(parsePathData('M10 10 L20 10 L20 20 Z')), 'MLLZ');
  const rel = parsePathData('m10 10 l10 0 v10 h-10 z');
  assert.deepEqual(rel.filter((s) => s.t !== 'Z').map((s) => [s.x, s.y]), [[10, 10], [20, 10], [20, 20], [10, 20]], 'relative commands become absolute');
  assert.equal(types(parsePathData('M0 0 10 0 10 10')), 'MLL', 'pairs after M are implicit L');
  assert.equal(types(parsePathData('M0,0L1,1,2,0')), 'MLL', 'commas and repeated arguments');
  assert.deepEqual(parsePathData('M1e1 -.5 L2.5e-1 3').map((s) => [s.x, s.y]), [[10, -0.5], [0.25, 3]], 'number syntax');

  const smooth = parsePathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
  near(smooth[2].x1, 10, 1e-9, 'S reflects the previous control point (x)');
  near(smooth[2].y1, -10, 1e-9, 'S reflects the previous control point (y)');
  const notSmooth = parsePathData('M0 0 L10 0 S20 -10 20 0');
  assert.equal(notSmooth[2].x1, 10, 'S after a non-curve starts at the current point');

  const quad = parsePathData('M0 0 Q5 10 10 0');
  near(quad[1].x1, 10 / 3, 1e-9, 'Q → C first control x');
  near(quad[1].y1, 20 / 3, 1e-9, 'Q → C first control y');
  near(quad[1].x2, 20 / 3, 1e-9, 'Q → C second control x');
  const tee = parsePathData('M0 0 Q5 10 10 0 T20 0');
  near(tee[2].y1, -20 / 3, 1e-9, 'T reflects the quadratic control point');

  const half = parsePathData('M0 0 A10 10 0 0 1 20 0');
  assert.equal(half.length, 3, 'a half circle is two quarter Béziers');
  const hb = segmentsBounds(half);
  near(hb.minY, -10, 1e-6, 'sweep=1 goes over the top on screen');
  near(hb.maxX, 20, 1e-6, 'arc ends where it should');
  near(half[2].x, 20, 1e-9, 'last point is exact');
  const under = parsePathData('M0 0 A10 10 0 0 0 20 0');
  near(segmentsBounds(under).maxY, 10, 1e-6, 'sweep=0 goes under');
  assert.ok(parsePathData('M0 0a5 5 0 1010 0').length >= 3, 'compressed arc flags (no separators) are read');
  const grown = parsePathData('M0 0 A1 1 0 0 1 20 0');
  near(segmentsBounds(grown).minY, -10, 1e-6, 'too-small radii are scaled up to reach the end point');
  // a full circle drawn as two arcs
  const circle = parsePathData('M0 10 A10 10 0 1 1 20 10 A10 10 0 1 1 0 10 Z');
  const cb = segmentsBounds(circle);
  near(cb.maxX - cb.minX, 20, 1e-6, 'circle width');
  near(cb.maxY - cb.minY, 20, 1e-6, 'circle height');
  assert.deepEqual(types(parsePathData('M0 0 L10 0 Z L5 5')), 'MLZML', 'drawing after Z starts a new sub-path at its start');

  assert.throws(() => parsePathData('M0 0 X5'), /ไม่รองรับ/);
  assert.throws(() => parsePathData('L10 10'), /ขึ้นต้นด้วย M/);
  assert.throws(() => parsePathData('M0 0 L'), /ตัวเลข/);
  assert.throws(() => parsePathData('M0 0 A5 5 0 2 0 10 0'), /flag/);
  assert.deepEqual(parsePathData(''), []);
}

// ---------- shapes, matrices, serialising ----------
{
  const rb = segmentsBounds(rectSegments(2, 3, 10, 5));
  assert.deepEqual([rb.minX, rb.minY, rb.maxX, rb.maxY], [2, 3, 12, 8]);
  const round = rectSegments(0, 0, 10, 5, 2, 2);
  assert.equal(types(round), 'MLCLCLCLCZ');
  assert.deepEqual([segmentsBounds(round).maxX, segmentsBounds(round).maxY], [10, 5]);
  assert.equal(types(rectSegments(0, 0, 10, 5, 99, 99)), 'MLCLCLCLCZ', 'huge radii are clamped');
  assert.equal(types(rectSegments(0, 0, 10, 5, 3, 0)), 'MLCLCLCLCZ', 'a single radius applies to both');
  const eb = segmentsBounds(ellipseSegments(50, 40, 20, 10));
  near(eb.maxX, 70, 1e-9, 'ellipse right');
  near(eb.minY, 30, 1e-9, 'ellipse top');
  assert.equal(ellipseSegments(0, 0, 1, 1).length, 6);
  assert.equal(types(polySegments([[0, 0], [1, 0], [1, 1]], true)), 'MLLZ');
  assert.equal(types(ringsToSegments([[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 }]])), 'MLLZMLLZ');

  const m = multiply([2, 0, 0, 2, 0, 0], [1, 0, 0, 1, 5, 7]); // translate first, then scale
  assert.deepEqual(apply(m, 1, 1), [12, 16]);
  assert.deepEqual(multiply(IDENTITY, m), m);
  near(scaleOf([3, 0, 0, 3, 9, 9]), 3, 1e-9, 'scale of a uniform matrix');
  near(scaleOf([0, 2, -2, 0, 0, 0]), 2, 1e-9, 'scale ignores rotation');
  const moved = transformSegments(polySegments([[0, 0], [1, 1]], false), [1, 0, 0, 1, 10, 20]);
  assert.deepEqual([moved[1].x, moved[1].y], [11, 21]);

  assert.equal(segmentsToSvg(polySegments([[0, 0], [10.12345, 5]], true)), 'M0 0L10.123 5Z');
  assert.equal(segmentsToPdf(polySegments([[0, 0], [10, 5]], false), (x, y) => [x * 2, y * 2]), '0 0 m\n20 10 l');
  assert.match(segmentsToPdf(rectSegments(0, 0, 4, 4, 1, 1), (x, y) => [x, y]), / c\n/, 'curves are written with c');
}

// ---------- PDF helpers ----------
{
  assert.equal(fmt(1e-7), '0');
  assert.equal(fmt(-0.0001), '0');
  assert.equal(fmt(12.34567), '12.346');
  assert.throws(() => fmt(NaN), /ตัวเลข/);
  near(mmToPt(25.4), 72, 1e-9, 'one inch');
  assert.equal(pdfName('Foil Gold/1'), '/Foil#20Gold#2f1');
  assert.equal(pdfName('Spot_UV'), '/Spot_UV');
  assert.equal(pdfLiteral('a(b)\\c'), '(a\\(b\\)\\\\c)');
  assert.equal(pdfLiteral('ไทย'), '(???)');
  assert.equal(pdfText('Plain'), '(Plain)');
  assert.match(pdfText('ไทย'), /^<FEFF0E44/, 'non-ASCII text is UTF-16BE with a byte-order mark');
  assert.equal(asciiOnly('a\tb é'), 'a?b ?');
  assert.equal(pdfDate(new Date(Date.UTC(2026, 8, 21, 7, 5, 9))), 'D:20260921070509Z');
  assert.deepEqual(rgbToCmyk(0, 0, 0), [0, 0, 0, 1]);
  assert.deepEqual(rgbToCmyk(1, 1, 1), [0, 0, 0, 0]);
  assert.deepEqual(rgbToCmyk(1, 0, 0).map((v) => +v.toFixed(3)), [0, 1, 1, 0]);

  const packed = await deflate(new TextEncoder().encode('hello hello hello hello'));
  assert.equal(new TextDecoder().decode(await inflate(packed)), 'hello hello hello hello', 'deflate ↔ inflate');
}

// ---------- the writer: offsets must be exact whatever the streams contain ----------
{
  const w = new PdfWriter();
  const root = w.reserve();
  const pages = w.reserve();
  const binary = Uint8Array.from({ length: 300 }, (_, i) => i % 256); // includes 0x0a, 0x0d, "\nendstream"-like bytes
  const stream = w.addStream('/Filter /None', new TextEncoder().encode(`${'x'.repeat(50)}\nendstream\n${'y'.repeat(20)}`));
  const bin = w.addStream('', binary);
  const page = w.add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 10 10] /Contents ${bin} 0 R >>`);
  w.set(pages, `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`);
  w.set(root, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
  const bytes = w.serialize({ root, id: '0123456789abcdef0123456789abcdef' });
  const report = await inspectPdf(bytes);
  assert.deepEqual(report.problems, [], 'a well-formed file');
  assert.equal(report.ok, true);
  assert.equal(report.version, '1.6');
  assert.equal(report.objectCount, 5);
  assert.deepEqual(Array.from(report.objects[bin - 1].data), Array.from(binary), 'binary stream survives byte for byte');
  assert.ok(stream > 0);
  assert.deepEqual(report.pages[0].mediaBox, [0, 0, 10, 10]);

  const text = Buffer.from(bytes).toString('latin1');
  const damage = (from, to) => new Uint8Array(Buffer.from(text.replace(from, to), 'latin1'));
  assert.equal((await inspectPdf(damage(/startxref\n\d+/, 'startxref\n1'))).ok, false, 'a wrong startxref is noticed');
  assert.equal((await inspectPdf(damage('/Length 300', '/Length 299'))).ok, false, 'a wrong stream length is noticed');
  assert.equal((await inspectPdf(damage(/\n0000000015 00000 n/, '\n0000000016 00000 n'))).ok, false, 'a wrong object offset is noticed');
  const w2 = new PdfWriter();
  w2.reserve();
  assert.throws(() => w2.serialize({ root: 1 }), /never written/);
}

// ---------- production plan ----------
const NOW = new Date(Date.UTC(2026, 8, 21, 12, 0, 0));
const art = { name: 'card.svg', kind: 'svg', aspect: 1.6, warnings: [] };
const plan = (params, extra = {}) => {
  const p = { kind: 'rect', width: 90, height: 54, radius: 3, bleed: 3, ...params };
  return buildProductionPlan({ spec: buildSpec(p), params: p, paperId: 'kraft', art, now: NOW, ...extra });
};
{
  const p = plan({});
  assert.deepEqual(p.media, { w: 96, h: 60 });
  assert.deepEqual(p.trim, { x0: 3, y0: 3, x1: 93, y1: 57 });
  assert.deepEqual(p.bleed, { x0: 0, y0: 0, x1: 96, y1: 60 });
  assert.deepEqual(p.toPage(0, 0), [48, 30], 'the card centre is the page centre');
  assert.deepEqual(p.toPage(-48, 30), [0, 0], 'frame top-left is the page origin (y flips)');
  assert.equal(p.dieline.exact, true);
  assert.equal(types(p.dieline.segs), 'MLLLZ');
  assert.equal(p.fileBase, 'iprint-20260921-90x54mm-kraft');
  assert.equal(p.blocking, false);
  assert.ok(p.checks.some((c) => c.level === 'ok' && /Bleed 3 mm/.test(c.text)));
  assert.ok(p.jobLines.every((l) => /^[\x20-\x7e]*$/.test(l)), 'the job sheet is plain ASCII (standard font)');
  const trimArt = plan({}, { art: { name: 'trim.png', kind: 'raster', aspect: 90 / 54, pixelWidth: 1063 } });
  assert.ok(trimArt.checks.some((c) => c.level === 'ok' && /เติม Bleed 3 mm อัตโนมัติ/.test(c.text)), 'a trim-sized file is flagged as auto-bled');
  assert.ok(!p.checks.some((c) => /เติม Bleed/.test(c.text)), 'a file with its own bleed is not');

  assert.equal(types(plan({ kind: 'rounded', radius: 3 }).dieline.segs), 'MLCLCLCLCZ', 'rounded corners are exact curves');
  assert.equal(types(plan({ kind: 'ellipse', width: 60, height: 40 }).dieline.segs), 'MCCCCZ', 'an oval is four Béziers');
  const noBleed = plan({ bleed: 0 });
  assert.ok(noBleed.checks.some((c) => c.level === 'warn' && /ไม่มี Bleed/.test(c.text)), 'no bleed is flagged');
  assert.ok(plan({ bleed: 1 }).checks.some((c) => c.level === 'warn' && /แค่ 1 mm/.test(c.text)), 'thin bleed is flagged');
  const noArt = plan({}, { art: null });
  assert.equal(noArt.blocking, true, 'no artwork = nothing to export');
  assert.ok(noArt.checks.some((c) => c.level === 'error'));

  const marks = plan({}, { options: { cropMarks: true } });
  assert.deepEqual(marks.media, { w: 116, h: 80 }, 'crop marks add a margin');
  assert.deepEqual(marks.trim, { x0: 13, y0: 13, x1: 103, y1: 67 }, 'trim moves with the margin');
  assert.equal(marks.marks.length, 8, 'two marks per corner');
  const m0 = marks.marks[0].segs;
  assert.ok(m0[0].x < marks.trim.x0 - 3 && m0[1].x < marks.trim.x0 - 3, 'marks sit outside the bleed');
  assert.ok(marks.marks.every((m) => m.stroke.spot === 'registration'));
  for (const m of marks.marks) for (const s of m.segs) assert.ok(s.x >= 0 && s.y >= 0 && s.x <= marks.media.w && s.y <= marks.media.h, 'marks stay on the page');

  // finish + shape
  const gold = plan({}, { finishId: 'goldFoil', mask: { name: 'foil.svg', kind: 'svg', aspect: 1.6 }, coatingId: 'matte' });
  assert.equal(gold.finish.spot.name, 'Foil_Gold');
  assert.equal(gold.finish.layerName, 'Foil_Gold');
  assert.ok(gold.jobLines.some((l) => /Lamination: matte/.test(l)));
  assert.ok(gold.jobLines.some((l) => /Foil_Gold/.test(l)));
  assert.equal(gold.fileBase, 'iprint-20260921-90x54mm-kraft-goldFoil');
  // catalog material: production gets the stock the customer picked, not the preview look
  const thai = plan({}, { paperId: 'coated', material: { id: 'rec-white-300', name: 'การ์ดขาว 300g', fallback: false } });
  assert.ok(thai.jobLines.every((l) => /^[\x20-\x7e]*$/.test(l)), 'a Thai stock name keeps the job sheet ASCII');
  assert.ok(thai.jobLines.some((l) => l === 'Material: catalog ID rec-white-300'), 'a Thai stock is named by its catalog ID');
  assert.ok(thai.jobLines.some((l) => l === 'Preview look: Coated'));
  assert.ok(!thai.jobLines.some((l) => /^Paper:/.test(l)));
  assert.match(thai.info.subject, /^Material: การ์ดขาว 300g \(catalog ID rec-white-300\); Preview look: Coated;/, 'the full name is in the document properties');
  assert.ok(thai.checks.some((c) => c.level === 'ok' && c.text === 'วัสดุ: การ์ดขาว 300g'));
  const pvc = plan({}, { paperId: 'smooth', material: { id: 'rec-pvc', name: 'PVC Card', fallback: true } });
  assert.ok(pvc.jobLines.some((l) => l === 'Material: PVC Card - catalog ID rec-pvc'), 'an ASCII stock name is printed as is');
  assert.ok(pvc.jobLines.some((l) => /^Preview look: Smooth \(placeholder/.test(l)), 'a placeholder look is labelled as such');
  assert.ok(pvc.checks.some((c) => c.level === 'warn' && /"PVC Card" ยังไม่มีตัวอย่าง 3D/.test(c.text)), 'a stock without a 3D preset is flagged');
  assert.ok(plan({}).jobLines.some((l) => l === 'Paper: Kraft'), 'without a catalog record the sample look is the paper');
  const missing = plan({}, { finishId: 'emboss', mask: null });
  assert.ok(missing.checks.some((c) => c.level === 'warn' && /ยังไม่มีไฟล์รูปทรง/.test(c.text)));
  for (const id of Object.keys(finishes).filter((id) => finishes[id].layer)) assert.ok(EXPORT.spots[id]?.name && /^[A-Za-z0-9_.-]+$/.test(EXPORT.spots[id].name), `${id}: spot name is safe ASCII`);

  // die-cut file: the frame is the file's artboard and may be off-centre
  const ring = [{ x: 30, y: 40 }, { x: 230, y: 40 }, { x: 230, y: 140 }, { x: 30, y: 140 }];
  const cutParams = { kind: 'custom', width: 80, height: 54, bleed: 0 };
  const custom = buildSpec({ ...cutParams, custom: { rings: [ring], frame: { x0: 0, y0: 0, x1: 260, y1: 160 } } });
  const cp = buildProductionPlan({ spec: custom, params: cutParams, cut: { kind: 'svg' }, paperId: 'smooth', art, now: NOW });
  assert.equal(cp.dieline.exact, false);
  assert.equal(types(cp.dieline.segs), 'MLLLZ');
  near(cp.media.w, 104, 1e-9, 'page = the file artboard');
  near(cp.trim.x1 - cp.trim.x0, 80, 1e-9, 'trim = the cut width');
  near(cp.trim.x0, 12, 1e-9, 'trim keeps the margin the file had (30 units = 12 mm)');
  near(cp.trim.y0, 8, 1e-9, 'top margin 20 units = 8 mm');
  const margins = bleedMargins(custom);
  near(margins.left, 12, 1e-9, 'left margin');
  near(margins.bottom, 16, 1e-9, 'bottom margin (40 units)');
  assert.ok(cp.checks.some((c) => c.level === 'ok' && /SVG/.test(c.text)));
  const png = buildProductionPlan({ spec: custom, params: cutParams, cut: { kind: 'png' }, paperId: 'smooth', art, now: NOW });
  assert.ok(png.checks.some((c) => c.level === 'warn' && /PNG/.test(c.text)), 'a die-line traced from a picture is only a reference');
  const lowRes = buildProductionPlan({ spec: buildSpec({ kind: 'rect', width: 90, height: 54, bleed: 0 }), params: { kind: 'rect' }, paperId: 'smooth', art: { name: 'a.jpg', kind: 'raster', pixelWidth: 600, aspect: 1.667 }, now: NOW });
  assert.ok(lowRes.checks.some((c) => c.level === 'warn' && /dpi/.test(c.text)), 'low resolution is flagged');
}

// ---------- the PDF ----------
const item = {
  rect: (x, y, w, h, fill, extra = {}) => ({ type: 'path', segs: rectSegments(x, y, w, h), fill, stroke: null, rule: 'nonzero', overprint: false, ...extra }),
};
const baseJob = async (options = {}, layersExtra = {}) => {
  const p = plan({}, { finishId: 'goldFoil', mask: { name: 'foil.svg', kind: 'svg', aspect: 1.6 }, coatingId: 'gloss', options });
  const rgb = Uint8Array.of(255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0); // 2 x 2
  return assembleJob({
    plan: p,
    artItems: [
      item.rect(0, 0, 96, 60, { rgb: [0.95, 0.9, 0.8] }),
      item.rect(10, 10, 30, 10, { rgb: [0.1, 0.3, 0.4], alpha: 0.5 }),
      { type: 'image', id: 'im1', matrix: [40, 0, 0, 20, 20, 30], alpha: 1 },
      ...(layersExtra.artItems ?? []),
    ],
    finishItems: [item.rect(20, 12, 20, 6, { spot: 'goldFoil', tint: 1 }, { overprint: true })],
    images: { im1: { width: 2, height: 2, colorSpace: 'DeviceRGB', bpc: 8, data: rgb } },
  });
};
{
  const job = await baseJob({ cropMarks: true, jobPage: true });
  job.docId = 'ab'.repeat(16);
  const bytes = await buildPdf(job);
  const r = await inspectPdf(bytes);
  assert.deepEqual(r.problems, [], 'valid file structure');
  assert.equal(r.pages.length, 2, 'artwork page + job sheet');
  const [p1, p2] = r.pages;
  assert.deepEqual(p1.mediaBox.map((v) => +v.toFixed(2)), [0, 0, +mmToPt(116).toFixed(2), +mmToPt(80).toFixed(2)]);
  assert.deepEqual(p1.trimBox.map((v) => +v.toFixed(2)), [+mmToPt(13).toFixed(2), +mmToPt(13).toFixed(2), +mmToPt(103).toFixed(2), +mmToPt(67).toFixed(2)], 'TrimBox = the cut shape');
  assert.deepEqual(p1.bleedBox.map((v) => +v.toFixed(2)), [+mmToPt(10).toFixed(2), +mmToPt(10).toFixed(2), +mmToPt(106).toFixed(2), +mmToPt(70).toFixed(2)], 'BleedBox = the artwork frame');
  assert.deepEqual(r.layers, ['Artwork', 'Dieline', 'Foil_Gold', 'Marks'], 'one layer each');
  assert.deepEqual([...r.spots].sort(), ['All', 'Dieline', 'Foil_Gold']);
  assert.equal(r.imageCount, 1);
  assert.deepEqual(r.fonts, ['Helvetica']);
  assert.match(r.info, /Title \(iPrint production file 90 x 54 mm\)/);
  assert.match(r.info, /Lamination: gloss; Finish: Gold Foil/);
  assert.match(p1.content, /\/OC \/OC1 BDC/, 'content is grouped into layers');
  assert.equal((p1.content.match(/EMC/g) ?? []).length, 4);
  assert.match(p1.content, /\/CS\d+ cs 1 scn/, 'finish is painted with the spot colour');
  assert.match(p1.content, /\/CS\d+ CS 1 SCN/, 'die-line and marks are stroked with spot colours');
  assert.ok(r.objects.some((o) => /\/OP true \/op true \/OPM 1/.test(o.dict)), 'overprint is on for the finish and the die-line');
  assert.ok(/\/ca 0\.5/.test(r.objects.map((o) => o.dict).join('')), 'partial transparency becomes a graphics state');
  assert.ok(r.objects.some((o) => /\/Group << \/S \/Transparency/.test(o.dict)), 'transparency group when alpha is used');
  assert.match(p1.content, /(-?[\d.]+ ){5}-?[\d.]+ cm\n\/Im1 Do/, 'image is placed with a cm matrix');
  assert.match(p1.content, / rg\n/, 'RGB artwork');
  assert.match(p2.content, /iPrint - production file/, 'job sheet text is readable');
  assert.match(p2.content, /Foil_Gold/, 'job sheet names the spot colour');
  // the page's top-left corner (0, 0) mm is (0, page height) pt: y is flipped
  assert.ok(p1.content.includes(`0 ${fmt(mmToPt(80))} m`), 'y is flipped into PDF space');

  // image position: matrix [40 0 0 20 20 30] mm → cm [a*k, -b*k, c*k, -d*k, e*k, (H-f)*k]
  const k = 72 / 25.4;
  assert.ok(p1.content.includes(`${fmt(40 * k)} 0 0 ${fmt(-20 * k)} ${fmt(20 * k)} ${fmt((80 - 30) * k)} cm`), 'image matrix is flipped into PDF space');
}
{
  // CMYK mode, no marks, no job sheet, JPEG passthrough
  const job = await baseJob({ colorMode: 'cmyk', cropMarks: false, jobPage: false });
  job.images.im1 = { width: 2, height: 2, colorSpace: 'DeviceRGB', bpc: 8, filter: 'DCTDecode', data: Uint8Array.of(0xff, 0xd8, 0xff, 0xd9) };
  const r = await inspectPdf(await buildPdf(job));
  assert.deepEqual(r.problems, []);
  assert.equal(r.pages.length, 1);
  assert.deepEqual(r.layers, ['Artwork', 'Dieline', 'Foil_Gold']);
  assert.doesNotMatch(r.pages[0].content, / rg\n/, 'no RGB operators in CMYK mode');
  assert.match(r.pages[0].content, /[\d.]+ [\d.]+ [\d.]+ [\d.]+ k\n/, 'CMYK fill operators');
  assert.ok(r.objects.some((o) => /\/Filter \/DCTDecode/.test(o.dict) && /\/ColorSpace \/DeviceRGB/.test(o.dict)), 'JPEG is passed through as DCT');
  assert.deepEqual(r.pages[0].trimBox.map((v) => +v.toFixed(2)), [8.5, 8.5, 263.62, 161.57]);

  // an image with a soft mask (alpha)
  const withAlpha = await baseJob({ jobPage: false });
  withAlpha.images.im1.smask = { width: 2, height: 2, data: Uint8Array.of(255, 128, 64, 0) };
  const ra = await inspectPdf(await buildPdf(withAlpha));
  assert.deepEqual(ra.problems, []);
  assert.equal(ra.imageCount, 2, 'image + its soft mask');
  assert.ok(ra.objects.some((o) => /\/SMask \d+ 0 R/.test(o.dict)));
}

// ---------- the SVG ----------
{
  const job = await baseJob({ cropMarks: true });
  job.images.im1.dataUrl = 'data:image/png;base64,AAAA';
  const svg = buildSvg(job);
  assert.match(svg, /viewBox="0 0 116 80" width="116mm" height="80mm"/, 'real size in millimetres');
  for (const name of ['Artwork', 'Dieline', 'Foil_Gold', 'Marks', 'Guides']) assert.match(svg, new RegExp(`<g (style="display:none" )?id="${name}" inkscape:groupmode="layer" inkscape:label="${name}"`), `${name} layer`);
  assert.match(svg, /<g style="display:none" id="Guides"/, 'guides are hidden');
  assert.match(svg, new RegExp(`stroke="${EXPORT.spots.dieline.rgb}"`), 'die-line uses its screen colour');
  assert.match(svg, new RegExp(`fill="${EXPORT.spots.goldFoil.rgb}"`), 'foil uses its screen colour');
  assert.match(svg, /fill-opacity="0.5"/);
  assert.match(svg, /<image [^>]*transform="matrix\(40 0 0 -20 20 50\)"[^>]*xlink:href="data:image\/png;base64,AAAA"/, 'the image matrix is flipped into y-down');
  assert.equal((svg.match(/<g /g) ?? []).length, (svg.match(/<\/g>/g) ?? []).length, 'balanced groups');
  assert.doesNotMatch(svg, /&(?!amp;|lt;|gt;|quot;)/, 'no stray ampersands');
  const inner = buildSvg({ ...job, layers: [{ name: 'Artwork', items: [], svgInner: '<svg x="0" y="0" width="96" height="60" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' }, ...job.layers.slice(1)] });
  assert.match(inner, /<g id="Artwork"[^>]*>\n<svg x="0"/, 'an SVG artwork is embedded as it is');
}

// ---------- JPEG headers ----------
{
  const sof = (w, h, comps) => [0xff, 0xc0, 0x00, 8 + comps * 3, 8, h >> 8, h & 255, w >> 8, w & 255, comps, ...new Array(comps * 3).fill(0)];
  const exif = (orientation, little = true) => {
    const tiff = little
      ? [0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0]
      : [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    return [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
  };
  const plain = readJpegInfo(Uint8Array.from([0xff, 0xd8, ...sof(1800, 1080, 3), 0xff, 0xda]));
  assert.deepEqual(plain, { progressive: false, height: 1080, width: 1800, components: 3, orientation: 1, adobeTransform: null });
  assert.equal(readJpegInfo(Uint8Array.from([0xff, 0xd8, ...exif(6), ...sof(100, 50, 3)])).orientation, 6, 'EXIF orientation (little endian)');
  assert.equal(readJpegInfo(Uint8Array.from([0xff, 0xd8, ...exif(3, false), ...sof(100, 50, 1)])).orientation, 3, 'EXIF orientation (big endian)');
  assert.equal(readJpegInfo(Uint8Array.from([0xff, 0xd8, ...exif(6), ...sof(100, 50, 1)])).components, 1, 'greyscale');
  const adobe = [0xff, 0xee, 0, 14, 0x41, 0x64, 0x6f, 0x62, 0x65, 0, 100, 0, 0, 0, 0, 2];
  const cmyk = readJpegInfo(Uint8Array.from([0xff, 0xd8, ...adobe, ...sof(100, 50, 4)]));
  assert.equal(cmyk.components, 4);
  assert.equal(cmyk.adobeTransform, 2, 'Adobe colour transform flag');
  assert.equal(readJpegInfo(Uint8Array.from([0xff, 0xd8, 0xff, 0xc2, 0, 11, 8, 0, 50, 0, 100, 1, 1, 0x11, 0])).progressive, true);
  assert.equal(readJpegInfo(new Uint8Array([1, 2, 3, 4])), null);
  assert.equal(readJpegInfo(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])), null, 'no frame header');
}

// ---------- the config the exporter reads ----------
{
  const materials = readFileSync(new URL('../material-preview/materials.js', import.meta.url), 'utf8');
  assert.match(materials, /export const EXPORT/);
  for (const [key, spot] of Object.entries(EXPORT.spots)) {
    assert.match(spot.name, /^[A-Za-z0-9_.-]+$/, `${key}: spot names are ASCII and need no escaping`);
    assert.equal(spot.cmyk.length, 4);
    assert.ok(spot.cmyk.every((v) => v >= 0 && v <= 1), `${key}: cmyk 0..1`);
    assert.match(spot.rgb, /^#[0-9a-f]{6}$/i);
  }
  assert.equal(new Set(Object.values(EXPORT.spots).map((s) => s.name)).size, Object.keys(EXPORT.spots).length, 'spot names are unique');
  assert.equal(new Set(Object.values(EXPORT.spots).map((s) => s.layer)).size, Object.keys(EXPORT.spots).length, 'layer names are unique');
}

// ---------- the export code must stay lazy: nothing on the page's first load may import it ----------
{
  const dir = new URL('../material-preview/', import.meta.url);
  const exportModules = ['exportFiles', 'productionSpec', 'pdfBuild', 'svgBuild', 'svgConvert', 'pdf', 'svgPath'];
  const { readdirSync } = await import('node:fs');
  const base = readdirSync(dir).filter((f) => f.endsWith('.js') && !exportModules.includes(f.replace(/\.js$/, '')));
  assert.ok(base.includes('app.js') && base.includes('panel.js'));
  const staticImport = new RegExp(`(?:^|\\n)\\s*import\\b[^;]*?from\\s*['"]\\./(${exportModules.join('|')})\\.js['"]`);
  for (const f of base) assert.doesNotMatch(readFileSync(new URL(f, dir), 'utf8'), staticImport, `${f} must not statically import export code (it is loaded on demand)`);
  assert.match(readFileSync(new URL('panel.js', dir), 'utf8'), /import\('\.\/exportFiles\.js'\)/, 'the panel loads the exporter on demand');
  assert.match(readFileSync(new URL('panel.js', dir), 'utf8'), /import\('\.\/productionSpec\.js'\)/, 'and the planner when the step is opened');
}

console.log('Material preview export test passed');
