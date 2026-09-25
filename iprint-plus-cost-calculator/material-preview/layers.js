/**
 * layers.js — the state of the card, and the only place that talks to the card about it.
 *
 *   shape   card outline + size (preset or die-cut file)              → card.setSpec()
 *   art     Layer 1  printed artwork  (SVG / PNG / JPG / WebP)          → card.setLayers().print
 *   mask    Layer 3  finish shape     (SVG / PNG)                       → card.setLayers().shape
 *
 * Layer 2 (lamination) and the finish type are plain card settings; the panel calls card.setCoating / setFinish.
 *
 * Every layer keeps what it needs to redraw itself at ANY texture size (parsed SVG, decoded bitmap), because
 * changing the card size or bleed changes the artwork frame and every layer has to be fitted to it again.
 * Changes are applied one at a time: a second change made while the first is running is folded into one more pass,
 * so textures of different sizes can never end up mixed on the card.
 */
import { DEFAULT_SHAPE, MIN_BLEED_MM } from './materials.js';
import { buildSpec, registrationNotes, artworkFit, trimFraction } from './shape.js';
import { placeOnTrim } from './bleed.js';
import { parseSvg, renderSvgLayer } from './svgArtwork.js';
import { inspectRaster, decodeRaster, drawRasterLayer, drawRasterMask, isSvgFile, isRasterFile } from './rasterArtwork.js';
import { loadShapeFile } from './shapeFile.js';

export function createLayers({ card, studio, onChange = () => {}, setBusy = () => {} }) {
  const state = {
    shape: { ...DEFAULT_SHAPE }, // buildSpec params: kind, width, height, radius, bleed
    cut: null, // die-cut file loaded by loadCut(): { name, kind, rings, frame, warnings, invert }
    art: null, // Layer 1
    backArt: null,
    mask: null, // Layer 3
  };

  /* -------------------------------------------------------------- applying */

  const currentSpec = () => buildSpec({ ...state.shape, custom: state.shape.kind === 'custom' ? state.cut : null });

  /** Called by card.setSpec once the new texture size is known: draws every layer at that size. */
  async function makeSource(size) {
    const { width: W, height: H } = size;
    const demo = state.art && state.mask ? null : card.artwork.demo(); // the layer that is not uploaded yet shows the demo
    // A file that is exactly the trim size is drawn over the trim; printed artwork also gets its edges stretched into
    // the bleed (bleed.js). Any other file fills the frame as before.
    const spec = currentSpec();
    const t = trimFraction(spec);
    const trimPx = { x: t.x * W, y: t.y * H, w: t.w * W, h: t.h * H };
    const draw = async (layer, extend) => {
      if (artworkFit(layer.aspect, spec) !== 'trim') return layer.render(W, H);
      return placeOnTrim(await layer.render(Math.round(trimPx.w), Math.round(trimPx.h)), W, H, trimPx, { extend });
    };
    const print = state.art ? await draw(state.art, true) : demo.print;
    const shape = state.mask ? await draw(state.mask, false) : state.art ? null : demo.shape;
    const backPrint = state.backArt ? await draw(state.backArt, true) : null;
    return { name: state.art?.name ?? 'Demo card', print, shape, backPrint };
  }

  async function applyOnce() {
    const spec = currentSpec();
    await card.setSpec(spec, makeSource);
    studio.setShape(card.view.rings, card.view.bounds); // the shadow follows the model, which may be at 1:N
    onChange();
  }

  let inflight = null;
  let again = false;
  function refresh() {
    again = true;
    if (!inflight) {
      inflight = (async () => {
        const timer = setTimeout(() => setBusy(true), 160); // a spinner only when it is not instant
        try {
          while (again) {
            again = false;
            await applyOnce();
          }
        } finally {
          clearTimeout(timer);
          setBusy(false);
          inflight = null;
        }
      })();
    }
    return inflight;
  }

  /** Put `next` in place, or put `prev` back (and rethrow) when it cannot be drawn. */
  async function commit(slot, next) {
    const prev = state[slot];
    state[slot] = next;
    try {
      await refresh();
      prev?.dispose?.();
    } catch (err) {
      state[slot] = prev;
      next?.dispose?.();
      await refresh().catch(() => {});
      throw err;
    }
  }

  /* ----------------------------------------------------------------- files */

  async function makeSvgLayer(file) {
    const parsed = parseSvg(await file.text(), file.name);
    return { name: file.name, kind: 'svg', file, parsed, aspect: parsed.aspect, warnings: parsed.warnings, render: (W, H) => renderSvgLayer(parsed, W, H), dispose() {} };
  }

  async function makeRasterLayer(file, asMask) {
    const info = await inspectRaster(file);
    const decoded = await decodeRaster(file, info);
    const layer = {
      name: file.name,
      kind: 'raster',
      file,
      info,
      aspect: decoded.width / decoded.height,
      pixelWidth: info.width,
      warnings: [],
      invert: false,
      usedBrightness: false,
      render: async (W, H) => {
        if (!asMask) return drawRasterLayer(decoded, W, H);
        const r = drawRasterMask(decoded, W, H, { invert: layer.invert });
        layer.usedBrightness = r.usedBrightness;
        return r.canvas;
      },
      dispose: () => decoded.close(),
    };
    return layer;
  }

  async function makeLayer(file, asMask) {
    if (isSvgFile(file)) return makeSvgLayer(file);
    if (isRasterFile(file)) {
      if (asMask && !/png/i.test(file.type) && !/\.png$/i.test(file.name || '')) throw new Error('Layer 3 รับไฟล์ SVG หรือ PNG เท่านั้น');
      return makeRasterLayer(file, asMask);
    }
    throw new Error(asMask ? 'Layer 3 รับไฟล์ SVG หรือ PNG เท่านั้น' : 'รองรับเฉพาะไฟล์ SVG, PNG, JPG, WebP');
  }

  // Reading a file takes a while and takes a different while for every file, so requests can finish out of order.
  // The newest request for a slot always wins; an older one that finishes late is dropped.
  const calls = { art: 0, backArt: 0, mask: 0, cut: 0 };

  async function loadSlot(slot, file, asMask) {
    const call = ++calls[slot];
    const next = file ? await makeLayer(file, asMask) : null;
    if (call !== calls[slot]) {
      next?.dispose?.();
      return;
    }
    await commit(slot, next);
  }

  const api = {
    state,

    /** Layer 1 */
    setArt: (file) => loadSlot('art', file, false),
    setBackArt: (file) => loadSlot('backArt', file, false),
    /** Read an artwork file without using it (for the check pop-up). The caller disposes it. */
    inspectFile: (file) => makeLayer(file, false),

    /** Layer 3 */
    setMask: (file) => loadSlot('mask', file, true),
    async setMaskInvert(invert) {
      if (!state.mask || state.mask.kind !== 'raster') return;
      state.mask.invert = Boolean(invert);
      await refresh();
    },

    /** Card shape and size. `patch` = any of { kind, width, height, radius, bleed }. */
    async setShape(patch) {
      const prev = state.shape;
      state.shape = { ...state.shape, ...patch };
      state.shape.bleed = Math.max(MIN_BLEED_MM, Number(state.shape.bleed) || 0); // bleed is required (min 3 mm)
      try {
        await refresh();
      } catch (err) {
        state.shape = prev;
        await refresh().catch(() => {});
        throw err;
      }
    },

    /** Load a die-cut file (SVG / PNG) and switch to it. */
    async loadCut(file, { invert = false } = {}) {
      const call = ++calls.cut;
      const cut = { ...(await loadShapeFile(file, { invert })), invert, file }; // keep the file: "invert" re-reads it
      if (call !== calls.cut) return; // a newer die-cut file was chosen while this one was being read
      const prevCut = state.cut;
      const prevShape = state.shape;
      state.cut = cut;
      state.shape = { ...state.shape, kind: 'custom' };
      try {
        await refresh();
      } catch (err) {
        state.cut = prevCut;
        state.shape = prevShape;
        await refresh().catch(() => {});
        throw err;
      }
    },
    async setCutInvert(invert) {
      if (!state.cut || state.cut.kind !== 'png') return;
      const file = state.cut.file;
      if (!file) return;
      await api.loadCut(file, { invert });
    },

    /** What the exporter needs: the original files and the parsed SVGs, not the preview canvases. */
    exportSources() {
      const pick = (l) =>
        l && { name: l.name, kind: l.kind, aspect: l.aspect, pixelWidth: l.pixelWidth, warnings: l.warnings, file: l.file, parsed: l.parsed, info: l.info, invert: l.invert };
      return { spec: card.spec, params: state.shape, cut: state.cut ? { kind: state.cut.kind, name: state.cut.name, file: state.cut.file } : null, art: pick(state.art), backArt: pick(state.backArt), mask: pick(state.mask) };
    },

    /** Everything the panel shows about the current state. */
    describe() {
      const spec = card.spec;
      const reg = registrationNotes({ spec, art: state.art, mask: state.mask });
      const own = (layer) => (layer?.warnings ?? []).map((text) => ({ text, warn: true }));
      const shapeNotes = [...(state.shape.kind === 'custom' ? (state.cut?.warnings ?? []).map((text) => ({ text, warn: true })) : [])];
      if (state.shape.kind === 'custom' && Math.abs(spec.bounds.w - state.shape.width) > 0.5) {
        shapeNotes.push({ text: `ขนาดถูกปรับเป็น ${+(spec.bounds.w / 10).toFixed(2)} × ${+(spec.bounds.h / 10).toFixed(2)} cm ให้อยู่ในช่วงที่รองรับ (2–100 cm)`, warn: true });
      }
      const previewScale = card.view.scale ?? 1;
      if (previewScale > 1) {
        shapeNotes.push({ text: `พรีวิวแสดงแบบย่อส่วน 1:${previewScale} (สัดส่วนเท่างานจริง) — ไฟล์ผลิตและใบสั่งพิมพ์ใช้ขนาดจริง ${+(spec.bounds.w / 10).toFixed(2)} × ${+(spec.bounds.h / 10).toFixed(2)} cm` });
      }
      const artNotes = [...own(state.art), ...reg.filter((n) => n.text.startsWith('Layer 1'))];
      const maskNotes = [...own(state.mask), ...reg.filter((n) => !n.text.startsWith('Layer 1'))];
      if (state.mask?.kind === 'raster' && state.mask.usedBrightness) {
        maskNotes.push({ text: 'ภาพไม่มีพื้นโปร่งใส — ใช้ส่วนที่เข้มเป็นรูปทรง (ติ๊ก "กลับด้าน" เพื่อสลับ)', warn: false });
      }
      return {
        spec,
        previewScale, // 1:N of the 3D model (1 = real size)
        shape: state.shape,
        cutName: state.cut?.name ?? '',
        cutKind: state.cut?.kind ?? '',
        artName: state.art?.name ?? '',
        backArtName: state.backArt?.name ?? '',
        maskName: state.mask?.name ?? '',
        maskIsRaster: state.mask?.kind === 'raster',
        maskInvert: Boolean(state.mask?.invert),
        maskUsedBrightness: Boolean(state.mask?.usedBrightness),
        shapeNotes,
        artNotes,
        maskNotes,
      };
    },
  };
  return api;
}
