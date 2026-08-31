'use strict';

const materialPreviewState = {
  enabled: true,
  mode: 'none',
  effect: 'none',
  pointerId: null,
  tiltX: 0,
  tiltY: 0,
  canvas: null,
  gl: null,
  program: null,
  buffer: null,
  uniforms: null,
  bound: false
};

function materialPreviewText(calc) {
  return [calc?.material, ...(Array.isArray(calc?.services) ? calc.services : [])]
    .map(item => [item?.name, item?.previewEffect, item?.shaderPreset].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase();
}

function materialPreviewConfig(calc) {
  const items = [calc?.material, ...(Array.isArray(calc?.services) ? calc.services : [])].filter(Boolean);
  const explicitWebgl = items.some(item => String(item.previewRenderer || '').toLowerCase() === 'webgl');
  const text = materialPreviewText(calc);
  const special = explicitWebgl || /hologram|holo|โฮโลแกรม|foil|ฟอยล์|iridescent|texture|เท็กซ์เจอร์|ลายสะท้อน/.test(text);
  if (special) {
    const effect = /foil|ฟอยล์|gold|ทอง/.test(text) ? 'foil' : /texture|เท็กซ์เจอร์/.test(text) ? 'texture' : 'hologram';
    return { mode: 'webgl', effect };
  }
  if (/เคลือบเงา|gloss/.test(text)) return { mode: 'css', effect: 'gloss' };
  if (/เคลือบด้าน|matt|matte/.test(text)) return { mode: 'css', effect: 'matte' };
  return { mode: 'none', effect: 'none' };
}

function materialShaderSource(type) {
  if (type === 'vertex') {
    return `attribute vec2 aPosition;
      varying vec2 vUv;
      void main(){
        vUv=(aPosition+1.0)*0.5;
        gl_Position=vec4(aPosition,0.0,1.0);
      }`;
  }
  return `precision mediump float;
    varying vec2 vUv;
    uniform vec2 uTilt;
    uniform float uEffect;
    void main(){
      vec2 uv=vUv;
      float center=0.5+uTilt.x*0.022;
      float band=max(0.0,1.0-abs((uv.x+uv.y*0.32)-center)*3.2);
      band=band*band*band;
      float edge=max(0.0,1.0-abs(uv.x-0.5)*1.7);
      vec3 color;
      float alpha;
      if(uEffect<1.5){
        color=0.58+0.42*cos(6.28318*(vec3(0.0,0.33,0.67)+uv.x*0.72+uv.y*0.38+uTilt.x*0.018));
        alpha=0.10+band*0.32;
      }else if(uEffect<2.5){
        color=mix(vec3(0.45,0.20,0.035),vec3(1.0,0.86,0.34),band);
        alpha=0.11+band*0.34;
      }else{
        float grain=0.5+0.5*sin((uv.x*118.0+uv.y*37.0)+uTilt.x*0.25);
        color=mix(vec3(0.72),vec3(1.0),grain);
        alpha=0.08+band*0.25;
      }
      gl_FragColor=vec4(color,alpha*edge);
    }`;
}

function compileMaterialShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compile failed';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function initializeMaterialWebGL() {
  if (materialPreviewState.gl) return true;
  const canvas = $('materialShaderCanvas');
  if (!canvas) return false;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power'
  });
  if (!gl) return false;
  try {
    const vertex = compileMaterialShader(gl, gl.VERTEX_SHADER, materialShaderSource('vertex'));
    const fragment = compileMaterialShader(gl, gl.FRAGMENT_SHADER, materialShaderSource('fragment'));
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed');
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    materialPreviewState.canvas = canvas;
    materialPreviewState.gl = gl;
    materialPreviewState.program = program;
    materialPreviewState.buffer = buffer;
    materialPreviewState.uniforms = {
      tilt: gl.getUniformLocation(program, 'uTilt'),
      effect: gl.getUniformLocation(program, 'uEffect')
    };
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      $('materialPreviewStage')?.classList.add('is-webgl-fallback');
    }, { once: true });
    return true;
  } catch (error) {
    console.warn('Material WebGL preview unavailable', error);
    return false;
  }
}

function destroyMaterialWebGL() {
  const { gl, program, buffer, canvas } = materialPreviewState;
  if (gl) {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  if (canvas?.parentNode) {
    const replacement = canvas.cloneNode(false);
    replacement.hidden = true;
    canvas.parentNode.replaceChild(replacement, canvas);
  }
  materialPreviewState.canvas = null;
  materialPreviewState.gl = null;
  materialPreviewState.program = null;
  materialPreviewState.buffer = null;
  materialPreviewState.uniforms = null;
}

function resizeMaterialCanvas() {
  const canvas = $('materialShaderCanvas');
  const stage = $('materialPreviewStage');
  if (!canvas || !stage || canvas.hidden) return;
  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(Number(window.devicePixelRatio) || 1, 1.5);
  const scale = Math.min(1, 1024 / Math.max(rect.width * ratio, rect.height * ratio));
  const width = Math.max(1, Math.round(rect.width * ratio * scale));
  const height = Math.max(1, Math.round(rect.height * ratio * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function drawMaterialShader() {
  if (materialPreviewState.mode !== 'webgl' || !initializeMaterialWebGL()) return false;
  resizeMaterialCanvas();
  const { gl, program, buffer, uniforms, canvas } = materialPreviewState;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(uniforms.tilt, materialPreviewState.tiltY, materialPreviewState.tiltX);
  gl.uniform1f(uniforms.effect, materialPreviewState.effect === 'foil' ? 2 : materialPreviewState.effect === 'texture' ? 3 : 1);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.flush();
  return true;
}

function applyMaterialTilt(x, y) {
  materialPreviewState.tiltX = Math.max(-6, Math.min(6, Number(x) || 0));
  materialPreviewState.tiltY = Math.max(-9, Math.min(9, Number(y) || 0));
  const stage = $('materialPreviewStage');
  stage?.style.setProperty('--preview-tilt-x', `${materialPreviewState.tiltX}deg`);
  stage?.style.setProperty('--preview-tilt-y', `${materialPreviewState.tiltY}deg`);
  stage?.style.setProperty('--preview-light-x', `${50 + materialPreviewState.tiltY * 3.2}%`);
  if (materialPreviewState.mode === 'webgl') drawMaterialShader();
}

function syncMaterialPreviewLayout() {
  const preview = $('costSheetPreview');
  const stage = $('materialPreviewStage');
  if (!preview || !stage) return;
  stage.style.width = preview.style.width || `${preview.offsetWidth}px`;
  stage.style.height = preview.style.height || `${preview.offsetHeight}px`;
  requestAnimationFrame(() => {
    resizeMaterialCanvas();
    if (materialPreviewState.mode === 'webgl') drawMaterialShader();
  });
}

function syncMaterialPreviewEffect(calc = lastCalc) {
  const baseConfig = materialPreviewConfig(calc);
  const pieceMode = $('materialPreviewStage')?.dataset.previewKind === 'piece';
  const enabledConfig = pieceMode && baseConfig.mode === 'none'
    ? { mode: 'css', effect: 'paper' }
    : baseConfig;
  const config = materialPreviewState.enabled ? enabledConfig : { mode: 'none', effect: 'none' };
  const previousMode = materialPreviewState.mode;
  materialPreviewState.mode = config.mode;
  materialPreviewState.effect = config.effect;
  const stage = $('materialPreviewStage');
  const canvas = $('materialShaderCanvas');
  const hint = $('materialPreviewHint');
  if (!stage || !canvas) return;
  stage.dataset.shaderEnabled = materialPreviewState.enabled ? 'true' : 'false';
  stage.dataset.previewRenderer = config.mode;
  stage.dataset.previewEffect = config.effect;
  stage.classList.toggle('is-interactive', config.mode !== 'none');
  stage.classList.toggle('is-webgl', config.mode === 'webgl');
  stage.classList.remove('is-webgl-fallback');
  if (hint) hint.hidden = config.mode === 'none';
  if (config.mode === 'webgl') {
    canvas.hidden = false;
    if (!initializeMaterialWebGL()) {
      stage.classList.add('is-webgl-fallback');
      canvas.hidden = true;
    }
  } else {
    canvas.hidden = true;
    if (previousMode === 'webgl') destroyMaterialWebGL();
    if (config.mode === 'none') applyMaterialTilt(0, 0);
  }
  syncMaterialPreviewLayout();
}

function setMaterialPreviewEnabled(enabled) {
  materialPreviewState.enabled = Boolean(enabled);
  const input = $('materialShaderToggle');
  const status = $('materialShaderToggleStatus');
  if (input) input.checked = materialPreviewState.enabled;
  if (status) status.textContent = materialPreviewState.enabled ? 'เปิด' : 'ปิด';
  syncMaterialPreviewEffect(lastCalc);
  return materialPreviewState.enabled;
}

function getMaterialPreviewEnabled() {
  return materialPreviewState.enabled;
}

function bindMaterialPreviewInteraction() {
  if (materialPreviewState.bound) return;
  const interaction = $('materialPreviewInteraction');
  if (!interaction) return;
  materialPreviewState.bound = true;
  $('materialShaderToggle')?.addEventListener('change', event => setMaterialPreviewEnabled(event.target.checked));
  interaction.addEventListener('pointerdown', event => {
    if (materialPreviewState.mode === 'none' || (event.pointerType === 'mouse' && event.button !== 0)) return;
    materialPreviewState.pointerId = event.pointerId;
    interaction.setPointerCapture?.(event.pointerId);
    interaction.classList.add('is-dragging');
    event.preventDefault();
  });
  interaction.addEventListener('pointermove', event => {
    if (event.pointerId !== materialPreviewState.pointerId) return;
    const rect = interaction.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 18;
    const y = -((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 12;
    applyMaterialTilt(y, x);
    event.preventDefault();
  });
  const finish = event => {
    if (event.pointerId !== materialPreviewState.pointerId) return;
    materialPreviewState.pointerId = null;
    interaction.releasePointerCapture?.(event.pointerId);
    interaction.classList.remove('is-dragging');
    if (materialPreviewState.mode === 'webgl') drawMaterialShader();
  };
  interaction.addEventListener('pointerup', finish);
  interaction.addEventListener('pointercancel', finish);
  interaction.addEventListener('dblclick', () => applyMaterialTilt(0, 0));
  window.addEventListener('resize', () => syncMaterialPreviewLayout());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindMaterialPreviewInteraction, { once: true });
else bindMaterialPreviewInteraction();

window.syncMaterialPreviewEffect = syncMaterialPreviewEffect;
window.syncMaterialPreviewLayout = syncMaterialPreviewLayout;
window.materialPreviewConfig = materialPreviewConfig;
window.setMaterialPreviewEnabled = setMaterialPreviewEnabled;
window.getMaterialPreviewEnabled = getMaterialPreviewEnabled;
