/**
 * studio.js — the "photo studio": camera, environment lighting, direct lights, soft shadows.
 *
 * Why an environment map AND direct lights?
 *  - Foil and Spot UV are mirrors: they can only show what exists in the environment. So the
 *    procedural studio below has big softboxes, a strip light, a hot spot and a dark flag —
 *    tilting the card sweeps its reflection across them (that is the "flash" of real foil).
 *  - Paper grain is only visible under a raking directional light: the key light sits low and
 *    moves with the tilt, so light "runs across" the fibres.
 *
 * Coordinates: card faces +Z, camera looks down −Z. Units are millimetres.
 * Angles: az 0 = toward the camera, + = to the right; el 0 = horizon, + = up.
 */
import * as THREE from './vendor/three/three.module.min.js';
import { presetOutline, THICKNESS_MM } from './shape.js';

export const LIGHTING = {
  exposure: 1.0,
  envIntensity: 0.85,
  fov: 28, // long-ish lens, product-photography look
  fill: { portrait: 0.84, landscape: 0.7 }, // share of the viewport the card should occupy (width / height)
  key: { color: 0xfff7ee, intensity: 2.3, az: -46, el: 34, swingAz: 30, swingEl: 20, distance: 300 },
  fillLight: { color: 0xdde8ff, intensity: 0.32, az: 55, el: 10, distance: 300 },
  rim: { color: 0xffffff, intensity: 1.6, az: 8, el: 62, distance: 300 }, // from behind-above: lights the top edge
  envSwing: 0.16, // extra environment yaw (rad) driven by tilt — exaggerates the sweep slightly
};

const dirFromAzEl = (azDeg, elDeg, target = new THREE.Vector3()) => {
  const az = THREE.MathUtils.degToRad(azDeg);
  const el = THREE.MathUtils.degToRad(elDeg);
  return target.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
};

/* ----------------------------------------------------------- environment */

function buildEnvironmentScene() {
  const env = new THREE.Scene();

  // dome: neutral studio grey, brighter overhead, warmer floor bounce
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(60, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDir;
        void main(){
          float t = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 floorC = vec3(0.26, 0.255, 0.25);
          vec3 horizon = vec3(0.46, 0.46, 0.47);
          vec3 top = vec3(0.78, 0.79, 0.81);
          vec3 c = t < 0.5 ? mix(floorC, horizon, smoothstep(0.0, 0.5, t)) : mix(horizon, top, smoothstep(0.5, 1.0, t));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -10;
  env.add(dome);

  // soft-edged emissive rectangle, sized in degrees of sky it covers
  let order = 0;
  const panel = ({ az, el, w, h, value, color = [1, 1, 1], soft = 0.3, dist = 30 }) => {
    const width = 2 * dist * Math.tan(THREE.MathUtils.degToRad(w / 2));
    const height = 2 * dist * Math.tan(THREE.MathUtils.degToRad(h / 2));
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Vector3(color[0] * value, color[1] * value, color[2] * value) }, uSoft: { value: soft } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uSoft;
          void main(){
            vec2 d = abs(vUv - 0.5) * 2.0;
            float e = max(d.x, d.y);
            gl_FragColor = vec4(uColor, 1.0 - smoothstep(1.0 - uSoft, 1.0, e));
          }`,
      }),
    );
    mesh.position.copy(dirFromAzEl(az, el).multiplyScalar(dist));
    mesh.lookAt(0, 0, 0);
    mesh.renderOrder = ++order;
    env.add(mesh);
  };

  // Layout is tuned around the reflection cone of a card tilted ±20° / ±15° (reflection moves 2× the tilt):
  // bright panels with dark gaps between them, so a mirror-like layer flashes light → dark as it tilts.
  panel({ az: -38, el: 20, w: 34, h: 26, value: 9, color: [1, 0.98, 0.94], soft: 0.35 }); // key softbox (upper left)
  panel({ az: 22, el: 24, w: 30, h: 22, value: 5, color: [1, 1, 1], soft: 0.45 }); // second softbox (upper right)
  panel({ az: 46, el: 4, w: 8, h: 46, value: 6.5, color: [0.92, 0.96, 1], soft: 0.4 }); // strip (right)
  panel({ az: -20, el: -22, w: 36, h: 14, value: 3.6, color: [1, 0.98, 0.95], soft: 0.5 }); // low bounce card (lower left)
  // broad soft wash, off-centre so its falloff crosses the flat-card reflection: gloss and foil show a gradient even at rest
  panel({ az: -16, el: 14, w: 84, h: 58, value: 1.5, color: [1, 1, 1], soft: 0.95 });
  panel({ az: 3, el: 66, w: 70, h: 40, value: 3.2, color: [1, 1, 1], soft: 0.5 }); // overhead
  panel({ az: -6, el: 32, w: 5, h: 5, value: 34, color: [1, 0.97, 0.93], soft: 0.6 }); // hot spot: crisp glints
  panel({ az: 12, el: -8, w: 15, h: 9, value: 0.02, color: [1, 1, 1], soft: 0.3 }); // dark flag: contrast for foil
  panel({ az: 180, el: 24, w: 90, h: 24, value: 5, color: [1, 1, 1], soft: 0.5 }); // back rim: lights the card edges
  panel({ az: -92, el: 0, w: 14, h: 60, value: 3.5, color: [1, 0.98, 0.95], soft: 0.4 }); // left edge strip
  panel({ az: 92, el: 0, w: 14, h: 60, value: 3.5, color: [0.95, 0.98, 1], soft: 0.4 }); // right edge strip
  return env;
}

/* --------------------------------------------------------------- shadows */

/**
 * Blurred silhouette of the card outline (die-cut edge and holes included) as an alpha texture.
 * `blur` and `pad` are fractions of the card width. `rings` are in mm, centred on the middle of `bounds` (y up).
 */
function makeShadowTexture(rings, bounds, blur, pad) {
  const cw = 360;
  const k = cw / bounds.w; // canvas px per mm
  const ch = Math.max(8, Math.round(bounds.h * k));
  const p = Math.round(cw * pad);
  const canvas = document.createElement('canvas');
  canvas.width = cw + p * 2;
  canvas.height = ch + p * 2;
  const ctx = canvas.getContext('2d');
  ctx.shadowColor = 'rgba(0,0,0,1)';
  ctx.shadowBlur = cw * blur;
  ctx.shadowOffsetX = 4000; // draw the shape far off-canvas; only its blurred shadow lands here
  ctx.fillStyle = '#000';
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach((q, i) => {
      const x = p - 4000 + (q.x + bounds.w / 2) * k;
      const y = p + (bounds.h / 2 - q.y) * k;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
  }
  ctx.fill('evenodd'); // holes stay open
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, scaleX: canvas.width / cw, scaleY: canvas.height / ch };
}

/* ---------------------------------------------------------------- studio */

export function createStudio(renderer) {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = LIGHTING.exposure;

  const scene = new THREE.Scene();
  // Backdrop for see-through stocks (PET transmission): three.js transmission can only refract what is in the scene,
  // not the CSS background, so a real backdrop is drawn — near-white above, blue below, split by a diagonal rising to the
  // right. The edge crosses behind the card, so the frosted blur and the tint of the stock are easy to read.
  // colours: sampled from the reference image the user supplied (near-white above, brand blue below)
  // z: far enough behind that no card can reach it — tilted, mid-flip (edge-on) or the largest 150 × 150 mm size,
  // whose half-diagonal is ~106 mm. At -18 a tilted corner sank into it.
  const BACKDROP = { top: '#f9f9f9', bottom: '#4a71ff', slope: 0.32, through: [0, -4], z: -140 };
  const transmissionBackdrop = new THREE.Group();
  const flat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false }); // exact brand colours, no tone curve
  const upper = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), flat(BACKDROP.top));
  upper.position.z = BACKDROP.z;
  const lower = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), flat(BACKDROP.bottom));
  const tilt = Math.atan(BACKDROP.slope);
  lower.rotation.z = tilt;
  // put the lower plane's top edge on the diagonal: its centre sits 5000 mm "down" from a point on the line
  lower.position.set(BACKDROP.through[0] + Math.sin(tilt) * 5000, BACKDROP.through[1] - Math.cos(tilt) * 5000, BACKDROP.z + 0.1);
  transmissionBackdrop.add(upper, lower);
  transmissionBackdrop.visible = false;
  scene.add(transmissionBackdrop);
  const camera = new THREE.PerspectiveCamera(LIGHTING.fov, 1, 20, 4000);

  // environment (PMREM)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = buildEnvironmentScene();
  const envRT = pmrem.fromScene(envScene, 0.015, 1, 200);
  // NOTE: not assigned to scene.environment. Since three r163 a material's own envMapIntensity is ignored when the
  // environment comes from the scene, and we want Foil / Spot UV / paper to each have their own reflection strength.
  // card.js assigns this texture to every material as `material.envMap`.
  envScene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  pmrem.dispose();

  // direct lights
  const key = new THREE.DirectionalLight(LIGHTING.key.color, LIGHTING.key.intensity);
  const fill = new THREE.DirectionalLight(LIGHTING.fillLight.color, LIGHTING.fillLight.intensity);
  const rim = new THREE.DirectionalLight(LIGHTING.rim.color, LIGHTING.rim.intensity);
  fill.position.copy(dirFromAzEl(LIGHTING.fillLight.az, LIGHTING.fillLight.el).multiplyScalar(LIGHTING.fillLight.distance));
  rim.position.copy(dirFromAzEl(LIGHTING.rim.az, LIGHTING.rim.el).multiplyScalar(LIGHTING.rim.distance).setZ(-LIGHTING.rim.distance * 0.35));
  scene.add(key, fill, rim);

  // soft shadows on the (virtual) table behind the card. They live in their own scene that is drawn
  // first: three.js always draws transparent objects after opaque ones, so a shadow plane inside the
  // main scene would land on top of the card instead of behind it.
  const shadowScene = new THREE.Scene();
  let softShadow = null;
  let contactShadow = null;
  let bounds = { w: 90, h: 54 }; // size of the cut shape in mm — what the camera frames

  const shadowMesh = (t, opacity, order) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.w * t.scaleX, bounds.h * t.scaleY),
      new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, opacity, depthWrite: false, depthTest: false, toneMapped: false }),
    );
    m.renderOrder = order;
    m.position.z = -THICKNESS_MM / 2 - 3;
    shadowScene.add(m);
    return m;
  };
  const dropShadow = (mesh) => {
    if (!mesh) return;
    shadowScene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.map?.dispose();
    mesh.material.dispose();
  };
  /** (Re)build both shadows from the card outline. */
  function setShape(rings, nextBounds) {
    dropShadow(softShadow);
    dropShadow(contactShadow);
    bounds = { ...nextBounds };
    softShadow = shadowMesh(makeShadowTexture(rings, bounds, 0.16, 0.34), 0.3, 0);
    contactShadow = shadowMesh(makeShadowTexture(rings, bounds, 0.022, 0.06), 0.42, 1);
  }
  setShape(presetOutline('rect', 90, 54), bounds);

  const keyDir = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  const studio = {
    scene,
    camera,
    envMap: envRT.texture,
    envYaw: 0, // current environment yaw (rad); card.js applies it to each material
    layout: { width: 1, height: 1, zoom: 1, panX: 0, panY: 0 },
    setShape,

    /** Frame the card so it fills ~70–85% of the viewport, then apply zoom / pan. */
    frame(width, height, zoom = 1, panX = 0, panY = 0) {
      Object.assign(studio.layout, { width, height, zoom, panX, panY });
      const aspect = width / height;
      camera.aspect = aspect;
      const tanH = Math.tan(THREE.MathUtils.degToRad(LIGHTING.fov / 2));
      const dW = bounds.w / (LIGHTING.fill.portrait * 2 * tanH * aspect);
      const dH = bounds.h / (LIGHTING.fill.landscape * 2 * tanH);
      const dist = Math.max(dW, dH) / zoom;
      const reachX = (bounds.w / 2) * (1 - 1 / zoom);
      const reachY = (bounds.h / 2) * (1 - 1 / zoom);
      lookAt.set(panX * reachX, -panY * reachY, 0); // pointer y is screen-down, world y is up
      camera.position.set(lookAt.x, lookAt.y, dist);
      camera.lookAt(lookAt);
      camera.updateProjectionMatrix();
    },

    /**
     * tx, ty ∈ [−1, 1]: smoothed tilt (tx = yaw / left-right, ty = pitch / up-down).
     * hx, hy ∈ [−1, 1]: pointer hover offset, nudges the key light on desktop.
     * yaw: the card's actual yaw in radians (tilt + flip); defaults to the tilt alone.
     */
    update(tx, ty, hx = 0, hy = 0, yaw = tx * THREE.MathUtils.degToRad(20)) {
      const k = LIGHTING.key;
      dirFromAzEl(k.az + tx * k.swingAz + hx * 12, k.el - ty * k.swingEl - hy * 8, keyDir);
      key.position.copy(keyDir).multiplyScalar(k.distance);

      // shadow falls away from the key light; the broad one drifts further than the contact one
      softShadow.position.x = -keyDir.x * 9;
      softShadow.position.y = -keyDir.y * 9 - 2;
      contactShadow.position.x = -keyDir.x * 1.6;
      contactShadow.position.y = -keyDir.y * 1.6 - 0.3;
      // a card turned edge-on (mid-flip) still casts a thin sliver, never nothing
      const squash = Math.max(0.04, Math.abs(Math.cos(yaw)));
      softShadow.scale.x = contactShadow.scale.x = squash;
      softShadow.scale.y = contactShadow.scale.y = Math.cos(ty * THREE.MathUtils.degToRad(15));

      studio.envYaw = -tx * LIGHTING.envSwing;
    },

    setSize(width, height, pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      studio.frame(width, height, studio.layout.zoom, studio.layout.panX, studio.layout.panY);
    },

    /** Shadows first, then the card + lights on top. */
    render() {
      transmissionBackdrop.visible = !!scene.getObjectByName('paper')?.material?.transmission;
      studio.backdropOn = transmissionBackdrop.visible; // app.js lightens the stage captions over the dark backdrop
      renderer.autoClear = false;
      renderer.clear();
      renderer.render(shadowScene, camera);
      renderer.clearDepth();
      renderer.render(scene, camera);
    },
  };
  return studio;
}
