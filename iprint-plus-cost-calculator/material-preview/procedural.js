/**
 * procedural.js — stand-in for scanned paper samples.
 *
 * One height field (in micrometres) is synthesised per paper, then every map is derived from it,
 * so grain, normal, roughness and colour variation agree with each other:
 *
 *   value-noise octaves  → paper "formation" and grain
 *   fibre strokes        → cellulose / cotton fibres (canvas 2D, fast)
 *   pits, weave          → optional micro detail
 *   height → normal map  (physical slope: µm of relief over mm of distance)
 *   height → roughness   (crests burnished a little smoother, pits rougher)
 *   height + noise → albedo variation (mottle, fibre tint, kraft flecks)
 *
 * All arrays use DataTexture row order (row 0 = bottom of the card, v = 0).
 * Swapping in real scans: see the `files` branch in loadFileMaps().
 */
import * as THREE from './vendor/three/three.module.min.js';

export const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/* ------------------------------------------------------------------ noise */

/** Adds smooth value noise (feature size `cellPx`) into `dst`, amplitude ±amp. */
function addValueNoise(dst, W, H, cellPx, amp, rand) {
  const gx = Math.ceil(W / cellPx) + 3;
  const gy = Math.ceil(H / cellPx) + 3;
  const lattice = new Float32Array(gx * gy);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand() * 2 - 1;

  const xi = new Int32Array(W);
  const xt = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const f = x / cellPx;
    const i = f | 0;
    const t = f - i;
    xi[x] = i;
    xt[x] = t * t * (3 - 2 * t);
  }

  for (let y = 0; y < H; y++) {
    const f = y / cellPx;
    const j = f | 0;
    const t = f - j;
    const ty = t * t * (3 - 2 * t);
    const r0 = j * gx;
    const r1 = r0 + gx;
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = xi[x];
      const s = xt[x];
      const a = lattice[r0 + i] + (lattice[r0 + i + 1] - lattice[r0 + i]) * s;
      const b = lattice[r1 + i] + (lattice[r1 + i + 1] - lattice[r1 + i]) * s;
      dst[row + x] += (a + (b - a) * ty) * amp;
    }
  }
}

/* ------------------------------------------------------- fibres, pits, flecks */

function paintFibrous(spec, W, H, ppm, rand) {
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round';

  const area100 = ((W / ppm) * (H / ppm)) / 100;

  const f = spec.fibers;
  if (f) {
    const total = Math.round(f.countPer100mm2 * area100);
    const tiers = 3;
    for (const dark of [false, true]) {
      const share = dark ? f.darkRatio : 1 - f.darkRatio;
      for (let tier = 0; tier < tiers; tier++) {
        const n = Math.round((total * share) / tiers);
        const width = Math.max(0.7, lerp(f.widthMm[0], f.widthMm[1], (tier + 0.5) / tiers) * ppm);
        ctx.lineWidth = width;
        ctx.strokeStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        for (let k = 0; k < n; k++) {
          const len = lerp(f.lengthMm[0], f.lengthMm[1], Math.pow(rand(), 1.8)) * ppm;
          const ang = rand() * Math.PI * 2;
          const x0 = rand() * W;
          const y0 = rand() * H;
          const dx = Math.cos(ang) * len;
          const dy = Math.sin(ang) * len;
          const bend = (rand() - 0.5) * len * f.curvature;
          ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(x0 + dx * 0.5 - dy * (bend / len), y0 + dy * 0.5 + dx * (bend / len), x0 + dx, y0 + dy);
        }
        ctx.stroke();
      }
    }
  }

  const p = spec.pits;
  if (p) {
    const n = Math.round(p.countPer100mm2 * area100);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const r = Math.max(0.6, p.sizeMm * ppm * (0.35 + rand() * 0.65) * 0.5);
      const x = rand() * W;
      const y = rand() * H;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  const data = ctx.getImageData(0, 0, W, H).data;
  const out = new Float32Array(W * H);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (data[j] - 128) / 127;
  return out;
}

/** Dark flecks / shives (kraft). Returns darkness 0..1. */
function paintFlecks(flecks, W, H, ppm, rand) {
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  const n = Math.round(flecks.countPer100mm2 * (((W / ppm) * (H / ppm)) / 100));
  for (let k = 0; k < n; k++) {
    const size = lerp(flecks.sizeMm[0], flecks.sizeMm[1], Math.pow(rand(), 2)) * ppm;
    ctx.beginPath();
    ctx.ellipse(rand() * W, rand() * H, size * 0.5, size * (0.12 + rand() * 0.25), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const data = ctx.getImageData(0, 0, W, H).data;
  const out = new Float32Array(W * H);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = 1 - data[j] / 255;
  return out;
}

/** Plain-weave thread emboss with per-thread irregularity (kept subtle: paper, not fabric). */
function addWeave(dst, W, H, ppm, weave, rand) {
  const pitch = weave.pitchMm * ppm;
  const nx = Math.ceil(W / pitch) + 2;
  const ny = Math.ceil(H / pitch) + 2;
  const irr = weave.irregularity ?? 0.5;
  const offX = new Float32Array(nx);
  const strX = new Float32Array(nx);
  const offY = new Float32Array(ny);
  const strY = new Float32Array(ny);
  for (let i = 0; i < nx; i++) {
    offX[i] = (rand() - 0.5) * irr * 0.5;
    strX[i] = 1 + (rand() - 0.5) * irr;
  }
  for (let j = 0; j < ny; j++) {
    offY[j] = (rand() - 0.5) * irr * 0.5;
    strY[j] = 1 + (rand() - 0.5) * irr;
  }
  for (let y = 0; y < H; y++) {
    const fy = y / pitch;
    const j = fy | 0;
    const uy = clamp(fy - j - offY[j], 0, 1);
    const hy = Math.sin(Math.PI * uy) * strY[j];
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const fx = x / pitch;
      const i = fx | 0;
      const ux = clamp(fx - i - offX[i], 0, 1);
      const hx = Math.sin(Math.PI * ux) * strX[i];
      dst[row + x] += weave.weight * (((i + j) & 1) === 0 ? hy : hx);
    }
  }
}

/* ------------------------------------------------------------- derived maps */

/** Central-difference normal map from a height field in µm. Row 0 = v 0. */
function heightToNormalBytes(hUm, W, H, ppm, gain = 1) {
  const k = (ppm / 2000) * gain; // slope = Δh[µm] / 1000 / (2 px / ppm)
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const ym = y > 0 ? y - 1 : 0;
    const yp = y < H - 1 ? y + 1 : H - 1;
    for (let x = 0; x < W; x++) {
      const xm = x > 0 ? x - 1 : 0;
      const xp = x < W - 1 ? x + 1 : W - 1;
      const dx = (hUm[y * W + xp] - hUm[y * W + xm]) * k;
      const dy = (hUm[yp * W + x] - hUm[ym * W + x]) * k;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const o = (y * W + x) * 4;
      out[o] = (-dx * inv * 0.5 + 0.5) * 255;
      out[o + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      out[o + 2] = (inv * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

function dataTexture(data, W, H, format, colorSpace, anisotropy) {
  const t = new THREE.DataTexture(data, W, H, format, THREE.UnsignedByteType);
  t.colorSpace = colorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------------- public */

/**
 * Generate the full map set for one paper.
 * @returns {{map, normalMap, roughnessMap, bumpMap, heightUm, width, height, ppm}}
 */
export async function generatePaperMaps(cfg, { width: W, height: H, widthMm }, { anisotropy = 4 } = {}) {
  const spec = cfg.procedural;
  const want = cfg.maps;
  const ppm = W / widthMm;
  const rand = mulberry32(spec.seed ?? 1);
  const N = W * H;
  const h = new Float32Array(N);

  // 1 · formation + grain
  for (const o of spec.octaves) addValueNoise(h, W, H, Math.max(1, o.sizeMm * ppm), o.weight, rand);
  await nextTick();

  // 2 · fibres and pits
  let fib = null;
  if (spec.fibers || spec.pits) {
    fib = paintFibrous(spec, W, H, ppm, rand);
    const fw = spec.fibers?.weight ?? 0;
    const pw = spec.pits?.weight ?? 0;
    const w = Math.max(fw, pw);
    for (let i = 0; i < N; i++) h[i] += fib[i] * w;
    await nextTick();
  }

  // 3 · weave
  if (spec.weave) {
    addWeave(h, W, H, ppm, spec.weave, rand);
    await nextTick();
  }

  // 4 · normalise to physical relief (µm, zero mean)
  let mean = 0;
  for (let i = 0; i < N; i++) mean += h[i];
  mean /= N;
  let varSum = 0;
  for (let i = 0; i < N; i++) {
    const d = h[i] - mean;
    varSum += d * d;
  }
  const kRel = spec.reliefUm / (Math.sqrt(varSum / N) || 1);
  for (let i = 0; i < N; i++) h[i] = (h[i] - mean) * kRel;
  const heightUm = h;

  const pack = { width: W, height: H, ppm, heightUm, map: null, normalMap: null, roughnessMap: null, bumpMap: null };

  // 5 · normal map
  if (want.normal === 'procedural') {
    pack.normalMap = dataTexture(heightToNormalBytes(heightUm, W, H, ppm), W, H, THREE.RGBAFormat, THREE.NoColorSpace, anisotropy);
  }
  await nextTick();

  // 6 · roughness (G channel is what three.js reads; stored in an RG texture)
  if (want.roughness === 'procedural') {
    const data = new Uint8Array(N * 2);
    const span = 2 * spec.reliefUm;
    const rv = spec.roughnessVariation;
    for (let i = 0; i < N; i++) {
      const crest = clamp(0.5 + heightUm[i] / span, 0, 1);
      const v = clamp(1 - rv * crest + (rand() - 0.5) * 0.04, 0, 1) * 255;
      data[i * 2] = v;
      data[i * 2 + 1] = v;
    }
    pack.roughnessMap = dataTexture(data, W, H, THREE.RGFormat, THREE.NoColorSpace, anisotropy);
  }

  // 7 · bump (only used when no normal map)
  if (want.bump === 'procedural') {
    const data = new Uint8Array(N);
    const span = 4 * spec.reliefUm;
    for (let i = 0; i < N; i++) data[i] = clamp(0.5 + heightUm[i] / span, 0, 1) * 255;
    pack.bumpMap = dataTexture(data, W, H, THREE.RedFormat, THREE.NoColorSpace, anisotropy);
  }
  await nextTick();

  // 8 · albedo variation around ~0.95 (material.color supplies the actual paper colour)
  if (want.color === 'procedural') {
    const a = spec.albedo;
    const mott = new Float32Array(N);
    addValueNoise(mott, W, H, Math.max(1, a.mottleMm * ppm), 0.65, rand);
    addValueNoise(mott, W, H, Math.max(1, (a.mottleMm * ppm) / 3.3), 0.35, rand);
    const fleck = a.flecks ? paintFlecks(a.flecks, W, H, ppm, rand) : null;
    const fleckK = a.flecks?.darkness ?? 0;
    const data = new Uint8Array(N * 4);
    const base = 0.955;
    for (let i = 0; i < N; i++) {
      let v = base + a.mottle * mott[i] + a.grain * (rand() * 2 - 1);
      if (fib) v += a.fiber * fib[i];
      let r = v;
      let g = v;
      let b = v;
      if (fleck) {
        const f = fleck[i] * fleckK;
        r *= 1 - f * 0.55;
        g *= 1 - f * 0.68;
        b *= 1 - f * 0.82;
      }
      const o = i * 4;
      data[o] = clamp(r, 0, 1) * 255;
      data[o + 1] = clamp(g, 0, 1) * 255;
      data[o + 2] = clamp(b, 0, 1) * 255;
      data[o + 3] = 255;
    }
    pack.map = dataTexture(data, W, H, THREE.RGBAFormat, THREE.SRGBColorSpace, anisotropy);
  }

  return pack;
}

/**
 * Load real texture files instead of generating (configure in materials.js → maps).
 * Any map left as 'procedural' is not handled here — mix by generating first, then overriding.
 */
export async function loadFileMaps(cfg, { anisotropy = 4, frame = { w: 90, h: 54 } } = {}) {
  const loader = new THREE.TextureLoader();
  const [tw, th] = cfg.maps.tileMm ?? [90, 54];
  const load = (url, colorSpace) =>
    new Promise((resolve, reject) => {
      loader.load(
        url,
        (t) => {
          t.colorSpace = colorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(frame.w / tw, frame.h / th); // one tile covers tileMm on the card, whatever size the frame is
          t.anisotropy = anisotropy;
          resolve(t);
        },
        undefined,
        reject,
      );
    });
  const isUrl = (v) => typeof v === 'string' && v !== 'procedural';
  const pack = { map: null, normalMap: null, roughnessMap: null, bumpMap: null, heightUm: null };
  const jobs = [];
  if (isUrl(cfg.maps.color)) jobs.push(load(cfg.maps.color, THREE.SRGBColorSpace).then((t) => (pack.map = t)));
  if (isUrl(cfg.maps.normal)) jobs.push(load(cfg.maps.normal, THREE.NoColorSpace).then((t) => (pack.normalMap = t)));
  if (isUrl(cfg.maps.roughness)) jobs.push(load(cfg.maps.roughness, THREE.NoColorSpace).then((t) => (pack.roughnessMap = t)));
  if (isUrl(cfg.maps.bump)) jobs.push(load(cfg.maps.bump, THREE.NoColorSpace).then((t) => (pack.bumpMap = t)));
  await Promise.all(jobs);
  return pack;
}

/* --------------------------------------------- finish relief (foil / spot UV) */

/** Reads a white-on-black mask canvas into a Float32 array in DataTexture row order. */
export function maskToArray(canvas, W, H) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, W, H).data;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W; // canvas row 0 is the top → flip into v-up order
    for (let x = 0; x < W; x++) out[y * W + x] = data[(src + x) * 4 + 1] / 255;
  }
  return out;
}

/** Separable box blur, repeated for a soft, roughly gaussian falloff. */
export function boxBlur(src, W, H, radius, passes = 2) {
  const r = Math.max(1, Math.round(radius));
  let a = Float32Array.from(src);
  let b = new Float32Array(a.length);
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[row + clamp(x, 0, W - 1)];
      for (let x = 0; x < W; x++) {
        b[row + x] = acc * inv;
        acc += a[row + Math.min(x + r + 1, W - 1)] - a[row + Math.max(x - r, 0)];
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[clamp(y, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        a[y * W + x] = acc * inv;
        acc += b[Math.min(y + r + 1, H - 1) * W + x] - b[Math.max(y - r, 0) * W + x];
      }
    }
  }
  return a;
}

/**
 * Normal-map texture from a sum of height layers (µm):  Σ layer.data[i] * layer.scale.
 * Used for foil (paper texture + deboss) and spot UV (raised varnish edge).
 */
export function reliefNormalTexture(layers, W, H, ppm, anisotropy = 4) {
  const sum = new Float32Array(W * H);
  for (const { data, scale } of layers) {
    if (!data || !scale) continue;
    for (let i = 0; i < sum.length; i++) sum[i] += data[i] * scale;
  }
  return dataTexture(heightToNormalBytes(sum, W, H, ppm), W, H, THREE.RGBAFormat, THREE.NoColorSpace, anisotropy);
}
