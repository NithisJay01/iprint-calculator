/**
 * app.js — wires renderer, studio, card, layers, input and the panel together. No look-and-feel decisions here:
 * those live in materials.js (what) / studio.js (light) / card.js (how layers combine).
 */
import * as THREE from './vendor/three/three.module.min.js';
import { paperMaterials, DEFAULTS, DEFAULT_SHAPE } from './materials.js';
import { buildSpec } from './shape.js';
import { createStudio, LIGHTING } from './studio.js';
import { createCard } from './card.js';
import { TiltInput } from './input.js';
import { createLayers } from './layers.js';
import { initPanel } from './panel.js';
import { initMaterialCatalog } from './catalog-panel.js';

const $ = (sel) => document.querySelector(sel);
const stage = $('#stage');
const canvas = $('#gl');

const ROT_X = THREE.MathUtils.degToRad(15); // pitch limit
const ROT_Y = THREE.MathUtils.degToRad(20); // yaw limit
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(pointer: coarse)').matches;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

// The entry buttons on the other pages pass ?from=…, so "back" returns to the page the visitor came from.
// A Map (not an object): any other value, even "constructor", just falls back to the catalog.
const BACK = new Map([
  ['catalog', ['../catalog/', 'Catalog']],
  ['business-card', ['../business-card/#top', 'นามบัตร']],
  ['home', ['../', 'หน้าแรก']],
]);
{
  const [href, label] = BACK.get(params.get('from')) ?? BACK.get('catalog');
  const back = $('.back');
  if (back) {
    back.href = href;
    back.textContent = `‹ ${label}`;
    back.setAttribute('aria-label', `กลับไป${label}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ renderer */

function fatal(message) {
  const box = $('#fatal');
  box.hidden = false;
  box.textContent = message;
  $('#loader').classList.add('is-hidden');
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  console.error(err);
  fatal('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับ WebGL — กรุณาลองเปิดด้วย Chrome หรือ Safari รุ่นล่าสุด');
  throw err;
}
renderer.setClearColor(0x000000, 0); // transparent: the CSS backdrop shows through
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  fatal('การแสดงผล 3D หยุดชั่วคราว — กำลังโหลดใหม่…');
  setTimeout(() => location.reload(), 800);
});

const spec = buildSpec(DEFAULT_SHAPE);
const studio = createStudio(renderer);
studio.setShape(spec.rings, spec.bounds);
const card = createCard({ renderer, spec });
card.setEnvironment(studio.envMap, LIGHTING.envIntensity);
studio.scene.add(card.pivot);

let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
let needsRender = true;
const requestRender = () => (needsRender = true);

function resize() {
  const r = stage.getBoundingClientRect();
  studio.setSize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)), pixelRatio);
  requestRender();
}
new ResizeObserver(resize).observe(stage);

/* --------------------------------------------------------------- input */

const input = new TiltInput(stage, {
  onChange: () => {
    requestRender();
    syncZoomUI();
  },
  // a sideways flick turns the card over, in the direction of the swipe
  onFlip: (dir) => {
    if (!panel) return;
    flip.dir = dir;
    panel.state.side = panel.state.side === 'back' ? 'front' : 'back';
    panel.render();
    requestRender();
  },
});
const cur = { x: 0, y: 0, zoom: 1, panX: 0, panY: 0 };

// Turning the card over. `target` is a whole number of half turns (odd = back up); it keeps growing in the direction
// of each flip, so the card always spins the way it was swiped (buttons spin it the way of the last swipe).
// A critically damped spring eases in and out, and a flip started mid-flip continues smoothly from where it is.
const flip = { angle: 0, vel: 0, target: 0, dir: 1 };
const FLIP_OMEGA = 11; // spring speed (rad/s): ~0.55 s for a half turn
function stepFlip(dt) {
  const wantBack = panel?.state.side === 'back';
  const isBack = Math.abs(Math.round(flip.target / Math.PI)) % 2 === 1;
  if (wantBack !== isBack) flip.target += flip.dir * Math.PI;
  if (REDUCED_MOTION) {
    flip.angle = flip.target;
    flip.vel = 0;
    return false;
  }
  const d = flip.target - flip.angle;
  if (Math.abs(d) < 1e-4 && Math.abs(flip.vel) < 1e-3) {
    flip.angle = flip.target;
    flip.vel = 0;
    return false;
  }
  flip.vel += (FLIP_OMEGA * FLIP_OMEGA * d - 2 * FLIP_OMEGA * flip.vel) * dt;
  flip.angle += flip.vel * dt;
  return true;
}

/* ------------------------------------------------------------------ UI */

const loader = $('#loader');
let booted = false; // before boot the loader is a full-stage overlay, afterwards a small corner pill
function setBusy(on, text = 'กำลังสร้างพื้นผิวกระดาษ…') {
  $('#loaderText').textContent = text;
  loader.classList.toggle('is-corner', booted);
  loader.classList.toggle('is-hidden', !on);
}

const status = $('#status');
const say = (text, warn = false) => {
  status.textContent = text;
  status.classList.toggle('is-warn', warn);
};

// the other papers are built one by one in the background, so switching is instant (restarted after a resize)
let restToken = 0;
async function prepareRest() {
  const token = ++restToken;
  for (const id of Object.keys(paperMaterials)) {
    if (id === card.paper) continue;
    await sleep(350);
    if (token !== restToken) return;
    try {
      await card.preparePaper(id);
    } catch (err) {
      console.warn(`Paper "${id}" failed to prepare`, err);
    }
  }
}

let panel = null;
const layers = createLayers({
  card,
  studio,
  setBusy,
  onChange: () => {
    panel?.render();
    requestRender();
    prepareRest();
  },
});
panel = initPanel({ card, layers, stage, setBusy, say, requestRender });
import('./request-print.js').then(({ initPrintRequest }) => initPrintRequest({ card, layers, panel }));

// hint text depends on the input the device actually has
$('#hint').textContent = COARSE
  ? 'เอียงโทรศัพท์เพื่อดูแสงและพื้นผิวของวัสดุ (หรือลากนิ้วบนนามบัตร) · ปัดเร็วๆ ไปด้านข้างเพื่อพลิกดูอีกด้าน'
  : 'ลากเมาส์เพื่อเปลี่ยนมุม · สะบัดเมาส์ไปด้านข้างเพื่อพลิก · เลื่อนล้อเมาส์เพื่อซูม';

// zoom toggle (wheel / pinch also change the zoom, so the button mirrors the state; double-click does not zoom)
const zoomBtn = $('#zoomBtn');
function syncZoomUI() {
  const zoomed = input.zoomTarget > 1.05;
  zoomBtn.setAttribute('aria-pressed', String(zoomed));
  $('#zoomLabel').textContent = zoomed ? 'ซูมออก' : 'ซูมดูผิว';
}
zoomBtn.addEventListener('click', () => input.setZoom(input.zoomTarget < 1.05 ? 2.4 : 1));

// Full screen: the preview fills the screen and the settings (top bar + panel) are hidden. The browser's own full
// screen is used where it exists; iPhone Safari has none for pages, so there the preview just fills the page.
const appEl = $('.app');
const fullBtn = $('#fullBtn');
let fullViaBrowser = false;
function setFull(on) {
  appEl.classList.toggle('is-full', on);
  fullBtn.setAttribute('aria-pressed', String(on));
  const label = on ? 'ออกจากเต็มจอ' : 'เต็มจอ';
  fullBtn.setAttribute('aria-label', label);
  fullBtn.title = label;
  const root = document.documentElement;
  const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
  const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
  const current = document.fullscreenElement ?? document.webkitFullscreenElement;
  if (on && request && !current) {
    fullViaBrowser = true;
    Promise.resolve(request.call(root)).catch(() => (fullViaBrowser = false)); // refused: the page-filling layout still applies
  } else if (!on && current && exit) {
    fullViaBrowser = false;
    Promise.resolve(exit.call(document)).catch(() => {});
  }
  requestRender();
}
fullBtn.addEventListener('click', () => setFull(!appEl.classList.contains('is-full')));
// leaving the browser's full screen (Esc, system gesture) also brings the settings back
for (const type of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(type, () => {
    if (fullViaBrowser && !(document.fullscreenElement ?? document.webkitFullscreenElement)) {
      fullViaBrowser = false;
      setFull(false);
    }
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && appEl.classList.contains('is-full') && !document.querySelector('dialog[open]')) setFull(false);
});

// flip button beside the zoom: same turn as a flick, in the direction of the last one
$('#flipBtn').addEventListener('click', () => {
  if (!panel) return;
  panel.state.side = panel.state.side === 'back' ? 'front' : 'back';
  panel.render();
  requestRender();
});

// tilt button: shown where a motion sensor is plausible (touch devices; ?tilt=1 forces it for devtools sensor emulation)
const tiltBtn = $('#tiltBtn');
const wantsTilt = COARSE || typeof window.DeviceOrientationEvent?.requestPermission === 'function' || params.has('tilt');
tiltBtn.hidden = !wantsTilt || typeof window.DeviceOrientationEvent === 'undefined';

const REASONS = {
  insecure: 'Tilt ต้องเปิดผ่าน HTTPS — ตอนนี้ใช้การลากนิ้วบนนามบัตรแทน',
  unsupported: 'เครื่องนี้ไม่รองรับเซนเซอร์เอียง — ใช้การลากนิ้วบนนามบัตรแทน',
  denied: 'ไม่ได้รับอนุญาตใช้เซนเซอร์ — ใช้การลากนิ้วแทน (iOS: ปิดแท็บแล้วเปิดใหม่เพื่อขออนุญาตอีกครั้ง)',
  error: 'เปิดเซนเซอร์ไม่สำเร็จ — ใช้การลากนิ้วบนนามบัตรแทน',
  'no-data': 'ไม่พบข้อมูลเซนเซอร์ (อาจถูกบล็อก) — ใช้การลากนิ้วบนนามบัตรแทน',
};

// The switch sits on the preview, so its messages show right under it (briefly) as well as in the panel status.
const tiltNote = $('#tiltNote');
let tiltNoteTimer = 0;
function tiltSay(text, warn = false) {
  say(text, warn);
  tiltNote.textContent = text;
  tiltNote.classList.toggle('is-warn', warn);
  tiltNote.hidden = !text;
  clearTimeout(tiltNoteTimer);
  if (text) tiltNoteTimer = setTimeout(() => (tiltNote.hidden = true), warn ? 6000 : 3500);
}
const setTiltSwitch = (on) => tiltBtn.setAttribute('aria-checked', String(on));

tiltBtn.addEventListener('click', async () => {
  if (input.sensor.active) {
    input.disableSensors();
    setTiltSwitch(false);
    tiltSay('ปิด Tilt แล้ว — ลากนิ้วบนนามบัตรเพื่อเปลี่ยนมุม');
    return;
  }
  // NOTE: the permission request is started synchronously inside this click (iOS requirement).
  const pending = input.enableSensors();
  tiltBtn.disabled = true;
  setTiltSwitch(true); // flips at once; flips back if the sensor cannot be used
  tiltSay('กำลังขออนุญาตใช้เซนเซอร์…');
  const result = await pending;
  tiltBtn.disabled = false;
  if (result.ok) {
    tiltSay('เอียงโทรศัพท์เพื่อเปลี่ยนแสง — ตั้งท่าถือปัจจุบันเป็นจุดกึ่งกลางแล้ว');
  } else {
    setTiltSwitch(false);
    tiltSay(REASONS[result.reason] ?? REASONS.error, true);
  }
});

/* ---------------------------------------------------------- render loop */

let last = performance.now();
let perfFrames = 0;
let perfTime = 0;
let lastRendered = false;
let fps = 0;
const dbg = $('#debug');
dbg.hidden = !DEBUG;
if (DEBUG) window.__mp = { THREE, renderer, studio, card, layers, input, cur, panel, ROT_X, ROT_Y };

function sweep(t) {
  // gentle self-demo until the first touch, so the light visibly runs over the surface
  return { x: 0.62 * Math.sin(t * 0.75), y: 0.42 * Math.sin(t * 0.52 + 1.2) };
}

const k = (dt, rate) => 1 - Math.exp(-dt * rate); // frame-rate independent smoothing

function frame(now) {
  requestAnimationFrame(frame);
  const dtRaw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, dtRaw);

  const sweeping = !input.interacted && !REDUCED_MOTION && cur.zoom < 1.05;
  const target = sweeping ? sweep(now / 1000) : input.target;

  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const dz = input.zoomTarget - cur.zoom;
  const dpx = input.pointer.x - cur.panX;
  const dpy = input.pointer.y - cur.panY;
  cur.x += dx * k(dt, 10);
  cur.y += dy * k(dt, 10);
  cur.zoom += dz * k(dt, 8);
  const zoomed = cur.zoom > 1.01;
  if (zoomed) {
    cur.panX += dpx * k(dt, 5);
    cur.panY += dpy * k(dt, 5);
  }
  const flipping = stepFlip(dt);
  const moving = flipping || Math.abs(dx) + Math.abs(dy) > 2e-4 || Math.abs(dz) > 2e-4 || (zoomed && Math.abs(dpx) + Math.abs(dpy) > 2e-4);

  if (!(moving || sweeping || needsRender)) {
    lastRendered = false;
    return;
  }
  needsRender = false;

  const yaw = cur.x * ROT_Y + flip.angle;
  card.pivot.rotation.set(cur.y * ROT_X, yaw, 0);
  studio.update(cur.x, cur.y, input.hover.x / 0.55, input.hover.y / 0.55, yaw);
  card.setEnvYaw(studio.envYaw);
  const l = studio.layout;
  studio.frame(l.width, l.height, cur.zoom, cur.panX, cur.panY);
  studio.render();

  // adaptive resolution: if we cannot hold ~40 fps while animating, lower the pixel ratio a little
  if (lastRendered && dtRaw < 0.2) {
    // (a gap > 200 ms means the tab was hidden or the page stalled — not a slow GPU, so it is not counted)
    perfFrames++;
    perfTime += dtRaw;
    if (perfFrames >= 45) {
      fps = perfFrames / perfTime;
      if (fps < 38 && pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio * 0.8);
        resize();
      }
      perfFrames = 0;
      perfTime = 0;
    }
  } else {
    perfFrames = 0;
    perfTime = 0;
  }
  lastRendered = true;

  if (DEBUG) {
    const size = card.size;
    dbg.textContent = `fps ${fps ? fps.toFixed(0) : '…'}  pr ${pixelRatio.toFixed(2)}\ntex ${size.width}×${size.height}  calls ${renderer.info.render.calls}\ntilt ${cur.x.toFixed(2)}, ${cur.y.toFixed(2)}  zoom ${cur.zoom.toFixed(2)}`;
  }
}

/* ---------------------------------------------------------------- boot */

async function boot() {
  resize();
  try {
    await card.setPaper(DEFAULTS.paper);
    await card.setCoating(DEFAULTS.coating);
    await card.setFinish(DEFAULTS.finish);
    await card.warmUp(studio.scene, studio.camera); // compile Foil / Spot UV shaders now, not on first tap
  } catch (err) {
    console.error(err);
    fatal('เกิดข้อผิดพลาดในการสร้างพื้นผิววัสดุ — ลองรีเฟรชหน้าเว็บ');
    return;
  }
  booted = true;
  setBusy(false);
  panel.render();
  requestRender();
  requestAnimationFrame(frame);
  prepareRest();
  initMaterialCatalog({ panel, say, requestedId: params.get('material') });
}

boot();
