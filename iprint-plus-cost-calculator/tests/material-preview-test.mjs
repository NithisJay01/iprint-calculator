import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import {
  polygonArea, boundsOf, pointInRing, simplifyRing, ringSelfIntersects, validateRings,
  presetOutline, buildSpec, clampSize, textureSizeFor, containRect, compareAspect, suggestBleed, effectiveDpi,
  registrationNotes, readImageSize, shapeFieldFromRgba, traceContours, outlineFromField, SIZE_LIMITS, previewScaleFor, previewSpec
} from '../material-preview/shape.js';
import {
  paperMaterials, coatings, finishes, FINISH_ORDER, SHAPE_KINDS, SIZE_PRESETS, BLEED_OPTIONS, TEXTURE_BUDGET, DEFAULT_SHAPE, DEFAULTS
} from '../material-preview/materials.js';
import { flickDirection } from '../material-preview/input.js';

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: got ${actual}, expected ${expected} ± ${tolerance}`);

// ---------- preset outlines ----------
{
  const [rect] = presetOutline('rect', 90, 54);
  near(polygonArea(rect), 90 * 54, 1e-6, 'rectangle area');
  const [rounded] = presetOutline('rounded', 90, 54, 4);
  near(polygonArea(rounded), 90 * 54 - (4 - Math.PI) * 16, 0.5, 'rounded rectangle area');
  const [ellipse] = presetOutline('ellipse', 60, 40);
  near(polygonArea(ellipse) / (Math.PI * 30 * 20), 1, 0.01, 'ellipse area');
  const [circle] = presetOutline('ellipse', 55, 55);
  const b = boundsOf([circle]);
  near(b.maxX - b.minX, 55, 0.6, 'circle width');
  const [zero] = presetOutline('rounded', 90, 54, 0);
  assert.equal(zero.length, 4, 'a 0 mm radius is a plain rectangle');
  const [huge] = presetOutline('rounded', 90, 54, 999);
  near(boundsOf([huge]).maxY - boundsOf([huge]).minY, 54, 1e-6, 'a radius larger than the card is clamped');
  for (const ring of [rect, rounded, ellipse]) assert.equal(validateRings([ring]).ok, true, 'presets are valid outlines');
}

// ---------- spec ----------
{
  const spec = buildSpec({ kind: 'rect', width: 90, height: 54 });
  assert.deepEqual(spec.bounds, { w: 90, h: 54 });
  assert.deepEqual(spec.frame, { cx: 0, cy: 0, w: 90, h: 54 });
  const bled = buildSpec({ kind: 'rounded', width: 90, height: 54, radius: 3, bleed: 3 });
  assert.deepEqual(bled.frame, { cx: 0, cy: 0, w: 96, h: 60 }, 'bleed grows the artwork frame, not the card');
  assert.deepEqual(bled.bounds, { w: 90, h: 54 });
  assert.equal(clampSize(5), SIZE_LIMITS.min);
  assert.equal(clampSize(5000), SIZE_LIMITS.max);
  assert.equal(clampSize('abc'), 90);
  assert.equal(buildSpec({ width: 5000, height: 1 }).bounds.w, SIZE_LIMITS.max, 'sizes are clamped');

  // big jobs keep their ratio and are previewed as a scale model; the real size is untouched
  assert.equal(previewScaleFor({ w: 90, h: 54 }), 1, 'a business card is shown at real size');
  assert.equal(previewScaleFor({ w: 150, h: 150 }), 1);
  assert.equal(previewScaleFor({ w: 300, h: 100 }), 2);
  assert.equal(previewScaleFor({ w: 700, h: 200 }), 5);
  assert.equal(previewScaleFor({ w: 1000, h: 1000 }), 10, 'the largest job still fits the preview');
  const poster = buildSpec({ kind: 'rounded', width: 600, height: 400, radius: 10, bleed: 3 });
  assert.deepEqual(poster.bounds, { w: 600, h: 400 }, 'no side is clamped on its own: the ratio stays');
  const model = previewSpec(poster);
  assert.equal(model.scale, 5);
  assert.deepEqual(model.bounds, { w: 120, h: 80 });
  near(model.frame.w, 606 / 5, 1e-9, 'bleed shrinks with the model');
  near(model.bounds.w / model.bounds.h, 1.5, 1e-9, 'same ratio as the job');
  assert.equal(model.thickness, poster.thickness, 'the model keeps real card thickness');
  assert.ok(model.rings[0].every((p) => Math.abs(p.x) <= 60 + 1e-9 && Math.abs(p.y) <= 40 + 1e-9), 'outline scaled');
  assert.equal(previewSpec(buildSpec({ width: 90, height: 54 })).scale, 1);
  assert.equal(buildSpec({ bleed: 99 }).bleed, 10, 'bleed is clamped');
}

// ---------- custom die-cut is scaled by the cut width and keeps the file frame ----------
{
  // a 200 x 100 unit shape, offset inside a 260 x 160 unit file (30 units of margin left/right, 20 / 40 top/bottom)
  const ring = [{ x: 30, y: 40 }, { x: 230, y: 40 }, { x: 230, y: 140 }, { x: 30, y: 140 }];
  const spec = buildSpec({ kind: 'custom', width: 80, custom: { rings: [ring], frame: { x0: 0, y0: 0, x1: 260, y1: 160 } } });
  near(spec.bounds.w, 80, 1e-6, 'cut width');
  near(spec.bounds.h, 40, 1e-6, 'cut height keeps the shape aspect');
  const b = boundsOf(spec.rings);
  near((b.minX + b.maxX) / 2, 0, 1e-6, 'outline is centred');
  near(spec.frame.w, 104, 1e-6, 'frame scales with the shape');
  near(spec.frame.h, 64, 1e-6, 'frame height');
  near(spec.frame.cx, 0, 1e-6, 'frame is centred horizontally (equal margins)');
  near(spec.frame.cy, -4, 1e-6, 'frame is offset vertically (margins 40 below / 20 above = 10 units off-centre, 0.4 mm per unit)');
  const tiny = buildSpec({ kind: 'custom', width: 5, custom: { rings: [ring], frame: { x0: 0, y0: 0, x1: 260, y1: 160 } } });
  assert.ok(Math.min(tiny.bounds.w, tiny.bounds.h) >= SIZE_LIMITS.min - 1e-6, 'custom shapes respect the minimum size');
  assert.equal(buildSpec({ kind: 'custom', width: 60 }).kind, 'rect', 'custom without a file falls back to a rectangle');
}

// ---------- texture budget ----------
{
  const desktop = { ppm: 1536 / 90, pixels: 1536 * 922 };
  const t = textureSizeFor(90, 54, desktop);
  assert.deepEqual([t.width, t.height], [1536, 922], 'the standard card keeps the tuned texture size');
  const big = textureSizeFor(150, 150, desktop);
  assert.ok(big.width * big.height <= desktop.pixels * 1.02, 'big frames stay inside the pixel budget');
  assert.ok(big.ppm < desktop.ppm);
  const small = textureSizeFor(30, 30, desktop);
  near(small.ppm, desktop.ppm, 1e-6, 'small frames keep full detail');
}

// ---------- fitting and registration ----------
{
  const r = containRect(200, 100, 100, 100);
  assert.deepEqual(r, { x: 0, y: 25, w: 100, h: 50 }, 'contain never stretches');
  assert.equal(compareAspect(1.6667, 90 / 54), true);
  assert.equal(compareAspect(1.5, 90 / 54), false);
  assert.equal(suggestBleed(96 / 60, 90, 54), 3, 'a 96 x 60 file on a 90 x 54 card has 3 mm bleed');
  assert.equal(suggestBleed(90 / 54, 90, 54), null, 'no suggestion when the file already fits');
  assert.equal(suggestBleed(1, 90, 54), null);
  near(effectiveDpi(1536, 90), 433.5, 0.5, 'dpi');

  const spec = buildSpec({ kind: 'rect', width: 90, height: 54 });
  assert.deepEqual(registrationNotes({ spec, art: { aspect: 90 / 54 }, mask: { aspect: 90 / 54 } }), []);
  const notes = registrationNotes({ spec, art: { aspect: 96 / 60, pixelWidth: 4000 }, mask: { aspect: 90 / 54 } });
  assert.equal(notes.length, 2, 'aspect mismatch with the frame + mismatch between the layers');
  assert.ok(notes.some((n) => n.text.includes('Bleed 3 mm')), 'suggests the bleed');
  const lowRes = registrationNotes({ spec, art: { aspect: 90 / 54, pixelWidth: 400 }, mask: null });
  assert.ok(lowRes.some((n) => /ความละเอียดต่ำ/.test(n.text)), 'warns about low resolution');
}

// ---------- image headers ----------
{
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(png.buffer).setUint32(16, 3000);
  new DataView(png.buffer).setUint32(20, 1800);
  assert.deepEqual(readImageSize(png), { type: 'png', width: 3000, height: 1800 });

  // JPEG: SOI, an APP0 segment to skip, then SOF0 (height 1080, width 1800)
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x08, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(readImageSize(jpg), { type: 'jpeg', width: 1800, height: 1080 });

  const webpX = new Uint8Array(40);
  webpX.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  webpX.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
  webpX.set([...'VP8X'].map((c) => c.charCodeAt(0)), 12);
  webpX.set([(2000 - 1) & 255, ((2000 - 1) >> 8) & 255, 0, (1200 - 1) & 255, ((1200 - 1) >> 8) & 255, 0], 24);
  assert.deepEqual(readImageSize(webpX), { type: 'webp', width: 2000, height: 1200 });

  const webpL = new Uint8Array(40);
  webpL.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  webpL.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
  webpL.set([...'VP8L'].map((c) => c.charCodeAt(0)), 12);
  const w = 800 - 1;
  const h = 500 - 1;
  webpL.set([0x2f, w & 255, ((w >> 8) & 0x3f) | ((h & 3) << 6), (h >> 2) & 255, (h >> 10) & 15], 20);
  assert.deepEqual(readImageSize(webpL), { type: 'webp', width: 800, height: 500 });

  assert.equal(readImageSize(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null, 'unknown data');
  assert.equal(readImageSize(new Uint8Array(0)), null, 'empty data');
}

// ---------- outline from a picture ----------
const makeField = (w, h, paint) => {
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = paint(x, y) ? 1 : 0;
  return f;
};
{
  // filled rectangle 40 x 30 inside 100 x 60
  const w = 100;
  const h = 60;
  const rect = makeField(w, h, (x, y) => x >= 30 && x < 70 && y >= 5 && y < 35);
  const res = outlineFromField(rect, w, h);
  assert.equal(res.rings.length, 1);
  near(Math.abs(polygonArea(res.rings[0])), 40 * 30, 40 * 30 * 0.06, 'rectangle area survives smoothing');
  const b = boundsOf(res.rings);
  near(b.maxX - b.minX, 40, 1.6, 'width');
  near((b.minY + b.maxY) / 2, h - 20, 1, 'y is up: rows 5..35 from the top are centred at y = 60 - 20');
  assert.equal(validateRings(res.rings).ok, true);

  // ring with a hole
  const ringField = makeField(w, h, (x, y) => x >= 10 && x < 90 && y >= 8 && y < 52 && !(x >= 20 && x < 32 && y >= 25 && y < 37));
  const withHole = outlineFromField(ringField, w, h);
  assert.equal(withHole.rings.length, 2, 'outer edge + one hole');
  near(Math.abs(polygonArea(withHole.rings[1])), 12 * 12, 12 * 12 * 0.2, 'hole area');
  assert.equal(validateRings(withHole.rings).ok, true);
  assert.ok(pointInRing(withHole.rings[1][0], withHole.rings[0]), 'the hole is inside the outer edge');

  // circle: many vertices before simplification, few after
  const circleField = makeField(120, 120, (x, y) => (x - 60) ** 2 + (y - 60) ** 2 <= 45 ** 2);
  const circle = outlineFromField(circleField, 120, 120);
  near(Math.abs(polygonArea(circle.rings[0])) / (Math.PI * 45 * 45), 1, 0.03, 'circle area');
  assert.ok(circle.rings[0].length > 20 && circle.rings[0].length < 400, `simplified circle has a sane vertex count (${circle.rings[0].length})`);

  // two separate pieces: the biggest wins, the caller is told there were more
  const two = makeField(w, h, (x, y) => (x >= 5 && x < 50 && y >= 5 && y < 50) || (x >= 70 && x < 90 && y >= 20 && y < 40));
  const pieces = outlineFromField(two, w, h);
  assert.equal(pieces.rings.length, 1);
  assert.equal(pieces.pieces, 2);
  near(Math.abs(polygonArea(pieces.rings[0])), 45 * 45, 45 * 45 * 0.06, 'biggest piece is kept');

  // specks are ignored, an empty picture has no outline
  const speck = makeField(w, h, (x, y) => x === 50 && y === 30);
  assert.equal(outlineFromField(speck, w, h), null);
  assert.equal(outlineFromField(new Float32Array(w * h), w, h), null);

  // saddle points (diagonal pixels) must still close into loops
  const checker = makeField(4, 4, (x, y) => (x + y) % 2 === 0);
  assert.ok(traceContours(checker, 4, 4).every((loop) => loop.length >= 3), 'checkerboard loops close');
}

// ---------- shape field from pixels ----------
{
  const rgba = new Uint8ClampedArray(4 * 4);
  // pixel 0: opaque black, pixel 1: transparent, pixel 2: half transparent, pixel 3: opaque white
  rgba.set([0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 128, 255, 255, 255, 255]);
  const alpha = shapeFieldFromRgba(rgba, 4, 1);
  assert.equal(alpha.usedBrightness, false, 'any transparency means the alpha channel is the shape');
  near(alpha.field[0], 1, 1e-6, 'opaque pixel');
  near(alpha.field[1], 0, 1e-6, 'transparent pixel');
  near(alpha.field[2], 128 / 255, 1e-6, 'partial pixel');

  const flat = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  const dark = shapeFieldFromRgba(flat, 2, 1);
  assert.equal(dark.usedBrightness, true);
  near(dark.field[0], 1, 1e-6, 'dark = shape by default');
  near(dark.field[1], 0, 1e-6, 'white = no shape');
  // an opaque picture whose outermost pixels are semi-transparent from resampling is still an opaque picture
  const edged = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const edge = x === 0 || y === 0 || x === 7 || y === 7;
      const black = x >= 3 && x <= 4 && y >= 3 && y <= 4;
      edged.set([black ? 0 : 255, black ? 0 : 255, black ? 0 : 255, edge ? 128 : 255], (y * 8 + x) * 4);
    }
  }
  const resampled = shapeFieldFromRgba(edged, 8, 8);
  assert.equal(resampled.usedBrightness, true, 'faint edge pixels must not switch an opaque picture to alpha mode');
  near(resampled.field[3 * 8 + 3], 1, 1e-6, 'the black centre is the shape');
  near(resampled.field[1 * 8 + 1], 0, 1e-6, 'the white interior is not');
  // a PNG that is transparent inside the picture stays in alpha mode even with a solid border
  const hollow = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < 64; i++) hollow.set([255, 255, 255, i === 27 ? 255 : 0], i * 4);
  assert.equal(shapeFieldFromRgba(hollow, 8, 8).usedBrightness, false, 'transparency inside the picture = alpha mode');

  const flipped = shapeFieldFromRgba(flat, 2, 1, { invert: true });
  near(flipped.field[0], 0, 1e-6, 'invert swaps them');
  near(flipped.field[1], 1, 1e-6, 'invert swaps them');
}

// ---------- validation ----------
{
  const bowTie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
  assert.equal(ringSelfIntersects(bowTie), true);
  assert.equal(validateRings([bowTie]).ok, false, 'crossing edges are rejected');
  assert.match(validateRings([bowTie]).message, /ตัดกันเอง/);
  assert.equal(validateRings([bowTie]).code, 'cross', 'failures carry a machine-readable code');
  assert.equal(validateRings([]).code, 'empty');
  assert.equal(validateRings([]).ok, false);
  assert.equal(validateRings([[{ x: 0, y: 0 }, { x: 1, y: 1 }]]).ok, false, 'fewer than three points');
  assert.equal(validateRings([[{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0, y: 0.1 }]], { minArea: 1 }).ok, false, 'too small');
  const outer = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.equal(validateRings([outer, [{ x: 20, y: 20 }, { x: 22, y: 20 }, { x: 22, y: 22 }]]).ok, false, 'a hole outside the shape');
  assert.equal(validateRings([outer, [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }]]).ok, true, 'a hole inside is fine');
  const dense = Array.from({ length: 5000 }, (_, i) => ({ x: Math.cos(i / 800) * 10, y: Math.sin(i / 800) * 10 }));
  assert.equal(validateRings([dense]).ok, false, 'too many points');

  const noisy = Array.from({ length: 400 }, (_, i) => ({ x: i / 4, y: 0.001 * Math.sin(i) }));
  const line = [...noisy, { x: 100, y: 30 }, { x: 0, y: 30 }];
  assert.ok(simplifyRing(line, 0.05).length < 10, 'nearly straight runs collapse');
}

// ---------- config: everything the panel builds its buttons from ----------
{
  for (const [id, paper] of Object.entries(paperMaterials)) {
    assert.ok(paper.label && paper.description, `${id}: label and description`);
    assert.match(paper.color, /^#[0-9a-f]{6}$/i, `${id}: colour`);
    assert.ok(paper.roughness >= 0 && paper.roughness <= 1, `${id}: roughness 0..1`);
    if (Object.values(paper.maps).includes('procedural')) {
      assert.ok(paper.procedural?.octaves?.length, `${id}: a procedural paper needs a recipe`);
      assert.ok(paper.procedural.reliefUm > 0, `${id}: relief`);
    }
  }
  for (const [id, c] of Object.entries(coatings)) {
    assert.ok(c.label && c.description, `${id}: label and description`);
    assert.ok(c.clearcoat >= 0 && c.clearcoat <= 1, `${id}: clearcoat 0..1`);
    assert.ok(c.clearcoatRoughness >= 0 && c.clearcoatRoughness <= 1, `${id}: clearcoat roughness 0..1`);
    assert.ok(c.normalMul >= 0 && c.normalMul <= 1, `${id}: grain passes through 0..1`);
    assert.ok(c.roughness === null || (c.roughness >= 0 && c.roughness <= 1), `${id}: roughness`);
  }
  assert.equal(coatings.none.clearcoat, 0, 'no lamination = no film');
  assert.equal(coatings.none.normalMul, 1, 'no lamination = full paper grain');
  assert.ok(coatings.gloss.clearcoatRoughness < coatings.matte.clearcoatRoughness, 'gloss is smoother than matte');
  assert.ok(coatings.gloss.normalMul <= coatings.matte.normalMul, 'gloss hides at least as much grain as matte');

  assert.deepEqual([...FINISH_ORDER].sort(), Object.keys(finishes).sort(), 'every finish has a chip and every chip a finish');
  for (const [id, f] of Object.entries(finishes)) {
    assert.ok(f.label && f.description, `${id}: label and description`);
    if (!f.layer) continue;
    assert.ok(['foil', 'gloss', 'emboss'].includes(f.layer.type), `${id}: known layer type`);
    assert.equal(f.layer.mask, 'shape', `${id}: driven by the Layer 3 shape`);
    if (f.layer.type === 'foil') assert.match(f.layer.color, /^#[0-9a-f]{6}$/i, `${id}: foil colour`);
    if (f.layer.type === 'emboss') assert.ok(Number.isFinite(f.layer.heightUm) && f.layer.heightUm !== 0, `${id}: relief height`);
  }
  assert.ok(finishes.emboss.layer.heightUm > 0 && finishes.deboss.layer.heightUm < 0, 'emboss raises, deboss presses');
  assert.notEqual(finishes.silverFoil.layer.color, finishes.goldFoil.layer.color, 'silver is not gold');
  assert.equal(finishes.silverFoil.layer.type, 'foil');

  assert.deepEqual(SHAPE_KINDS.map((k) => k.id), ['rect', 'rounded', 'ellipse', 'custom']);
  assert.equal(new Set(SIZE_PRESETS.map((p) => p.id)).size, SIZE_PRESETS.length, 'preset ids are unique');
  for (const p of SIZE_PRESETS) assert.ok(p.w >= SIZE_LIMITS.min && p.h >= SIZE_LIMITS.min && p.w <= SIZE_LIMITS.max && p.h <= SIZE_LIMITS.max, `${p.id}: inside the size limits`);
  assert.ok(BLEED_OPTIONS.includes(0), 'bleed can be switched off');
  const desktop = textureSizeFor(90, 54, TEXTURE_BUDGET.desktop);
  assert.deepEqual([desktop.width, desktop.height], [1536, 922], 'the standard card keeps its tuned desktop texture size');
  const mobile = textureSizeFor(90, 54, TEXTURE_BUDGET.mobile);
  assert.deepEqual([mobile.width, mobile.height], [1024, 614], 'and its tuned mobile size');
  assert.ok(paperMaterials[DEFAULTS.paper] && coatings[DEFAULTS.coating] && finishes[DEFAULTS.finish], 'defaults exist');
  assert.equal(validateRings(buildSpec(DEFAULT_SHAPE).rings).ok, true, 'the default card is a valid outline');
}

// ---------- the page must survive the site CSP and ship with the Hostinger package ----------
{
  const dir = new URL('../material-preview/', import.meta.url);
  const html = readFileSync(new URL('index.html', dir), 'utf8');
  // .htaccess sends script-src 'self': no import map, no inline script, no inline handlers
  assert.doesNotMatch(html, /<script[^>]*type=["']importmap["']/i, 'an inline import map is blocked by script-src \'self\'');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert.match(m[1], /\bsrc=/, 'every script is external');
    assert.equal(m[2].trim(), '', 'no inline script body');
  }
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'no inline event handlers');
  assert.match(html, /<script type="module" src="app\.js/, 'the app is one module entry');

  const entries = readdirSync(dir);
  const modules = entries.filter((f) => f.endsWith('.js'));
  assert.ok(modules.length >= 12, 'all modules are in the folder');
  for (const f of modules) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'";]*?from\s*['"]([^'"]+)['"]/g)) {
      assert.match(m[1], /^\.\.?\//, `${f}: "${m[1]}" is a bare specifier — it would need an import map`);
    }
    assert.doesNotMatch(src, /\beval\s*\(|new Function\s*\(/, `${f}: no eval`);
    // Hostinger and GitHub Pages are case-sensitive, Windows is not: every import must match the file name exactly
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'";]*?from\s*['"](\.[^'"]+)['"]/g)) {
      const target = new URL(m[1], new URL(f, dir));
      const folder = new URL('./', target);
      const name = decodeURIComponent(target.pathname.split('/').pop());
      assert.ok(readdirSync(folder).includes(name), `${f}: import "${m[1]}" does not match a file name exactly (case matters on the server)`);
    }
  }
  // same for what index.html loads
  for (const m of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"]*)?"/g)) {
    if (/^(https?:|\/\/|mailto:)/.test(m[1])) continue;
    const target = new URL(m[1], dir);
    const segments = target.pathname.split('/').filter(Boolean);
    const parent = new URL(target.pathname.endsWith('/') ? '../' : './', target); // a link to a folder ends with "/"
    assert.ok(readdirSync(parent).includes(decodeURIComponent(segments[segments.length - 1])), `index.html: "${m[1]}" does not match a file or folder name exactly`);
  }
  assert.equal(entries.filter((f) => f.endsWith('.mjs')).length, 0, '.htaccess denies .mjs files');
  for (const file of ['vendor/three/three.module.min.js', 'vendor/three/three.core.js', 'vendor/three/LICENSE']) {
    assert.equal(existsSync(new URL(file, dir)), true, `${file} is vendored`);
  }
  for (const sample of ['sample-artwork.svg', 'sample-foil-shape.svg', 'sample-diecut-leaf.svg']) {
    assert.match(readFileSync(new URL(`assets/samples/${sample}`, dir), 'utf8'), /<svg[^>]+viewBox="0 0 96 60"/, `${sample} shares the 96 x 60 artboard`);
  }
  const pack = readFileSync(new URL('../../scripts/build-hostinger-package.ps1', import.meta.url), 'utf8');
  assert.match(pack, /'material-preview'/, 'the Hostinger package script must copy the folder');
}

// ---------- the buttons on the other pages that lead here ----------
{
  const app = readFileSync(new URL('../material-preview/app.js', import.meta.url), 'utf8');
  const site = new URL('../', import.meta.url);
  // every ?from= value the page understands, with the page its "back" link returns to
  const back = new Map([...app.matchAll(/\['([\w-]+)',\s*\['([^']+)',\s*'[^']+'\]\]/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual([...back.keys()].sort(), ['business-card', 'catalog', 'home'], 'app.js knows where each entry button came from');
  for (const [key, href] of back) {
    const target = new URL(href.split('#')[0], new URL('material-preview/', site));
    assert.equal(existsSync(new URL('index.html', target)), true, `the "${key}" back link (${href}) leads to a real page`);
  }

  const buttons = {
    'index.html': ['material-preview/', 'home'],
    'catalog/index.html': ['../material-preview/', 'catalog'],
    'business-card/index.html': ['../material-preview/', 'business-card'],
  };
  for (const [file, [folder, from]] of Object.entries(buttons)) {
    const page = readFileSync(new URL(file, site), 'utf8');
    const links = [...page.matchAll(/href="([^"]*material-preview\/[^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(links, [`${folder}?from=${from}`], `${file}: exactly one button, and it says where the visitor came from`);
    assert.equal(existsSync(new URL('index.html', new URL(folder, new URL(file, site)))), true, `${file}: the button leads to a real page`);
    assert.ok(back.has(from), `${file}: app.js handles from=${from}`);
  }
  // the "start" screen button is an <a>, so it needs the same no-underline rule as the catalog entry
  assert.match(readFileSync(new URL('css/app.css', site), 'utf8'), /\.material-entry\{text-decoration:none\}/);
  assert.match(readFileSync(new URL('catalog/styles.css', site), 'utf8'), /\.product-link\s*\{/);
}

// ---------- flick to turn the card over ----------
{
  const path = (x0, x1, y0, y1, ms, n = 8) => Array.from({ length: n + 1 }, (_, i) => ({ t: (ms * i) / n, x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }));
  assert.equal(flickDirection(path(0, 170, 0, 0, 120)), 1, 'a fast swipe to the right flips');
  assert.equal(flickDirection(path(0, -170, 0, 0, 120)), -1, 'a fast swipe to the left flips the other way');
  assert.equal(flickDirection(path(0, 170, 0, 0, 1000)), 0, 'a slow drag only tilts');
  assert.equal(flickDirection(path(0, 30, 0, 0, 40)), 0, 'a short twitch is not a flick');
  assert.equal(flickDirection(path(0, 120, 0, 150, 120)), 0, 'a diagonal / vertical swipe is not a flick');
  const stopThenLift = [...path(0, 170, 0, 0, 120), { t: 400, x: 170, y: 0 }];
  assert.equal(flickDirection(stopThenLift), 0, 'swipe, stop, then lift: the finger was still at release');
  const backtrack = [...path(0, 200, 0, 0, 300), ...path(200, 140, 0, 0, 60).slice(1).map((p) => ({ ...p, t: p.t + 300 }))];
  assert.equal(flickDirection(backtrack), 0, 'moving back against the stroke at release does not flip');
  assert.equal(flickDirection([{ t: 0, x: 0, y: 0 }]), 0);
}

console.log('Material preview test passed');
