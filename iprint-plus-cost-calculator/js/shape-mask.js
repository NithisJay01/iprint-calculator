'use strict';

function getDiecutShapeState() {
  return {
    active: Boolean(diecutShapeFile && diecutShapeUrl),
    name: diecutShapeFile?.name || '',
    type: diecutShapeFile?.type || '',
    size: Number(diecutShapeFile?.size) || 0
  };
}

function getDiecutShapeDataUrl() {
  if (!diecutShapeFile) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('อ่านไฟล์ Shape ไม่สำเร็จ'));
    reader.readAsDataURL(diecutShapeFile);
  });
}

function syncDiecutShapePreview() {
  const active = Boolean(diecutShapeFile && diecutShapeUrl);
  document.body.classList.toggle('has-diecut-shape', active);
  if (active) document.body.style.setProperty('--diecut-shape-url', `url("${diecutShapeUrl}")`);
  else document.body.style.removeProperty('--diecut-shape-url');
  const status = $('diecutShapeStatus');
  const clear = $('clearDiecutShape');
  if (status) status.textContent = active
    ? `${diecutShapeFile.name} • ใช้ Clipping mask แล้ว`
    : 'ยังไม่ได้เลือก Shape • มุมฉาก 0°';
  if (clear) clear.hidden = !active;
}

function clearDiecutShape() {
  if (diecutShapeUrl) URL.revokeObjectURL(diecutShapeUrl);
  diecutShapeFile = null;
  diecutShapeUrl = '';
  if ($('diecutShapeFile')) $('diecutShapeFile').value = '';
  syncDiecutShapePreview();
  if (typeof calculate === 'function') calculate();
}

function setDiecutShape(file) {
  if (!file) return;
  const validType = file.type === 'image/png' || file.type === 'image/svg+xml' || /\.(png|svg)$/i.test(file.name || '');
  if (!validType) {
    $('diecutShapeStatus').textContent = 'รองรับเฉพาะ PNG โปร่งใส หรือ SVG เท่านั้น';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    $('diecutShapeStatus').textContent = 'ไฟล์ Shape ต้องมีขนาดไม่เกิน 5 MB';
    return;
  }
  if (diecutShapeUrl) URL.revokeObjectURL(diecutShapeUrl);
  diecutShapeFile = file;
  diecutShapeUrl = URL.createObjectURL(file);
  syncDiecutShapePreview();
  if (typeof calculate === 'function') calculate();
}

function bindDiecutShape() {
  $('diecutShapeFile')?.addEventListener('change', event => setDiecutShape(event.target.files?.[0]));
  $('clearDiecutShape')?.addEventListener('click', clearDiecutShape);
  syncDiecutShapePreview();
}

window.getDiecutShapeState = getDiecutShapeState;
window.getDiecutShapeDataUrl = getDiecutShapeDataUrl;
