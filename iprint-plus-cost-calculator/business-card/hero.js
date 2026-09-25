// A showroom only: the editor remains on /material-preview/.
const stage = document.getElementById('heroStage');
const dialog = document.getElementById('heroPreview');
const mount = document.getElementById('heroMount');
const expand = document.getElementById('heroExpand');
const tilt = document.getElementById('heroTilt');
const message = document.getElementById('heroPreviewHint');
expand.disabled = true;
let scene, loading, expanded = false, visible = true, session = 0;
stage.querySelector('canvas').addEventListener('webglcontextlost', event => {
  event.preventDefault();
  close();
  expand.disabled = true;
  const status = document.getElementById('heroLoading');
  status.hidden = false;
  status.textContent = 'พรีวิว 3 มิติหยุดทำงาน กรุณารีเฟรชหน้าเพื่อดูอีกครั้ง';
});
async function load() {
  if (loading) return loading;
  loading = import('./showroom.js').then(module => module.createShowroom(stage, () => visible || expanded)).then(value => {
    scene = value;
    expand.disabled = false;
    document.getElementById('heroLoading').hidden = true;
    return value;
  }).catch(() => {
    document.getElementById('heroLoading').textContent = 'แสดง 3 มิติไม่ได้บนอุปกรณ์นี้ — ยังลองใส่ดีไซน์ของคุณได้';
    expand.disabled = true;
  });
  return loading;
}
new IntersectionObserver(entries => {
  visible = entries[0].isIntersecting;
  if (visible) load();
}, { rootMargin: '100px' }).observe(mount);

expand.addEventListener('click', async () => {
  if (!scene) return;
  expanded = true;
  session++;
  dialog.showModal();
  dialog.prepend(stage);
  document.body.classList.add('preview-open');
  tilt.hidden = !matchMedia('(pointer: coarse)').matches;
  message.textContent = 'ลากเพื่อดูมุมต่าง ๆ · บนมือถือหมุนเครื่องเป็นแนวนอน';
  scene.setExpanded(true);
  try {
    await dialog.requestFullscreen?.();
    if (expanded && matchMedia('(pointer: coarse)').matches) await screen.orientation?.lock?.('landscape');
  } catch { /* The dialog fills the viewport when native fullscreen / orientation lock is unavailable. */ }
  if (!expanded && document.fullscreenElement === dialog) document.exitFullscreen().catch(() => {});
});
function close() {
  if (!expanded) return;
  expanded = false;
  session++;
  scene?.setExpanded(false);
  mount.prepend(stage);
  document.body.classList.remove('preview-open');
  if (dialog.open) dialog.close();
  if (document.fullscreenElement === dialog) document.exitFullscreen().catch(() => {});
  try { screen.orientation?.unlock?.(); } catch { /* unsupported */ }
  tilt.disabled = false;
  tilt.textContent = 'เปิดการเอียงตามมือถือ';
  expand.focus();
}
document.getElementById('heroClose').addEventListener('click', close);
dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
dialog.addEventListener('close', close);
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) close(); });
tilt.addEventListener('click', async () => {
  const current = session;
  const pending = scene.input.enableSensors(); // permission stays inside the user gesture
  tilt.disabled = true;
  const result = await pending;
  if (!expanded || current !== session) { scene.input.disableSensors(); return; }
  tilt.disabled = false;
  message.textContent = result.ok ? 'เอียงมือถือเพื่อดูแสงบนผิวนามบัตร' : 'เปิดเซนเซอร์ไม่ได้หรือไม่ได้รับสิทธิ์ — ลากนิ้วเพื่อดูแทนได้';
  tilt.textContent = result.ok ? 'ตั้งมุมถือใหม่' : 'ลองเปิดการเอียงอีกครั้ง';
  if (result.ok) scene.input.recenter();
});

screen.orientation?.addEventListener('change', () => { if (expanded) scene?.input.recenter(); });
