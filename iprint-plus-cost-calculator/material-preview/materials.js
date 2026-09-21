/**
 * materials.js — every tunable "look" lives here. No rendering code.
 *
 * Adding a paper: add one entry to `paperMaterials` — its chip appears by itself. A procedural paper needs a recipe
 * tuned by eye (see `procedural` below); a scanned paper points `maps` at texture files instead (README).
 * Adding a lamination or a finish works the same way: one entry in `coatings` / `finishes`.
 *
 * Units: millimetres for anything physical, micrometres for surface relief.
 */

/** Pixels-per-millimetre and pixel budget of the artwork / paper textures (the standard 90 x 54 card = 1536 x 922 on desktop). */
export const TEXTURE_BUDGET = Object.freeze({
  mobile: Object.freeze({ ppm: 1024 / 90, pixels: 1024 * 614 }),
  desktop: Object.freeze({ ppm: 1536 / 90, pixels: 1536 * 922 }),
});

/** Card shapes offered as presets. A die-cut file is the fourth option ('custom'), handled by the shape panel. */
export const SHAPE_KINDS = [
  { id: 'rect', label: 'สี่เหลี่ยม' },
  { id: 'rounded', label: 'มุมมน' },
  { id: 'ellipse', label: 'วงกลม / วงรี' },
  { id: 'custom', label: 'ไดคัทจากไฟล์' },
];

export const SIZE_PRESETS = [
  { id: 'th', label: 'ไทย 90 × 54 mm', w: 90, h: 54 },
  { id: 'card', label: 'ขนาดบัตรเครดิต 85 × 55 mm', w: 85, h: 55 },
  { id: 'us', label: 'อเมริกา 89 × 51 mm', w: 89, h: 51 },
  { id: 'jp', label: 'ญี่ปุ่น 91 × 55 mm', w: 91, h: 55 },
  { id: 'square', label: 'จัตุรัส 55 × 55 mm', w: 55, h: 55 },
];

export const BLEED_OPTIONS = [0, 1, 2, 3, 5];

export const DEFAULT_SHAPE = Object.freeze({ kind: 'rect', width: 90, height: 54, radius: 3, bleed: 0 });

/**
 * Paper presets (the "Material" of Layer 1).
 *
 * Shading (MeshPhysicalMaterial):
 *   color / roughness / specularIntensity / sheen* / envMapIntensity / bumpScale
 *   normalScale  number, or [x, y] — use [1, -1] for a DirectX-style normal map (green channel down)
 *   edgeColor  colour of the cut edge (fibres are exposed there, so it reads a little lighter)
 * Maps:
 *   'procedural'  → generated at runtime by procedural.js
 *   'assets/…'    → a texture file; `tileMm` = how many mm one tile covers on the card
 *   null          → not used
 * Procedural recipe (only read when a map is 'procedural'):
 *   reliefUm  RMS surface height in micrometres → strength of the normal map
 *   octaves   value-noise layers: feature size in mm + relative weight (grain → formation)
 *   fibers    strokes: countPer100mm2, lengthMm[min,max], widthMm[min,max], weight, curvature, darkRatio
 *   weave     optional thread pattern (linen) — pitchMm, weight, irregularity
 *   pits      optional tiny craters — countPer100mm2, sizeMm, weight
 *   roughnessVariation  how much the roughness map dips (0–1)
 *   albedo    variation around 1.0: mottleMm/mottle (cloudiness), grain, fiber (tint), flecks
 */
export const paperMaterials = {
  smooth: {
    label: 'Smooth',
    description: 'ผิวเรียบ เกรนน้อย สะท้อนแสงนุ่ม — เหมาะกับกระดาษอาร์ต / Smooth Card',
    color: '#f8f6f1',
    roughness: 0.4,
    specularIntensity: 1.0,
    envMapIntensity: 1.0,
    normalScale: 0.5,
    bumpScale: 0.4,
    sheen: 0,
    sheenRoughness: 0.6,
    sheenColor: '#ffffff',
    edgeColor: '#f1eee7',
    maps: { color: 'procedural', normal: 'procedural', roughness: 'procedural', bump: null, tileMm: [90, 54] },
    procedural: {
      seed: 11,
      reliefUm: 5,
      octaves: [
        { sizeMm: 0.07, weight: 0.35 },
        { sizeMm: 0.3, weight: 0.4 },
        { sizeMm: 1.4, weight: 0.55 },
      ],
      fibers: null,
      weave: null,
      pits: null,
      roughnessVariation: 0.14,
      albedo: { mottleMm: 4, mottle: 0.006, grain: 0.006, fiber: 0, flecks: null },
    },
  },

  uncoated: {
    label: 'Uncoated',
    description: 'ผิวด้าน เห็นเม็ดกระดาษชัด สะท้อนแสงน้อย — Grain จะเด่นเมื่อแสงเฉียง',
    color: '#f4f0e6',
    roughness: 0.94,
    specularIntensity: 0.35,
    envMapIntensity: 0.9,
    normalScale: 1.0,
    bumpScale: 1.0,
    sheen: 0,
    sheenRoughness: 0.8,
    sheenColor: '#ffffff',
    edgeColor: '#f6f2e7',
    maps: { color: 'procedural', normal: 'procedural', roughness: 'procedural', bump: null, tileMm: [90, 54] },
    procedural: {
      seed: 23,
      reliefUm: 26,
      octaves: [
        { sizeMm: 0.04, weight: 0.65 },
        { sizeMm: 0.1, weight: 0.85 },
        { sizeMm: 0.32, weight: 0.55 },
        { sizeMm: 1.2, weight: 0.4 },
      ],
      fibers: { countPer100mm2: 70, lengthMm: [0.4, 1.6], widthMm: [0.02, 0.035], weight: 0.4, curvature: 0.4, darkRatio: 0.35 },
      weave: null,
      pits: { countPer100mm2: 60, sizeMm: 0.06, weight: 0.5 },
      roughnessVariation: 0.28,
      albedo: { mottleMm: 2.2, mottle: 0.022, grain: 0.02, fiber: 0.02, flecks: null },
    },
  },

  cotton: {
    label: 'Cotton',
    description: 'Cotton / Linen — เห็นเส้นใยและผิวไม่สม่ำเสมอ เมื่อเอียงจะเห็นพื้นผิวจากแสง',
    color: '#f5f1e7',
    roughness: 0.9,
    specularIntensity: 0.3,
    envMapIntensity: 0.9,
    normalScale: 1.1,
    bumpScale: 1.2,
    sheen: 0.55,
    sheenRoughness: 0.75,
    sheenColor: '#fff7ea',
    edgeColor: '#f8f4e9',
    maps: { color: 'procedural', normal: 'procedural', roughness: 'procedural', bump: null, tileMm: [90, 54] },
    procedural: {
      seed: 37,
      reliefUm: 42,
      octaves: [
        { sizeMm: 0.05, weight: 0.3 },
        { sizeMm: 0.16, weight: 0.45 },
        { sizeMm: 0.6, weight: 0.55 },
        { sizeMm: 2.4, weight: 0.5 },
      ],
      fibers: { countPer100mm2: 240, lengthMm: [1.2, 6], widthMm: [0.025, 0.055], weight: 1.0, curvature: 0.55, darkRatio: 0.4 },
      weave: { pitchMm: 0.55, weight: 0.32, irregularity: 0.7 },
      pits: null,
      roughnessVariation: 0.24,
      albedo: { mottleMm: 3, mottle: 0.02, grain: 0.012, fiber: 0.05, flecks: null },
    },
  },

  kraft: {
    label: 'Kraft',
    description: 'กระดาษคราฟท์สีน้ำตาลธรรมชาติ มีเส้นใย จุดสะเก็ด และผิวไม่เรียบ — ด้านสนิท',
    color: '#c9a476',
    roughness: 0.97,
    specularIntensity: 0.2,
    envMapIntensity: 0.8,
    normalScale: 1.1,
    bumpScale: 1.2,
    sheen: 0,
    sheenRoughness: 0.9,
    sheenColor: '#ffe8c8',
    edgeColor: '#dcbb8c',
    maps: { color: 'procedural', normal: 'procedural', roughness: 'procedural', bump: null, tileMm: [90, 54] },
    procedural: {
      seed: 53,
      reliefUm: 46,
      octaves: [
        { sizeMm: 0.05, weight: 0.5 },
        { sizeMm: 0.14, weight: 0.7 },
        { sizeMm: 0.5, weight: 0.6 },
        { sizeMm: 2.0, weight: 0.55 },
      ],
      fibers: { countPer100mm2: 170, lengthMm: [1, 5], widthMm: [0.03, 0.07], weight: 0.9, curvature: 0.45, darkRatio: 0.5 },
      weave: null,
      pits: { countPer100mm2: 40, sizeMm: 0.08, weight: 0.5 },
      roughnessVariation: 0.22,
      albedo: { mottleMm: 2.6, mottle: 0.06, grain: 0.03, fiber: 0.09, flecks: { countPer100mm2: 9, sizeMm: [0.1, 0.4], darkness: 0.5 } },
    },
  },
};

/**
 * Layer 2 — lamination: a clear film over the whole printed face.
 *   roughness         replaces the paper's own roughness (the film is what the light meets first)
 *   clearcoat*        the film's own specular layer
 *   normalMul         how much of the paper grain still shows through the film
 * The values are tuned by eye, not measured — compare them with real iPrint samples.
 */
export const coatings = {
  none: {
    label: 'ไม่เคลือบ',
    description: 'ผิวกระดาษตามธรรมชาติ ไม่มีฟิล์มเคลือบ',
    roughness: null,
    clearcoat: 0,
    clearcoatRoughness: 0.5,
    normalMul: 1,
  },
  matte: {
    label: 'เคลือบด้าน',
    description: 'ฟิล์มเคลือบด้าน — ผิวนุ่มเนียน สะท้อนแสงน้อย เม็ดกระดาษจางลง',
    roughness: 0.6,
    clearcoat: 0.4,
    clearcoatRoughness: 0.55,
    normalMul: 0.25,
  },
  gloss: {
    label: 'เคลือบเงา',
    description: 'ฟิล์มเคลือบเงา — ผิวมันวาว สะท้อนแสงชัด เม็ดกระดาษแทบมองไม่เห็น',
    roughness: 0.45,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    normalMul: 0.15,
  },
};

/**
 * Layer 3 — finishes. Each one is driven by the Layer 3 shape file (`mask: 'shape'`).
 *
 * layer.type
 *   'foil'    opaque metal plane over the shape (metalness 1, low roughness)
 *   'gloss'   clear varnish: specular only, additively blended, raised edge
 *   'emboss'  no plane at all — the paper's own normal map is rebuilt with the shape raised (+µm) or pressed in (−µm)
 * The plane follows the card outline, so nothing can float outside a die-cut edge.
 *
 * Adding Holographic Foil = copy `goldFoil` and set `iridescence` in createFinishMaterial (card.js).
 */
export const finishes = {
  none: {
    label: 'ไม่มี',
    description: 'ไม่มีเทคนิคพิเศษ — เห็นเฉพาะงานพิมพ์และผิววัสดุ',
    layer: null,
  },

  spotUV: {
    label: 'Spot UV',
    description: 'เคลือบเงา Spot UV — ชั้นใสมันวาวเฉพาะรูปทรงที่กำหนด',
    layer: {
      type: 'gloss',
      mask: 'shape',
      roughness: 0.035,
      ior: 1.52,
      specularIntensity: 1,
      envMapIntensity: 2.6,
      raisedUm: 28, // varnish sits slightly proud of the sheet
      normalScale: 1,
      z: 0.035,
    },
  },

  goldFoil: {
    label: 'Gold Foil',
    description: 'ฟอยล์ทอง — โลหะสะท้อนแสงเฉพาะรูปทรงที่กำหนด',
    layer: {
      type: 'foil',
      mask: 'shape',
      color: '#e7b95e',
      metalness: 1,
      roughness: 0.2,
      envMapIntensity: 1.0,
      normalScale: 1,
      debossUm: 22, // foil is pressed into the sheet
      followPaper: 0.55, // how much of the paper texture the foil picks up (0–1)
      z: 0.02,
    },
  },

  emboss: {
    label: 'Emboss',
    description: 'ปั๊มนูน — ยกพื้นผิวขึ้นเฉพาะรูปทรงที่กำหนด (เอียงให้แสงเฉียงจะเห็นชัด)',
    layer: { type: 'emboss', mask: 'shape', heightUm: 110 },
  },

  deboss: {
    label: 'Deboss',
    description: 'ปั๊มจม — กดพื้นผิวลงเฉพาะรูปทรงที่กำหนด (เอียงให้แสงเฉียงจะเห็นชัด)',
    layer: { type: 'emboss', mask: 'shape', heightUm: -90 },
  },
};

// Silver = the same stamp in another colour (nothing else to change).
finishes.silverFoil = {
  label: 'Silver Foil',
  description: 'ฟอยล์เงิน — โลหะสะท้อนแสงเฉพาะรูปทรงที่กำหนด',
  layer: { ...finishes.goldFoil.layer, color: '#d9dde3', roughness: 0.16 },
};

// chip order in the UI
export const FINISH_ORDER = ['none', 'spotUV', 'goldFoil', 'silverFoil', 'emboss', 'deboss'];

/**
 * Production export (PDF / SVG). One place to change when iPrint's prepress spec is known.
 *
 * spots  one entry per thing that is separated in the file. `name` is the spot colour name written to the PDF
 *        (ASCII only — it is what prepress sees in the swatches / separations), `cmyk` the on-screen alternate,
 *        `rgb` how the SVG shows it, `layer` the layer name. Keys match the finish ids in `finishes`.
 * The values below are placeholders chosen to be distinct and readable, NOT iPrint's real spec.
 */
export const EXPORT = {
  marginMm: 10, // extra paper around the artwork frame when crop marks are on
  cropMarkMm: { length: 3, gap: 1 },
  minBleedMm: 3,
  minDpi: 300,
  fallbackDpi: 600, // an SVG that cannot be kept as vectors is drawn at this resolution
  maxRasterPixels: 25e6,
  hairlineMm: 0.088, // 0.25 pt
  spots: {
    dieline: { name: 'Dieline', cmyk: [0, 1, 0, 0], rgb: '#ff00ff', layer: 'Dieline' },
    spotUV: { name: 'Spot_UV', cmyk: [1, 0, 0, 0], rgb: '#00a3e0', layer: 'Spot_UV' },
    goldFoil: { name: 'Foil_Gold', cmyk: [0, 0.25, 0.85, 0.1], rgb: '#e7b95e', layer: 'Foil_Gold' },
    silverFoil: { name: 'Foil_Silver', cmyk: [0, 0, 0, 0.35], rgb: '#b9bcc2', layer: 'Foil_Silver' },
    emboss: { name: 'Emboss', cmyk: [0, 0.7, 1, 0], rgb: '#e8790b', layer: 'Emboss' },
    deboss: { name: 'Deboss', cmyk: [0.8, 0.5, 0, 0], rgb: '#3b6fb6', layer: 'Deboss' },
    registration: { name: 'All', cmyk: [1, 1, 1, 1], rgb: '#000000', layer: 'Marks' },
  },
};

export const DEFAULTS = Object.freeze({ paper: 'smooth', coating: 'none', finish: 'none' });
