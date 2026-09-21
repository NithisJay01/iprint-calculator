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
const BRAND_INK = '#20242d';

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

  function drawBrand(ctx, color) {
    ctx.fillStyle = color;
    const mx = mm(8);
    const my = mm(8.5);
    const ms = mm(15);
    roundRect(ctx, mx, my, ms, ms, mm(3.6));
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out'; // knocked-out "i"
    ctx.beginPath();
    ctx.arc(mx + ms / 2, my + ms * 0.3, mm(1.3), 0, Math.PI * 2);
    ctx.fill();
    roundRect(ctx, mx + ms / 2 - mm(1.2), my + ms * 0.46, mm(2.4), ms * 0.36, mm(0.75));
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = `800 ${mm(13.5)}px ${FONT}`;
    ctx.fillText('iPrint', mm(28), mm(21.2));
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
    drawBrand(pg, BRAND_INK);
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
