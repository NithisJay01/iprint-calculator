/**
 * card.js — assembles the 3D card from independent layers:
 *
 *   1. Paper body     the card outline (any die-cut shape, holes included) extruded to 0.55 mm with a tiny bevel,
 *                     MeshPhysicalMaterial with albedo / normal / roughness maps. The cut edge is shaded separately.
 *   2. Printed ink    Layer 1 — a multiply texture sampled inside the paper shader (independent front/back faces), so the ink
 *                     inherits the paper's grain, roughness and lighting.
 *   3. Lamination     Layer 2 — a clear coat over the whole face (clearcoat + roughness + softened grain).
 *   4. Finish         Layer 3 — driven by one shape mask:
 *                       foil    → opaque metal plane, alpha-cut by the mask
 *                       gloss   → clear varnish: specular-only, additively blended, raised edge
 *                       emboss  → the paper's own normal map is rebuilt with the shape raised / pressed in
 *                     Planes use the card outline as their geometry, so they can never float outside a die-cut edge.
 *
 * Everything that depends on the card's size (artwork canvases, paper textures, relief maps) is rebuilt by setSpec()
 * when the artwork frame changes; the paper being shown is regenerated first, the others on demand.
 */
import * as THREE from './vendor/three/three.module.min.js';
import { paperMaterials, coatings, finishes, TEXTURE_BUDGET, FILM } from './materials.js';
import { generatePaperMaps, loadFileMaps, maskToArray, boxBlur, reliefNormalTexture, filmNormalTexture, nextTick } from './procedural.js';
import { createArtwork } from './artwork.js';
import { textureSizeFor } from './shape.js';
import { applyOpticalParams } from './material-catalog.js';

const isCoarse = () => matchMedia('(pointer: coarse)').matches;
const EMBOSS_CACHE_MAX = 4; // each entry is one full-size normal map

/** 1×1 stand-ins so the shader is compiled once with every map slot present. */
function placeholder(kind) {
  const bytes = { color: [255, 255, 255, 255], normal: [128, 128, 255, 255], rough: [255, 255, 255, 255] }[kind];
  const t = new THREE.DataTexture(new Uint8Array(bytes), 1, 1, THREE.RGBAFormat);
  t.colorSpace = kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

const disposePack = (pack) => {
  if (!pack) return;
  for (const k of ['map', 'normalMap', 'roughnessMap', 'bumpMap']) pack[k]?.dispose?.();
};

export function createCard({ renderer, spec: initialSpec }) {
  const budget = isCoarse() ? TEXTURE_BUDGET.mobile : TEXTURE_BUDGET.desktop;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  let spec = initialSpec;
  let size = textureSizeFor(spec.frame.w, spec.frame.h, budget); // { width, height, ppm } of every frame-sized texture
  let artwork = createArtwork(size.width, size.height, anisotropy);
  let sizeGen = 0; // bumps whenever the frame-sized resources are thrown away, so stale async work can tell

  const ph = { color: placeholder('color'), normal: placeholder('normal'), rough: placeholder('rough') };
  const pivot = new THREE.Group(); // rotated by the input system
  pivot.name = 'card';

  /* ------------------------------------------------------ outline geometry */

  const toShape = () => {
    const [outer, ...holes] = spec.rings;
    const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, p.y)));
    for (const hole of holes) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
    return shape;
  };

  /** Planar UVs: the artwork frame is one 0–1 texture. Edge walls get degenerate UVs, which the shader ignores. */
  const planarUv = (geometry) => {
    const { cx, cy, w, h } = spec.frame;
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - cx) / w + 0.5, (pos.getY(i) - cy) / h + 0.5);
    return geometry;
  };

  const buildBody = () => {
    const t = spec.thickness;
    const b = Math.min(spec.bevel, t / 2 - 0.01);
    const g = new THREE.ExtrudeGeometry(toShape(), {
      depth: t - 2 * b,
      bevelEnabled: b > 0,
      bevelThickness: b,
      bevelSize: b,
      bevelOffset: -b, // keep the wall on the outline; the bevel eats into the cap instead of growing the card
      bevelSegments: 3,
      curveSegments: 1, // rings are already polygons
    });
    g.translate(0, 0, -(t - 2 * b) / 2);
    return planarUv(g);
  };

  const buildPlane = () => planarUv(new THREE.ShapeGeometry(toShape(), 1));

  /* ---------------------------------------------------------- paper body */

  // The lamination film's orange peel, on the clearcoat only: it shows in the reflection, never in the print.
  // Present from the start (scale 0 = flat) so switching lamination never recompiles the shader.
  const film = filmNormalTexture(FILM, anisotropy);
  const fitFilm = () => film.repeat.set(spec.frame.w / FILM.tileMm, spec.frame.h / FILM.tileMm); // tile = FILM.tileMm on the card
  fitFilm();
  const paperMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    map: ph.color,
    normalMap: ph.normal,
    roughnessMap: ph.rough,
    sheen: 0.001, // sheen and clearcoat must be >0 from the start: toggling them later would trigger a shader recompile
    sheenColor: new THREE.Color(0xffffff),
    clearcoat: 0.001,
    clearcoatRoughness: 0.5,
    clearcoatNormalMap: film,
    clearcoatNormalScale: new THREE.Vector2(0, 0),
  });
  const inkUniform = { value: artwork.inkTexture() };
  let backArtwork = createArtwork(size.width, size.height, anisotropy);
  backArtwork.setSource({ print: null, shape: null });
  const backInkUniform = { value: backArtwork.inkTexture() };
  const backNormalUniform = { value: ph.normal };
  const backNormalScale = { value: new THREE.Vector2(1, 1) };
  const frontEmboss = { value: 0 };
  function setBackSource(source) {
    backArtwork.setSource({ print: source?.backPrint || null, shape: null });
    backInkUniform.value = backArtwork.inkTexture();
  }
  const edgeUniform = { value: new THREE.Color(1, 1, 1) };
  paperMat.onBeforeCompile = (shader) => {
    shader.uniforms.uInkMap = inkUniform;
    shader.uniforms.uBackInkMap = backInkUniform;
    shader.uniforms.uBackNormalMap = backNormalUniform;
    shader.uniforms.uBackNormalScale = backNormalScale;
    shader.uniforms.uFrontEmboss = frontEmboss;
    shader.uniforms.uEdgeColor = edgeUniform;
    // vCardUv is the card's own 0–1 UV. Ink must NOT use vMapUv: that one carries the paper texture's tiling (repeat).
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFace;\nvarying vec2 vCardUv;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCardUv = uv;
        float capness = smoothstep(0.85, 0.98, abs(normal.z));
        vFace = vec2(step(0.0, normal.z) * capness, 1.0 - capness); // x: printed front face, y: cut edge`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFace;\nvarying vec2 vCardUv;\nuniform sampler2D uInkMap;\nuniform sampler2D uBackInkMap;\nuniform vec3 uEdgeColor;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb *= mix(vec3(1.0), texture2D(uInkMap, vCardUv).rgb, vFace.x); // ink multiplies paper
        diffuseColor.rgb *= mix(vec3(1.0), texture2D(uBackInkMap, vec2(1.0 - vCardUv.x, vCardUv.y)).rgb, 1.0 - vFace.x - vFace.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, uEdgeColor, vFace.y);                // fibrous cut edge colour`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.98, vFace.y);')
      .replace('uniform sampler2D uBackInkMap;', 'uniform sampler2D uBackInkMap;\nuniform sampler2D uBackNormalMap;\nuniform vec2 uBackNormalScale;\nuniform float uFrontEmboss;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef USE_NORMALMAP_TANGENTSPACE
        if (uFrontEmboss > 0.5 && 1.0 - vFace.x - vFace.y > 0.5) {
          vec3 backN = texture2D(uBackNormalMap, vCardUv).xyz * 2.0 - 1.0;
          backN.xy *= uBackNormalScale;
          normal = normalize(tbn * backN);
        }
        #endif
        if (vFace.y > 0.02) normal = nonPerturbedNormal;`);
  };
  const body = new THREE.Mesh(buildBody(), paperMat);
  body.name = 'paper';
  pivot.add(body);

  /* -------------------------------------------------------- finish layers */

  const foilMesh = new THREE.Mesh(buildPlane(), new THREE.MeshBasicMaterial());
  const glossMesh = new THREE.Mesh(foilMesh.geometry, new THREE.MeshBasicMaterial());
  foilMesh.name = 'finish-foil';
  glossMesh.name = 'finish-gloss';
  foilMesh.visible = glossMesh.visible = false;
  glossMesh.renderOrder = 2;
  pivot.add(foilMesh, glossMesh);

  const layerMeshes = { foil: foilMesh, gloss: glossMesh };
  const layerMaterials = { foil: null, gloss: null };

  /** The outline changed: bodies and finish planes follow it. */
  function swapGeometry() {
    const oldBody = body.geometry;
    const oldPlane = foilMesh.geometry;
    body.geometry = buildBody();
    foilMesh.geometry = glossMesh.geometry = buildPlane();
    oldBody.dispose();
    oldPlane.dispose();
  }

  // Reflection source. Each material owns its envMap so its own envMapIntensity is honoured (see studio.js).
  let envMap = null;
  let envGain = 1;
  const envMaterials = () => [paperMat, layerMaterials.foil, layerMaterials.gloss].filter(Boolean);
  function setEnvironment(texture, gain = 1) {
    envMap = texture;
    envGain = gain;
    for (const m of envMaterials()) m.envMap = texture;
  }
  function setEnvYaw(yaw) {
    for (const m of envMaterials()) m.envMapRotation.y = yaw;
  }

  function createFinishMaterial(layer, normalMap) {
    const mask = artwork.maskTexture(layer.mask);
    if (layer.type === 'foil') {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(layer.color),
        metalness: layer.metalness,
        roughness: layer.roughness,
        envMap,
        envMapIntensity: layer.envMapIntensity * envGain,
        alphaMap: mask,
        // Soft alpha blending (the mask is already antialiased). alphaTest + alphaToCoverage looked stair-stepped at
        // normal screen resolution and broke up thin type, so it is a plain blend that only skips empty pixels.
        transparent: true,
        depthWrite: false,
        alphaTest: 0.004,
        normalMap,
        normalScale: new THREE.Vector2(layer.normalScale, layer.normalScale),
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
    }
    // gloss: black diffuse => only the specular of a clear, smooth coat is added onto the print
    return new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      metalness: 0,
      roughness: layer.roughness,
      ior: layer.ior,
      specularIntensity: layer.specularIntensity,
      envMap,
      envMapIntensity: layer.envMapIntensity * envGain,
      alphaMap: mask,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      normalMap,
      normalScale: new THREE.Vector2(layer.normalScale, layer.normalScale),
    });
  }

  /* ------------------------------------------------------- relief caches */

  const softMasks = new Map(); // mask id → slightly blurred mask (the finish's edge profile), independent of paper
  const glossNormal = new Map(); // mask → relief texture (independent of paper)
  const foilNormal = new Map(); // `${paper}:${mask}` → relief texture (depends on the paper's height)
  const embossNormal = new Map(); // `${paper}:${coating}:${mask}:${µm}` → whole-paper normal map (insertion order = age)

  const softMask = (name) => {
    if (!softMasks.has(name)) softMasks.set(name, boxBlur(maskToArray(artwork.maskCanvas(name), size.width, size.height), size.width, size.height, 0.09 * size.ppm, 2));
    return softMasks.get(name);
  };

  function clearReliefCaches() {
    softMasks.clear();
    for (const cache of [glossNormal, foilNormal, embossNormal]) {
      for (const t of cache.values()) t.dispose();
      cache.clear();
    }
  }

  const paperPacks = new Map(); // id → generated maps (for the current frame size)
  const pending = new Map(); // id → Promise (avoid generating twice)
  let currentPaper = null;
  let currentPack = null;
  let currentCoating = 'none';
  let currentFinish = finishes.none;
  let mapSignature = '';
  let applyToken = 0; // the newest applyFinishLayer() wins

  function reliefFor(layer, paperId) {
    const key = layer.type === 'foil' ? `${paperId}:${layer.mask}` : layer.mask;
    const cache = layer.type === 'foil' ? foilNormal : glossNormal;
    if (cache.has(key)) return cache.get(key);
    const maskBlur = softMask(layer.mask);
    const layers =
      layer.type === 'foil'
        ? [
            { data: paperPacks.get(paperId)?.heightUm, scale: layer.followPaper },
            { data: maskBlur, scale: -layer.debossUm },
          ]
        : [{ data: maskBlur, scale: layer.raisedUm }];
    const tex = reliefNormalTexture(layers, size.width, size.height, size.ppm, anisotropy);
    cache.set(key, tex);
    return tex;
  }

  /* ------------------------------------------------------------ paper API */

  /** Generate (or load) all maps for a paper at the current frame size. Safe to call repeatedly / in the background. */
  function preparePaper(id) {
    if (paperPacks.has(id)) return Promise.resolve(paperPacks.get(id));
    if (pending.has(id)) return pending.get(id);
    const gen = sizeGen;
    const cfg = paperMaterials[id];
    const texSize = size;
    const frame = spec.frame;
    const job = (async () => {
      const wantsProcedural = Object.values(cfg.maps).includes('procedural');
      const generated = wantsProcedural ? await generatePaperMaps(cfg, { width: texSize.width, height: texSize.height, widthMm: frame.w }, { anisotropy }) : {};
      const files = await loadFileMaps(cfg, { anisotropy, frame });
      const pack = {
        ...generated,
        map: files.map ?? generated.map ?? null,
        normalMap: files.normalMap ?? generated.normalMap ?? null,
        roughnessMap: files.roughnessMap ?? generated.roughnessMap ?? null,
        bumpMap: files.bumpMap ?? generated.bumpMap ?? null,
        heightUm: generated.heightUm ?? null,
      };
      if (gen !== sizeGen) {
        disposePack(pack); // the card was resized while this was being built
        return null;
      }
      paperPacks.set(id, pack);
      pending.delete(id);
      return pack;
    })().catch((err) => {
      if (pending.get(id) === job) pending.delete(id); // a failed build must not be cached forever
      throw err;
    });
    pending.set(id, job);
    return job;
  }

  const paperNormalScale = () => {
    const cfg = paperMaterials[currentPaper];
    const [x, y] = Array.isArray(cfg.normalScale) ? cfg.normalScale : [cfg.normalScale, cfg.normalScale];
    const k = coatings[currentCoating].normalMul;
    return [x * k, y * k];
  };

  function syncMapSignature() {
    const m = paperMat;
    const signature = [!!m.map, !!m.roughnessMap, !!m.normalMap, !!m.bumpMap].join();
    if (signature !== mapSignature) {
      mapSignature = signature;
      m.needsUpdate = true;
    }
  }

  /** Paper preset + lamination → material parameters. */
  function applyPaperParams() {
    if (!currentPaper) return;
    const cfg = paperMaterials[currentPaper];
    const co = coatings[currentCoating];
    const m = paperMat;
    applyOpticalParams(m, cfg);
    m.color.set(cfg.color);
    m.roughness = co.roughness ?? cfg.roughness;
    m.specularIntensity = cfg.specularIntensity;
    m.envMapIntensity = cfg.envMapIntensity * envGain;
    m.sheen = Math.max(0.001, cfg.sheen);
    m.sheenRoughness = cfg.sheenRoughness;
    m.sheenColor.set(cfg.sheenColor);
    m.clearcoat = Math.max(0.001, co.clearcoat);
    m.clearcoatRoughness = co.clearcoatRoughness;
    m.clearcoatNormalScale.set(co.filmRelief ?? 0, co.filmRelief ?? 0);
    m.bumpScale = cfg.bumpScale;
    edgeUniform.value.set(cfg.edgeColor);
  }

  /** The paper's own relief (no emboss), scaled by how much of the grain the lamination lets through. */
  function restorePaperRelief() {
    const m = paperMat;
    frontEmboss.value = 0;
    if (currentPack) {
      m.normalMap = currentPack.normalMap ?? (currentPack.bumpMap ? null : ph.normal);
      m.bumpMap = m.normalMap ? null : currentPack.bumpMap;
    }
    if (currentPaper) m.normalScale.set(...paperNormalScale());
    backNormalUniform.value = currentPack?.normalMap ?? ph.normal;
    backNormalScale.value.copy(m.normalScale);
    syncMapSignature();
  }

  let paperCall = 0; // the newest setPaper() wins: an older one that finishes late must not undo a newer choice
  let wantedPaper = null; // what was asked for last (currentPaper is what is on screen)

  async function setPaper(id) {
    if (!Object.hasOwn(paperMaterials, id)) id = 'smooth';
    const call = ++paperCall;
    wantedPaper = id;
    let pack = null;
    for (;;) {
      const gen = sizeGen;
      pack = await preparePaper(id);
      if (call !== paperCall) return; // superseded while the maps were being built
      if (pack && gen === sizeGen) break; // resized meanwhile → build it again for the new size
    }
    currentPaper = id;
    currentPack = pack;
    const m = paperMat;
    m.map = pack.map ?? ph.color;
    m.roughnessMap = pack.roughnessMap ?? ph.rough;
    applyPaperParams();
    restorePaperRelief();
    await applyFinishLayer(); // foil relief and emboss depend on the paper
  }

  async function setCoating(id) {
    currentCoating = id;
    applyPaperParams();
    await applyFinishLayer(); // emboss bakes the lamination's grain scale into its map
  }

  /* ----------------------------------------------------------- finish API */

  function embossTexture(layer, key) {
    if (embossNormal.has(key)) return embossNormal.get(key);
    const [grain] = paperNormalScale(); // baked in: the emboss map is used at normalScale 1
    const tex = reliefNormalTexture(
      [
        { data: currentPack?.heightUm, scale: grain },
        { data: softMask(layer.mask), scale: layer.heightUm },
      ],
      size.width,
      size.height,
      size.ppm,
      anisotropy,
    );
    embossNormal.set(key, tex);
    while (embossNormal.size > EMBOSS_CACHE_MAX) {
      const [oldKey, oldTex] = embossNormal.entries().next().value;
      oldTex.dispose();
      embossNormal.delete(oldKey);
    }
    return tex;
  }

  async function applyFinishLayer() {
    const token = ++applyToken;
    const layer = currentFinish.layer;
    foilMesh.visible = glossMesh.visible = false;
    restorePaperRelief();
    if (!layer || !artwork.has(layer.mask)) return; // no shape for this finish yet

    if (layer.type === 'emboss') {
      const key = `${currentPaper}:${currentCoating}:${layer.mask}:${layer.heightUm}`;
      if (!embossNormal.has(key)) await nextTick(); // let the UI paint before the heavy part
      if (token !== applyToken) return;
      paperMat.normalMap = embossTexture(layer, key);
      frontEmboss.value = 1;
      paperMat.bumpMap = null;
      paperMat.normalScale.set(1, 1);
      syncMapSignature();
      return;
    }

    if (layer.type === 'foil' && !foilNormal.has(`${currentPaper}:${layer.mask}`)) await nextTick();
    if (token !== applyToken) return;
    const mesh = layerMeshes[layer.type];
    const normal = reliefFor(layer, currentPaper);
    if (!layerMaterials[layer.type]) {
      layerMaterials[layer.type] = createFinishMaterial(layer, normal);
      mesh.material = layerMaterials[layer.type];
    } else {
      const lm = layerMaterials[layer.type];
      lm.normalMap = normal;
      lm.alphaMap = artwork.maskTexture(layer.mask); // may be a new texture after an artwork swap
      lm.roughness = layer.roughness;
      lm.envMapIntensity = layer.envMapIntensity * envGain;
      if (layer.type === 'foil') {
        lm.color.set(layer.color);
        lm.metalness = layer.metalness;
      }
    }
    mesh.position.z = spec.thickness / 2 + layer.z;
    mesh.visible = true;
  }

  async function setFinish(id) {
    currentFinish = finishes[id];
    await applyFinishLayer();
  }

  /** Replace the artwork: { name, print, shape, backPrint } canvases at the current texture size, or null for the demo card. */
  async function setLayers(source) {
    artwork.setSource(source);
    setBackSource(source);
    clearReliefCaches();
    inkUniform.value = artwork.inkTexture();
    await applyFinishLayer();
  }

  /**
   * Change the card outline / size. `makeSource(size)` (optional, async) returns the artwork for the new texture size
   * — the layers are re-fitted to the new frame in one go, so nothing flashes at the wrong scale.
   */
  async function setSpec(next, makeSource) {
    const nextSize = textureSizeFor(next.frame.w, next.frame.h, budget);
    const frameChanged =
      nextSize.width !== size.width ||
      nextSize.height !== size.height ||
      Math.abs(next.frame.w - spec.frame.w) > 1e-6 ||
      Math.abs(next.frame.h - spec.frame.h) > 1e-6;
    spec = next;
    fitFilm();
    swapGeometry();

    if (frameChanged) {
      sizeGen++;
      for (const pack of paperPacks.values()) disposePack(pack);
      paperPacks.clear();
      pending.clear();
      clearReliefCaches();
      artwork.dispose();
      size = nextSize;
      artwork = createArtwork(size.width, size.height, anisotropy);
      backArtwork.dispose();
      backArtwork = createArtwork(size.width, size.height, anisotropy);
    }
    if (frameChanged || makeSource) {
      const source = makeSource ? await makeSource(size) : null;
      artwork.setSource(source);
      setBackSource(source);
      clearReliefCaches();
      inkUniform.value = artwork.inkTexture();
    }
    const paper = wantedPaper ?? currentPaper; // rebuild for the paper most recently asked for, not the one on screen
    if (paper) await setPaper(paper);
    else await applyFinishLayer();
  }

  /** Make every material's shader compile up-front (avoids a hitch on first Foil / Spot UV tap). */
  async function warmUp(scene, camera) {
    const before = [foilMesh.visible, glossMesh.visible];
    for (const [type, mesh] of Object.entries(layerMeshes)) {
      const layer = Object.values(finishes).find((f) => f.layer?.type === type).layer;
      if (!layerMaterials[type]) layerMaterials[type] = createFinishMaterial(layer, ph.normal);
      mesh.material = layerMaterials[type];
      mesh.visible = true;
    }
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      renderer.compile(scene, camera);
    }
    [foilMesh.visible, glossMesh.visible] = before;
  }

  return {
    pivot,
    get size() {
      return size;
    },
    get spec() {
      return spec;
    },
    get artwork() {
      return artwork;
    },
    get paper() {
      return currentPaper;
    },
    get coating() {
      return currentCoating;
    },
    preparePaper,
    setPaper,
    setCoating,
    setFinish,
    setLayers,
    setSpec,
    warmUp,
    setEnvironment,
    setEnvYaw,
    /** Does the artwork have a shape this finish can use? (None is always available.) */
    finishHasShape(id) {
      const layer = finishes[id].layer;
      return !layer || artwork.has(layer.mask);
    },
  };
}
