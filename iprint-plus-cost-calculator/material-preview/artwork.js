/**
 * artwork.js — the printed artwork and the finish shape, kept as SEPARATE layers.
 *
 * An artwork SOURCE is two canvases (both W × H, RGBA, transparent background):
 *
 *     print   Layer 1: what is printed, in its own colours
 *     shape   Layer 3: where the finish goes (foil / spot UV / emboss) — only the alpha matters; null = none yet
 *
 * card.js only ever asks this module for:
 *
 *   ink canvas   white = bare paper, colour = ink. It is *multiplied* into the paper albedo (like real ink), so the
 *                paper grain still shows through the print.
 *   mask canvas  white = finish applied, black = none.
 *
 * The built-in demo card is one source (its logo is printed AND is the finish shape); an uploaded design is another.
 * Both are fitted to the artwork frame, which card.js sizes from the card outline (+ bleed).
 */
import * as THREE from './vendor/three/three.module.min.js';

// system-ui = Segoe UI / SF Pro / Roboto. Named faces like "Helvetica Neue" are avoided on purpose: some
// machines map them to outline / serif fonts, which breaks the artwork.
const FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
const INFO_INK = '#262a33';
const BRAND_INK = '#075ac8'; // iPrint primary blue: the logo mark and the "iPrint" wordmark
const TAGLINE_INK = '#20242d';

// The iPrint mark (Logo.svg, viewBox 57 × 65), knocked out of the rounded square on the sample card.
const MARK = {
  w: 57,
  h: 65,
  paths: [
    { d: 'M0.420413 14.5736C5.82642 16.4671 9.55485 19.6594 11.7221 24.3396C12.7007 26.467 13.1656 28.7228 13.1657 31.0629C13.1424 41.8074 13.1441 52.5323 13.1441 63.2768V64.9357C10.9773 65.191 9.08946 64.6594 7.29541 63.8087C2.49526 61.4685 0.397769 57.6388 0.374044 52.8098C0.304135 40.4274 0.326245 28.0648 0.302945 15.7037C0.302945 15.4059 0.373805 15.0843 0.420413 14.5736Z' },
    { d: 'M55.6027 13.5734C56.7446 13.5522 57 13.8939 57 14.8939C56.9534 20.1704 56.9784 25.4478 56.9784 30.7456C56.9779 39.7025 49.963 47.02 40.1989 48.1051C37.9852 48.3603 35.7017 48.1716 33.4414 48.1715H31.9019C31.7855 50.6388 31.7639 52.936 31.531 55.2332C30.9717 60.6799 25.2844 65.1697 19.0855 64.9569V30.5733C19.0862 22.723 25.5175 15.5525 33.9762 14.0418C35.5606 13.7653 37.1923 13.6188 38.8233 13.6188C44.4162 13.5762 50.0098 13.616 55.6027 13.5734ZM37.9608 25.3821C34.6055 25.3826 31.8325 27.8515 31.8092 30.8725C31.7627 33.9359 34.6287 36.5736 38.0072 36.5955C41.363 36.6168 44.0894 34.0636 44.0661 30.9359C44.0426 27.7447 41.4097 25.3608 37.9608 25.3821Z', rule: 'evenodd' },
    { d: 'M6.45458 0.000120913C9.95018 0.0213972 12.9108 2.72509 12.8875 5.91654C12.8633 9.1283 9.90427 11.8084 6.43294 11.7876C2.91403 11.7664 0 9.08395 0 5.87122C0.000806516 2.68053 2.98302 -0.0208175 6.45458 0.000120913Z' },
  ],
};

export function createArtwork(W, H, anisotropy = 4) {
  const cache = new Map();

  // The demo card is authored in millimetres on a 90 × 54 card and centred in whatever frame it is given.
  const s = Math.min(W / 90, H / 54);
  const ox = (W - 90 * s) / 2;
  const oy = (H - 54 * s) / 2;
  const mm = (v) => v * s;

  const newCanvas = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Text with manual letter-spacing (ctx.letterSpacing is not available everywhere). */
  function trackedText(ctx, text, x, y, tracking) {
    let cx = x;
    for (const ch of text) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + tracking;
    }
  }

  function drawBrand(ctx, color, taglineColor = color) {
    ctx.fillStyle = color;
    const mx = mm(8);
    const my = mm(8.5);
    const ms = mm(15);
    roundRect(ctx, mx, my, ms, ms, mm(3.6));
    ctx.fill();
    // knocked-out iPrint mark, centred, 60% of the square's height
    const k = (ms * 0.6) / MARK.h;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.translate(mx + (ms - MARK.w * k) / 2, my + (ms - MARK.h * k) / 2);
    ctx.scale(k, k);
    for (const p of MARK.paths) ctx.fill(new Path2D(p.d), p.rule ?? 'nonzero');
    ctx.restore();
    ctx.fillStyle = color;

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = `800 ${mm(13.5)}px ${FONT}`;
    ctx.fillText('iPrint', mm(28), mm(21.2));
    ctx.fillStyle = taglineColor;
    ctx.font = `700 ${mm(2.3)}px ${FONT}`;
    trackedText(ctx, 'PRINT • DESIGN • CREATE', mm(28.5), mm(26.6), mm(0.72));
  }

  function drawInfo(ctx, color) {
    ctx.fillStyle = color;
    ctx.fillRect(mm(8), mm(34.2), mm(74), mm(0.16));
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = `700 ${mm(3.7)}px ${FONT}`;
    ctx.fillText('Chalisa wiriyawannakorn', mm(8), mm(41));
    ctx.font = `500 ${mm(2.3)}px ${FONT}`;
    ctx.globalAlpha = 0.78;
    trackedText(ctx, 'CREATIVE DIRECTOR', mm(8), mm(45.4), mm(0.35));
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    ctx.font = `500 ${mm(2.4)}px ${FONT}`;
    ctx.fillText('+66 81 234 5678', mm(82), mm(41));
    ctx.fillText('hello@iprint.example', mm(82), mm(45.4));
  }

  /** The built-in demo card: everything is printed, and the logo block doubles as the finish shape. */
  function demoSource() {
    const print = newCanvas();
    const pg = print.getContext('2d');
    pg.translate(ox, oy);
    drawBrand(pg, BRAND_INK, TAGLINE_INK);
    drawInfo(pg, INFO_INK);
    const shape = newCanvas();
    const sg = shape.getContext('2d');
    sg.translate(ox, oy);
    drawBrand(sg, '#fff');
    return { name: 'Demo card', print, shape };
  }

  let source = demoSource();

  /** Same shape, flat colour. */
  function tinted(shape, color) {
    const c = newCanvas();
    const g = c.getContext('2d');
    g.drawImage(shape, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, W, H);
    return c;
  }

  const disposeTextures = () => {
    for (const v of cache.values()) if (v.isTexture) v.dispose();
    cache.clear();
  };

  const api = {
    width: W,
    height: H,

    get name() {
      return source.name;
    },

    /** Does the current artwork have a shape for this finish mask ('shape')? */
    has(role) {
      return !!source[role];
    },

    /** Fresh demo canvases — lets a single layer be uploaded while the other still shows the demo. */
    demo: demoSource,

    /** Swap the artwork ({ name, print, shape }). null = back to the demo card. */
    setSource(next) {
      disposeTextures();
      source = next ?? demoSource();
    },

    /** Ink canvas: white paper + the printed layer, multiplied. */
    inkCanvas() {
      if (cache.has('ink')) return cache.get('ink');
      const c = newCanvas();
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'multiply';
      if (source.print) ctx.drawImage(source.print, 0, 0);
      cache.set('ink', c);
      return c;
    },

    /** Mask canvas: white where the finish is applied. All black when there is no shape. */
    maskCanvas(name) {
      const key = `mask:${name}`;
      if (cache.has(key)) return cache.get(key);
      const c = newCanvas();
      const ctx = c.getContext('2d', { willReadFrequently: true }); // masks are read back on the CPU to build relief maps
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      if (source[name]) ctx.drawImage(tinted(source[name], '#fff'), 0, 0);
      cache.set(key, c);
      return c;
    },

    inkTexture() {
      if (cache.has('inkTex')) return cache.get('inkTex');
      const t = new THREE.CanvasTexture(api.inkCanvas());
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropy;
      cache.set('inkTex', t);
      return t;
    },

    maskTexture(name) {
      const key = `maskTex:${name}`;
      if (cache.has(key)) return cache.get(key);
      const t = new THREE.CanvasTexture(api.maskCanvas(name));
      t.colorSpace = THREE.NoColorSpace; // masks are data, not colour
      t.anisotropy = anisotropy;
      cache.set(key, t);
      return t;
    },

    dispose() {
      disposeTextures();
    },
  };
  return api;
}
