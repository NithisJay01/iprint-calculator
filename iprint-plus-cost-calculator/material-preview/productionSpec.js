/**
 * productionSpec.js — what goes into a production file, worked out from the card state. Pure (no DOM).
 *
 * Page coordinates: millimetres, y DOWN, origin at the top-left of the page ("media"). The card's own coordinates
 * (shape.js: mm, y up, centred on the cut shape) are converted with plan.toPage().
 *
 *   media   the page. = the artwork frame (card + bleed, or the die-cut file's artboard), + a margin for crop marks
 *   bleed   the artwork frame (where artwork may reach)
 *   trim    the bounding box of the cut shape
 *   layers  Artwork, Dieline, one per finish, Marks — the finish and the die-line are separated as named spot colours
 */
import { EXPORT, paperMaterials, coatings, finishes, SHAPE_KINDS } from './materials.js';
import { rectSegments, ellipseSegments, polySegments } from './svgPath.js';
import { effectiveDpi } from './shape.js';
import { asciiOnly } from './pdf.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mm = (v) => `${+v.toFixed(1)}`;
const dateStamp = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

/** Distances from the cut shape's bounding box to each edge of the artwork frame (mm). */
export function bleedMargins(spec) {
  const { frame, bounds } = spec;
  const hw = bounds.w / 2;
  const hh = bounds.h / 2;
  return {
    left: -hw - (frame.cx - frame.w / 2),
    right: frame.cx + frame.w / 2 - hw,
    bottom: -hh - (frame.cy - frame.h / 2),
    top: frame.cy + frame.h / 2 - hh,
  };
}

/** The die-line as segments in PAGE mm. Presets are exact curves; a die-cut file is its (finely sampled) outline. */
export function dielineSegments(spec, params, toPage) {
  const { bounds } = spec;
  if (spec.kind === 'custom') {
    return { exact: false, segs: spec.rings.flatMap((ring) => polySegments(ring.map((p) => toPage(p.x, p.y)), true)) };
  }
  const [cx, cy] = toPage(0, 0);
  const x = cx - bounds.w / 2;
  const y = cy - bounds.h / 2;
  if (spec.kind === 'ellipse') return { exact: true, segs: ellipseSegments(cx, cy, bounds.w / 2, bounds.h / 2) };
  const r = spec.kind === 'rounded' ? clamp(Number(params?.radius) || 0, 0, Math.min(bounds.w, bounds.h) / 2) : 0;
  return { exact: true, segs: rectSegments(x, y, bounds.w, bounds.h, r >= 0.05 ? r : 0, r >= 0.05 ? r : 0) };
}

const line = (x1, y1, x2, y2) => ({
  type: 'path',
  segs: [{ t: 'M', x: x1, y: y1 }, { t: 'L', x: x2, y: y2 }],
  fill: null,
  stroke: { spot: 'registration', tint: 1, width: EXPORT.hairlineMm, cap: 0, join: 0, miter: 10, dash: [] },
  rule: 'nonzero',
  overprint: false,
});

/** Crop marks at the four corners of the trim box, outside the bleed. */
export function cropMarks(trim, margins) {
  const { length, gap } = EXPORT.cropMarkMm;
  const out = [];
  for (const y of [trim.y0, trim.y1]) {
    out.push(line(trim.x0 - margins.left - gap - length, y, trim.x0 - margins.left - gap, y));
    out.push(line(trim.x1 + margins.right + gap, y, trim.x1 + margins.right + gap + length, y));
  }
  for (const x of [trim.x0, trim.x1]) {
    out.push(line(x, trim.y0 - margins.top - gap - length, x, trim.y0 - margins.top - gap));
    out.push(line(x, trim.y1 + margins.bottom + gap, x, trim.y1 + margins.bottom + gap + length));
  }
  return out;
}

/**
 * @param {object} input
 *   spec        card.spec                       params  the shape params (kind, width, height, radius, bleed)
 *   cut         the loaded die-cut file or null paperId / coatingId / finishId
 *   art, mask   { name, kind: 'svg'|'raster', aspect, pixelWidth?, warnings? } or null (Layer 1 / Layer 3)
 *   options     { colorMode: 'rgb'|'cmyk', cropMarks: boolean, jobPage: boolean }
 */
export function buildProductionPlan({ spec, params = {}, cut = null, paperId, coatingId = 'none', finishId = 'none', art = null, mask = null, options = {}, now = new Date() }) {
  const opts = { colorMode: 'rgb', cropMarks: false, jobPage: true, ...options };
  const margin = opts.cropMarks ? EXPORT.marginMm : 0;
  const { frame, bounds } = spec;
  const media = { w: frame.w + 2 * margin, h: frame.h + 2 * margin };
  const frameLeft = frame.cx - frame.w / 2;
  const frameTop = frame.cy + frame.h / 2;
  const toPage = (x, y) => [margin + (x - frameLeft), margin + (frameTop - y)];
  const frameRect = { x0: margin, y0: margin, w: frame.w, h: frame.h };
  const [cx, cy] = toPage(0, 0);
  const trim = { x0: cx - bounds.w / 2, y0: cy - bounds.h / 2, x1: cx + bounds.w / 2, y1: cy + bounds.h / 2 };
  const bleed = { x0: frameRect.x0, y0: frameRect.y0, x1: frameRect.x0 + frameRect.w, y1: frameRect.y0 + frameRect.h };
  const margins = bleedMargins(spec);
  const minMargin = Math.min(margins.left, margins.right, margins.top, margins.bottom);
  const die = dielineSegments(spec, params, toPage);

  const finish = finishId !== 'none' && finishes[finishId]?.layer
    ? { id: finishId, label: finishes[finishId].label, spot: EXPORT.spots[finishId], layerName: EXPORT.spots[finishId].layer, hasShape: Boolean(mask) }
    : null;

  const paper = paperMaterials[paperId]?.label ?? String(paperId);
  const coating = coatings[coatingId]?.label ?? '';
  const shapeLabel = SHAPE_KINDS.find((k) => k.id === (spec.kind === 'custom' ? 'custom' : params.kind ?? spec.kind))?.label ?? spec.kind;
  const sizeText = `${mm(bounds.w)} x ${mm(bounds.h)} mm`;

  /* ------------------------------------------------------------ checks */
  const checks = [];
  const add = (level, text) => checks.push({ level, text });
  if (!art) add('error', 'ยังไม่ได้อัปโหลดไฟล์งาน Layer 1 — ส่งออกไม่ได้ (การ์ดเดโมไม่ใช่งานของลูกค้า)');
  else add('ok', `Layer 1: ${art.name}`);

  if (minMargin >= EXPORT.minBleedMm - 0.05) add('ok', `Bleed ${mm(minMargin)} mm`);
  else if (minMargin > 0.05) add('warn', `Bleed แค่ ${mm(minMargin)} mm (ควร ${EXPORT.minBleedMm} mm ขึ้นไป) — งานที่ชนขอบอาจเห็นขอบขาวหลังตัด`);
  else add('warn', `ไม่มี Bleed — งานที่ชนขอบมีความเสี่ยงเห็นขอบขาวหลังตัด ควรใช้ไฟล์ที่มี Bleed ${EXPORT.minBleedMm} mm`);

  if (spec.kind === 'custom') {
    if (cut?.kind === 'png') add('warn', 'ไดไลน์มาจากภาพ PNG (คลาดเคลื่อนประมาณ ±0.1 mm) — ใช้อ้างอิงเท่านั้น ควรใช้ SVG สำหรับผลิต');
    else add('ok', 'ไดไลน์จากไฟล์ SVG (เส้นหลายจุด คลาดเคลื่อนน้อยกว่า 0.05 mm)');
  } else add('ok', `ไดไลน์เป็นเส้นโค้งสมบูรณ์ (${shapeLabel})`);

  if (art?.kind === 'raster' && art.pixelWidth) {
    const dpi = effectiveDpi(art.pixelWidth, frame.w);
    if (dpi < EXPORT.minDpi) add('warn', `Layer 1 ความละเอียดประมาณ ${Math.round(dpi)} dpi (ควร ${EXPORT.minDpi} ขึ้นไป) — ระบบไม่ย่อภาพ แต่แก้ความคมให้ไม่ได้`);
    else add('ok', `Layer 1 ความละเอียดประมาณ ${Math.round(dpi)} dpi`);
  }
  // (the "guides hidden" message is not a problem: guides are simply left out, which is what production wants)
  for (const w of (art?.warnings ?? []).filter((t) => !/^ซ่อนเส้นไกด์/.test(t))) add('warn', `Layer 1: ${w}`);

  if (finish && !finish.hasShape) add('warn', `${finish.label}: ยังไม่มีไฟล์รูปทรง Layer 3 — จะไม่ถูกใส่ในไฟล์`);
  else if (finish) add('ok', `${finish.label} → เลเยอร์ "${finish.layerName}" สีพิเศษ "${finish.spot.name}" 100%`);
  else add('ok', 'ไม่มีเทคนิคพิเศษ');
  for (const w of (mask?.warnings ?? []).filter((t) => !/^ซ่อนเส้นไกด์/.test(t))) add('warn', `Layer 3: ${w}`);

  if (coatingId !== 'none') add('ok', `${coating} — บันทึกในหน้าสรุปสเปก (ไม่ใช่งานพิมพ์)`);
  add(opts.colorMode === 'cmyk' ? 'warn' : 'ok', opts.colorMode === 'cmyk' ? 'CMYK แบบง่าย (ไม่ใช้โปรไฟล์ ICC) — สีอาจเพี้ยนจากบนจอ' : 'สีงานพิมพ์เป็น RGB — ฝ่ายผลิตแปลงเป็น CMYK');
  add('note', 'ไฟล์นี้สร้างจากพรีวิว ให้ฝ่ายผลิตตรวจก่อนพิมพ์ (ยังไม่ใช่ PDF/X และยังไม่ผ่าน preflight)');

  /* ----------------------------------------------------------- job page */
  const relief = finish && (finishId === 'emboss' || finishId === 'deboss') ? ' (relief depth: set by prepress)' : '';
  const jobLines = [
    'iPrint - production file (generated by Material Preview)',
    `Date: ${now.toISOString().slice(0, 10)}`,
    `Trim size: ${sizeText}   Shape: ${asciiOnly(shapeLabel) === shapeLabel ? shapeLabel : spec.kind}${spec.kind === 'rounded' ? ` (radius ${mm(Number(params.radius) || 0)} mm)` : ''}`,
    `Artwork frame: ${mm(frame.w)} x ${mm(frame.h)} mm   Bleed: ${mm(Math.max(0, minMargin))} mm`,
    `Paper: ${asciiOnly(paper)}`,
    `Lamination: ${coatingId === 'none' ? 'none' : coatingId === 'matte' ? 'matte' : coatingId === 'gloss' ? 'gloss' : asciiOnly(coating)}`,
    finish ? `Finish: ${asciiOnly(finish.label)} - layer "${finish.layerName}", spot colour "${finish.spot.name}" 100%, overprint${relief}` : 'Finish: none',
    `Artwork file: ${asciiOnly(art?.name ?? '-')}`,
    finish ? `Finish shape file: ${asciiOnly(mask?.name ?? '-')}` : '',
    `Die-line: layer "${EXPORT.spots.dieline.layer}", spot colour "${EXPORT.spots.dieline.name}" (${die.exact ? 'exact curves' : 'polyline from file'})`,
    `Colour: ${opts.colorMode === 'cmyk' ? 'simple CMYK conversion (no ICC profile)' : 'RGB - convert at prepress'}`,
    'Generated from a preview: prepress must check before printing. Not PDF/X.',
  ].filter(Boolean);

  const fileBase = `iprint-${dateStamp(now)}-${mm(bounds.w)}x${mm(bounds.h)}mm-${paperId}${finish ? `-${finishId}` : ''}`;

  return {
    options: opts,
    media,
    frameRect,
    trim,
    bleed,
    margins,
    toPage,
    dieline: die,
    marks: opts.cropMarks ? cropMarks(trim, margins) : [],
    finish,
    checks,
    blocking: checks.some((c) => c.level === 'error'),
    jobLines: opts.jobPage ? jobLines : null,
    info: {
      title: `iPrint production file ${sizeText}`,
      subject: `Paper: ${paper}; Lamination: ${coatingId === 'none' ? 'none' : coatingId}; Finish: ${finish ? finish.label : 'none'}`,
      keywords: ['iPrint', 'production', paperId, finishId].join(', '),
    },
    fileBase,
    now,
  };
}

/**
 * Put the plan and the drawn layers together into the job description both exporters (pdfBuild / svgBuild) read.
 *   artItems / artSvgInner   Layer 1 as path+image items (PDF and SVG) and, for an SVG file, the original markup (SVG export)
 *   finishItems              Layer 3 as path items in the finish's spot colour
 *   images                   { id: { width, height, colorSpace, bpc, filter, data, smask, decode, dataUrl } }
 */
export function assembleJob({ plan, artItems = [], artSvgInner = null, finishItems = [], images = {} }) {
  const die = {
    type: 'path',
    segs: plan.dieline.segs,
    fill: null,
    stroke: { spot: 'dieline', tint: 1, width: EXPORT.hairlineMm, cap: 0, join: 0, miter: 10, dash: [] },
    rule: 'nonzero',
    overprint: true,
  };
  const layers = [{ name: 'Artwork', items: artItems, svgInner: artSvgInner }, { name: EXPORT.spots.dieline.layer, items: [die] }];
  if (plan.finish?.hasShape) layers.push({ name: plan.finish.layerName, items: finishItems });
  if (plan.marks.length) layers.push({ name: EXPORT.spots.registration.layer, items: plan.marks });

  const spots = { dieline: EXPORT.spots.dieline };
  if (plan.finish) spots[plan.finish.id] = plan.finish.spot;
  if (plan.marks.length) spots.registration = EXPORT.spots.registration;

  return {
    ...plan.info,
    date: plan.now,
    media: plan.media,
    trim: plan.trim,
    bleed: plan.bleed,
    frameRect: plan.frameRect,
    colorMode: plan.options.colorMode,
    layers,
    spots,
    images,
    jobPage: plan.jobLines,
    fileBase: plan.fileBase,
  };
}
