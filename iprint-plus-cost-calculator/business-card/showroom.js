import * as THREE from '../material-preview/vendor/three/three.module.min.js';
import { createStudio, LIGHTING } from '../material-preview/studio.js';
import { createCard } from '../material-preview/card.js';
import { buildSpec } from '../material-preview/shape.js';
import { DEFAULT_SHAPE, paperMaterials, finishes } from '../material-preview/materials.js';
import { TiltInput } from '../material-preview/input.js';
import { SHOWROOM_PRESETS, createShowroomCycle } from './showroom-cycle.js';

export async function createShowroom(stage, visible) {
  const renderer = new THREE.WebGLRenderer({ canvas: stage.querySelector('canvas'), alpha: true, antialias: true });
  renderer.setClearColor(0, 0);
  const spec = buildSpec(DEFAULT_SHAPE);
  const studio = createStudio(renderer);
  const card = createCard({ renderer, spec });
  card.setEnvironment(studio.envMap, LIGHTING.envIntensity);
  studio.scene.add(card.pivot);
  studio.setShape(spec.rings, spec.bounds);
  const input = new TiltInput(stage);
  let expanded = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  new ResizeObserver(() => {
    const rect = stage.getBoundingClientRect();
    studio.setSize(Math.max(1, rect.width), Math.max(1, rect.height), Math.min(devicePixelRatio || 1, 1.5));
  }).observe(stage);
  async function applyPreset({ paper, coating, finish }) {
    await card.setPaper(paper);
    await card.setCoating(coating);
    await card.setFinish(finish);
    stage.querySelector('canvas').setAttribute('aria-label', `นามบัตร 3 มิติ · ${paperMaterials[paper].label} · ${finishes[finish].label}`);
    stage.dataset.paper = paper;
    stage.dataset.finish = finish;
  }
  await applyPreset(SHOWROOM_PRESETS[0]);
  await card.warmUp(studio.scene, studio.camera);
  const cycle = createShowroomCycle(applyPreset);
  document.addEventListener('visibilitychange', () => cycle.pause());
  let x = 0, y = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const active = !document.hidden && visible() && !renderer.getContext().isContextLost();
    cycle.tick(now, active);
    if (!active || cycle.changing) return;
    const target = expanded && input.interacted ? input.target : reduced.matches ? { x: 0.15, y: 0.1 } : { x: Math.sin(now / 1900) * 0.6, y: Math.sin(now / 2600) * 0.4 };
    x += (target.x - x) * 0.08; y += (target.y - y) * 0.08;
    card.pivot.rotation.set(y * 0.26, x * 0.35, 0);
    studio.update(x, y, 0, 0);
    card.setEnvYaw(studio.envYaw);
    studio.frame(studio.layout.width, studio.layout.height, 1, 0, 0);
    studio.render();
  }
  requestAnimationFrame(frame);
  return { input, setExpanded(value) {
    expanded = value;
    if (!value) { input.disableSensors(); input.recenter(); input.interacted = false; }
  } };
}
