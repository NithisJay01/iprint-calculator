'use strict';

const FLOW_STEPS = { layout: 1, cost: 2, brief: 3, review: 4 };
let currentAppView = 'home';
let currentJobVariants = [];
let selectedHomeService = 'laser';
let costPreviewMode = 'sheet';
let costPiecePaperRotation = 0;

function flowEscape(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showAppView(name, options = {}) {
  const target = document.querySelector(`[data-app-view="${name}"]`);
  if (!target) return false;

  document.querySelectorAll('[data-app-view]').forEach(view => {
    const active = view === target;
    view.classList.toggle('is-active', active);
    if (!active) view.classList.remove('open');
    view.setAttribute('aria-hidden', active ? 'false' : 'true');
  });

  currentAppView = name;
  updateFlowStepper(name);
  if ((name === 'layout' || name === 'brief') && typeof setActiveArtworkSide === 'function') setActiveArtworkSide('front');
  if (name === 'layout' && typeof calculate === 'function') {
    requestAnimationFrame(() => calculate());
  }
  if (name === 'cost' || name === 'brief' || name === 'review') syncFlowSummary();
  if (name === 'cart' && typeof renderCart === 'function') renderCart();
  if (!options.preserveScroll) window.scrollTo({ top: 0, behavior: options.instant ? 'auto' : 'smooth' });
  return true;
}

function updateFlowStepper(view) {
  const stepper = $('flowStepper');
  const step = FLOW_STEPS[view] || 0;
  stepper.hidden = !step;
  stepper.querySelectorAll('.flow-step').forEach(node => {
    const number = Number(node.dataset.step);
    node.classList.toggle('is-active', number === step);
    node.classList.toggle('is-done', number < step);
  });
}

function miniLayoutMarkup(maximum = 9, side = 'front') {
  const count = Math.max(1, Math.min(maximum, Number(lastCalc?.b?.yield) || 9));
  const artwork = typeof getArtworkPreviewUrl === 'function' ? getArtworkPreviewUrl(side) : '';
  const rotation = typeof getArtworkRotation === 'function' ? getArtworkRotation(side) : 0;
  const scale = typeof artworkRotationScale === 'function'
    ? artworkRotationScale(rotation, lastCalc?.b?.pieceW, lastCalc?.b?.pieceH)
    : 1;
  return Array.from({ length: count }, () =>
    `<span>${artwork ? `<i class="mini-artwork" style="background-image:url('${flowEscape(artwork)}');--artwork-rotation:${rotation}deg;--artwork-rotation-scale:${scale}"></i>` : ''}</span>`
  ).join('');
}

function flowPreviewMaterialClass() {
  const materialName = String(lastCalc?.material?.name || '').toLowerCase();
  if (/kraft|คราฟท์/.test(materialName)) return 'is-kraft';
  if (/pvc|pp|sticker|สติกเกอร์/.test(materialName)) return 'is-sticker';
  if (/art|อาร์ท/.test(materialName)) return 'is-art-paper';
  return '';
}

function flowPreviewHasDiecut() {
  return (lastCalc?.services || []).some(service => /ไดคัท|die.?cut/.test(String(service?.name || '').toLowerCase()));
}

function previewArtworkMarkup(side, width, height) {
  const artwork = typeof getArtworkPreviewUrl === 'function' ? getArtworkPreviewUrl(side) : '';
  if (!artwork) return '<span class="preview-gallery-empty">ยังไม่มีภาพ</span>';
  const rotation = typeof getArtworkRotation === 'function' ? getArtworkRotation(side) : 0;
  const scale = typeof artworkRotationScale === 'function' ? artworkRotationScale(rotation, width, height) : 1;
  return `<img class="preview-gallery-artwork" data-preview-side="${side}" src="${flowEscape(artwork)}" alt="ภาพงาน${side === 'back' ? 'ด้านหลัง' : 'ด้านหน้า'}" style="--artwork-rotation:${rotation}deg;--artwork-rotation-scale:${scale}">`;
}

function previewGalleryPieceMarkup(side, width, height) {
  const materialClass = flowPreviewMaterialClass();
  const diecutClass = flowPreviewHasDiecut() ? ' has-diecut-effect' : '';
  return `<span class="preview-gallery-piece${diecutClass}">${previewArtworkMarkup(side, width, height)}${materialClass ? `<i class="piece-material-effect ${materialClass}" aria-hidden="true"></i>` : ''}</span>`;
}

function imposedPieceDimensions() {
  return {
    width: Math.max(.05, Number(lastCalc?.b?.pieceW) || Number(lastCalc?.W) * 10 || 1),
    height: Math.max(.05, Number(lastCalc?.b?.pieceH) || Number(lastCalc?.H) * 10 || 1)
  };
}

function previewGallerySurfaceAttributes() {
  const enabled = typeof getMaterialPreviewEnabled !== 'function' || getMaterialPreviewEnabled();
  const config = enabled && typeof materialPreviewConfig === 'function' ? materialPreviewConfig(lastCalc) : { mode: 'none', effect: 'none' };
  return `data-preview-renderer="${flowEscape(config.mode)}" data-preview-effect="${flowEscape(config.effect)}"`;
}

function sheetPreviewGalleryMarkup(side = 'front') {
  if (!lastCalc) return '';
  const paper = lastCalc.paper || {};
  const fullW = Math.max(1, Number(paper.fullW) * 10 || 1);
  const fullH = Math.max(1, Number(paper.fullH) * 10 || 1);
  const usableW = Math.max(1, Math.min(fullW, Number(paper.usableW) * 10 || fullW));
  const usableH = Math.max(1, Math.min(fullH, Number(paper.usableH) * 10 || fullH));
  const nx = Math.max(1, Number(lastCalc.b?.nx) || 1);
  const ny = Math.max(1, Number(lastCalc.b?.ny) || 1);
  const pieceW = Math.max(1, Number(lastCalc.b?.pieceW) || 1);
  const pieceH = Math.max(1, Number(lastCalc.b?.pieceH) || 1);
  const gap = Math.max(0, Number(lastCalc.gap) || 0);
  const gridW = nx * pieceW + Math.max(0, nx - 1) * gap;
  const gridH = ny * pieceH + Math.max(0, ny - 1) * gap;
  const count = Math.max(1, Number(lastCalc.b?.yield) || nx * ny);
  const pieces = Array.from({ length: count }, () => previewGalleryPieceMarkup(side, pieceW, pieceH)).join('');
  const usableStyle = `left:${(fullW - usableW) / fullW * 50}%;top:${(fullH - usableH) / fullH * 50}%;width:${usableW / fullW * 100}%;height:${usableH / fullH * 100}%`;
  const gridStyle = `left:${Math.max(0, (usableW - gridW) / usableW * 50)}%;top:${Math.max(0, (usableH - gridH) / usableH * 50)}%;width:${Math.min(100, gridW / usableW * 100)}%;height:${Math.min(100, gridH / usableH * 100)}%;grid-template-columns:repeat(${nx},1fr);grid-template-rows:repeat(${ny},1fr);column-gap:${gap / usableW * 100}%;row-gap:${gap / usableH * 100}%`;
  return `<div class="preview-gallery-surface preview-gallery-sheet" ${previewGallerySurfaceAttributes()} style="aspect-ratio:${fullW}/${fullH}"><div class="preview-gallery-usable" style="${usableStyle}"><div class="preview-gallery-grid" style="${gridStyle}">${pieces}</div></div><i class="preview-gallery-reflection" aria-hidden="true"></i></div>`;
}

function piecePreviewGalleryMarkup(side = 'front') {
  if (!lastCalc) return '';
  const { width, height } = imposedPieceDimensions();
  const maxWidth = 320;
  const maxHeight = 300;
  const displayScale = Math.min(maxWidth / width, maxHeight / height);
  const displayWidth = Math.max(72, width * displayScale);
  return `<div class="preview-gallery-surface preview-gallery-piece-frame" ${previewGallerySurfaceAttributes()} style="width:${displayWidth}px;aspect-ratio:${width}/${height}">${previewGalleryPieceMarkup(side, width, height)}<i class="preview-gallery-reflection" aria-hidden="true"></i></div>`;
}

function previewGalleryMarkup() {
  const doubleSided = typeof getSelectedPrintSide === 'function' && getSelectedPrintSide() === 'double';
  const hasBackArtwork = typeof getArtworkPreviewUrl === 'function' && Boolean(getArtworkPreviewUrl('back'));
  const sides = doubleSided && hasBackArtwork ? ['front', 'back'] : ['front'];
  const sideLabel = side => side === 'back' ? 'ด้านหลัง' : 'ด้านหน้า';
  const definitions = [
    { kind: 'รายแผ่น', renderer: sheetPreviewGalleryMarkup },
    { kind: 'รายชิ้น', renderer: piecePreviewGalleryMarkup }
  ];
  const slides = definitions.flatMap(({ kind, renderer }) => sides.map(side => ({ kind, side, renderer })));
  const slideMarkup = slides.map((slide, index) => `<article class="preview-gallery-card preview-carousel-slide${index === 0 ? ' is-active' : ''}" data-preview-carousel-slide data-preview-kind="${slide.kind}" data-preview-side="${slide.side}" aria-hidden="${index === 0 ? 'false' : 'true'}"${index === 0 ? '' : ' hidden'}><strong>Preview ${slide.kind} • ${sideLabel(slide.side)}</strong>${slide.renderer(slide.side)}</article>`).join('');
  const dots = slides.map((slide, index) => `<button type="button" data-preview-carousel-index="${index}" class="${index === 0 ? 'is-selected' : ''}" aria-label="ดู Preview ${slide.kind} ${sideLabel(slide.side)}" aria-pressed="${index === 0 ? 'true' : 'false'}"></button>`).join('');
  return `<section class="preview-carousel" data-preview-carousel data-preview-index="0"><div class="preview-carousel-viewport">${slideMarkup}</div><div class="preview-carousel-controls"><button type="button" data-preview-carousel-action="prev" aria-label="ดู Preview ก่อนหน้า">‹</button><div class="preview-carousel-dots">${dots}</div><output data-preview-carousel-status>1 / ${slides.length}</output><button type="button" data-preview-carousel-action="next" aria-label="ดู Preview ถัดไป">›</button></div></section>`;
}

function syncPreviewCarousel(carousel, requestedIndex) {
  const slides = [...carousel.querySelectorAll('[data-preview-carousel-slide]')];
  if (!slides.length) return;
  const index = ((Number(requestedIndex) || 0) % slides.length + slides.length) % slides.length;
  carousel.dataset.previewIndex = String(index);
  slides.forEach((slide, slideIndex) => {
    const selected = slideIndex === index;
    slide.hidden = !selected;
    slide.classList.toggle('is-active', selected);
    slide.setAttribute('aria-hidden', selected ? 'false' : 'true');
  });
  carousel.querySelectorAll('[data-preview-carousel-index]').forEach(button => {
    const selected = Number(button.dataset.previewCarouselIndex) === index;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  const status = carousel.querySelector('[data-preview-carousel-status]');
  if (status) status.textContent = `${index + 1} / ${slides.length}`;
  carousel.querySelectorAll('[data-preview-carousel-action]').forEach(button => { button.disabled = slides.length < 2; });
}

function renderCostPreviewMode() {
  if (!lastCalc) return;
  const source = $('sheetPreview');
  const preview = $('costSheetPreview');
  const stage = $('materialPreviewStage');
  if (!source || !preview || !stage) return;
  preview.classList.toggle('is-piece-preview', costPreviewMode === 'piece');
  stage.dataset.previewKind = costPreviewMode;
  const pieceTools = $('costPieceTools');
  const rotatePaperButton = $('rotateCostPiecePaper');
  const rotationOutput = $('costPiecePaperRotation');
  if (pieceTools) pieceTools.hidden = costPreviewMode !== 'piece';
  if (rotatePaperButton) rotatePaperButton.setAttribute('aria-label', `หมุนหน้ากระดาษ Preview รายชิ้น 90 องศา มุมปัจจุบัน ${costPiecePaperRotation} องศา`);
  if (rotationOutput) rotationOutput.textContent = `มุมหน้ากระดาษ ${costPiecePaperRotation}°`;
  if (costPreviewMode === 'piece') {
    const sourcePiece = source.querySelector('.piece');
    const piece = sourcePiece ? sourcePiece.cloneNode(true) : document.createElement('div');
    piece.classList.add('piece', 'cost-single-piece');
    piece.removeAttribute('tabindex');
    piece.removeAttribute('role');
    piece.removeAttribute('aria-label');
    piece.querySelector('.piece-number')?.remove();
    piece.querySelector('.bleed')?.remove();
    const { width: pieceWidth, height: pieceHeight } = imposedPieceDimensions();
    const swapsSides = costPiecePaperRotation % 180 !== 0;
    const viewWidth = swapsSides ? pieceHeight : pieceWidth;
    const viewHeight = swapsSides ? pieceWidth : pieceHeight;
    const available = Math.max(220, Math.min(380, ($('materialPreviewInteraction')?.clientWidth || 360) - 24));
    const ratio = Math.max(.05, viewWidth / Math.max(.05, viewHeight));
    let width = available;
    let height = width / ratio;
    if (height > 360) { height = 360; width = height * ratio; }
    preview.replaceChildren(piece);
    preview.style.width = `${Math.max(1, width)}px`;
    preview.style.height = `${Math.max(1, height)}px`;
    preview.style.setProperty('--piece-paper-width', `${Math.max(1, swapsSides ? height : width)}px`);
    preview.style.setProperty('--piece-paper-height', `${Math.max(1, swapsSides ? width : height)}px`);
    preview.style.setProperty('--piece-paper-rotation', `${costPiecePaperRotation}deg`);
    preview.classList.toggle('has-paper-rotation', costPiecePaperRotation !== 0);
    stage.dataset.paperRotation = String(costPiecePaperRotation);
  } else {
    preview.classList.remove('has-paper-rotation');
    preview.style.removeProperty('--piece-paper-width');
    preview.style.removeProperty('--piece-paper-height');
    preview.style.removeProperty('--piece-paper-rotation');
    delete stage.dataset.paperRotation;
    preview.innerHTML = source.innerHTML;
    preview.style.width = source.style.width;
    preview.style.height = source.style.height;
  }
  document.querySelectorAll('[data-cost-preview-mode]').forEach(button => {
    const selected = button.dataset.costPreviewMode === costPreviewMode;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  if (typeof syncMaterialPreviewEffect === 'function') syncMaterialPreviewEffect(lastCalc);
}

function setCostPreviewMode(mode) {
  costPreviewMode = mode === 'piece' ? 'piece' : 'sheet';
  renderCostPreviewMode();
}

function getCostPreviewMode() {
  return costPreviewMode;
}

function rotateCostPiecePaper() {
  if (costPreviewMode !== 'piece') return false;
  costPiecePaperRotation = (costPiecePaperRotation + 90) % 360;
  renderCostPreviewMode();
  return true;
}

function getCostPiecePaperRotation() {
  return costPiecePaperRotation;
}

function syncFlowSummary() {
  if (!lastCalc) return;
  const layout = `${lastCalc.b.nx} × ${lastCalc.b.ny} (${lastCalc.b.rotate ? 'หมุน 90°' : 'แนวปกติ'})`;
  const source = $('sheetPreview');
  const costPreview = $('costSheetPreview');

  if ($('layoutDirection')) $('layoutDirection').textContent = layout;
  if ($('sheetWidthLabel')) $('sheetWidthLabel').textContent = `${Number(lastCalc.paper.fullW * 10).toLocaleString('th-TH')} mm`;
  if ($('sheetHeightLabel')) $('sheetHeightLabel').textContent = `${Number(lastCalc.paper.fullH * 10).toLocaleString('th-TH')} mm`;
  if ($('costLayoutSummary')) $('costLayoutSummary').textContent = `${lastCalc.b.yield} ชิ้น/แผ่น (ใช้ ${lastCalc.sheets} แผ่น)`;
  if ($('briefCalcSummary')) {
    $('briefCalcSummary').innerHTML = `ขนาด ${Number(lastCalc.W).toLocaleString('th-TH')}×${Number(lastCalc.H).toLocaleString('th-TH')} cm • ${Number(lastCalc.Q).toLocaleString('th-TH')} ชิ้น<br>• ${lastCalc.b.yield} ชิ้น / แผ่น รวม ${lastCalc.sheets} แผ่น`;
  }
  if ($('briefArtworkPreview')) $('briefArtworkPreview').innerHTML = previewGalleryMarkup();
  if ($('previewFinishStatus')) {
    const finishNames = [lastCalc.material?.name, ...(lastCalc.services || []).map(service => service.name)].filter(Boolean);
    const rendererEnabled = typeof getMaterialPreviewEnabled !== 'function' || getMaterialPreviewEnabled();
    const renderer = rendererEnabled && typeof materialPreviewConfig === 'function' ? materialPreviewConfig(lastCalc) : { mode: 'none' };
    const rendererLabel = renderer.mode === 'webgl' ? ' • WebGL 2.5D' : renderer.mode === 'css' ? ' • CSS 2.5D' : '';
    $('previewFinishStatus').textContent = finishNames.length
      ? `Preview: ${finishNames.join(' • ')}${rendererLabel}`
      : 'Preview วัสดุและ Option เสริม';
  }

  if (source && costPreview) renderCostPreviewMode();
  if (typeof syncArtworkSideControls === 'function') syncArtworkSideControls();
}

function variantId() {
  return globalThis.crypto?.randomUUID?.() || `variant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeVariants(variants) {
  const source = Array.isArray(variants) && variants.length ? variants : [{ name: '', quantity: Number($('qty')?.value) || 0 }];
  return source.slice(0, 12).map(variant => ({
    id: String(variant.id || variantId()),
    name: String(variant.name || ''),
    quantity: Number(variant.quantity) || 0
  }));
}

function renderJobVariants() {
  const container = $('jobVariants');
  if (!container) return;
  currentJobVariants = normalizeVariants(currentJobVariants);
  container.innerHTML = currentJobVariants.map((variant, index) => `
    <div class="job-variant" data-variant-id="${flowEscape(variant.id)}">
      <strong>แบบที่ ${index + 1}</strong>
      <input data-variant-name maxlength="80" value="${flowEscape(variant.name)}" placeholder="คำตัวอย่าง แบบเวอร์ชั่นภาษาไทย">
      <div class="variant-quantity-field"><input data-variant-quantity type="number" min="1" step="1" value="${variant.quantity || ''}" placeholder="จำนวน" aria-label="จำนวนแบบที่ ${index + 1}"><span>ชิ้น</span></div>
      <button data-remove-variant type="button" aria-label="ลบแบบที่ ${index + 1}"${currentJobVariants.length === 1 ? ' hidden' : ''}>×</button>
    </div>`).join('');
}

function readVariantInputs() {
  return Array.from(document.querySelectorAll('.job-variant')).map(row => ({
    id: row.dataset.variantId || variantId(),
    name: row.querySelector('[data-variant-name]')?.value.trim() || '',
    quantity: Number(row.querySelector('[data-variant-quantity]')?.value) || 0
  }));
}

function getJobVariants() {
  currentJobVariants = readVariantInputs();
  return currentJobVariants.map(variant => ({ ...variant }));
}

function setJobVariants(variants) {
  currentJobVariants = normalizeVariants(variants);
  renderJobVariants();
}

function validateJobVariants(showMessage = true) {
  const variants = getJobVariants();
  const expected = Number($('qty')?.value) || 0;
  const total = variants.reduce((sum, variant) => sum + variant.quantity, 0);
  const status = $('variantStatus');
  let message = '';

  if (!variants.length) message = 'กรุณาเพิ่มอย่างน้อย 1 แบบ';
  else if (variants.some(variant => variant.quantity <= 0)) message = 'กรุณาระบุจำนวนของทุกแบบ';
  else if (total !== expected) message = `จำนวนทุกแบบรวม ${total.toLocaleString('th-TH')} ชิ้น ต้องเท่ากับจำนวนงาน ${expected.toLocaleString('th-TH')} ชิ้น`;

  if (status && showMessage) {
    status.textContent = message || `รวม ${total.toLocaleString('th-TH')} ชิ้น ถูกต้อง`;
    status.className = `status ${message ? 'warn' : 'ok'}`;
  }
  return !message;
}

function normalizeFlowDateValue(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatFlowDateInput(value) {
  const iso = normalizeFlowDateValue(value);
  if (!iso) return String(value || '');
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function formatGregorianDate(value) {
  const iso = normalizeFlowDateValue(value);
  if (!iso) return '-';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' });
}

function focusBriefField(element, message, errorId = '') {
  const status = $('briefFormStatus');
  if (status) {
    status.textContent = message;
    status.className = 'brief-form-status status warn';
  }
  if (errorId && $(errorId)) $(errorId).textContent = message;
  element?.classList.add('is-invalid');
  requestAnimationFrame(() => {
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.focus({ preventScroll: true });
  });
  return false;
}

function validateBriefForm() {
  document.querySelectorAll('.is-invalid').forEach(element => element.classList.remove('is-invalid'));
  document.querySelectorAll('.field-error').forEach(element => { element.textContent = ''; });
  if ($('briefFormStatus')) $('briefFormStatus').textContent = '';
  if (!$('jobName').value.trim()) return focusBriefField($('jobName'), 'กรุณากรอกชื่องาน');
  if (!validateJobVariants(true)) {
    const invalidVariant = [...document.querySelectorAll('#jobVariants input')].find(input => {
      if (input.classList.contains('variant-quantity')) return Number(input.value) <= 0;
      return input.classList.contains('variant-name') && !input.value.trim();
    }) || document.querySelector('#jobVariants input');
    return focusBriefField(invalidVariant || $('jobVariants'), 'กรุณาตรวจสอบชื่อและจำนวนของแต่ละแบบ');
  }
  const briefDate = normalizeFlowDateValue($('briefDeadline').value);
  if (!briefDate) return focusBriefField($('briefDeadline'), 'กรุณากรอกวันส่งตรวจไฟล์เป็น DD/MM/YYYY', 'briefDeadlineError');
  const deliveryDate = normalizeFlowDateValue($('deliveryDeadline').value);
  if (!deliveryDate) return focusBriefField($('deliveryDeadline'), 'กรุณากรอกวันส่งมอบเป็น DD/MM/YYYY', 'deliveryDeadlineError');
  if (deliveryDate < briefDate) return focusBriefField($('deliveryDeadline'), 'วันส่งมอบต้องไม่ก่อนวันส่งตรวจไฟล์', 'deliveryDeadlineError');
  return true;
}

function renderBriefReview(options = {}) {
  if (!lastCalc) return false;
  if (!options.skipValidation && !validateBriefForm()) return false;

  const variants = getJobVariants();
  const services = (lastCalc.services || []).map(service => service.name).filter(Boolean).join(' • ') || 'ไม่มีบริการเพิ่มเติม';
  const link = $('briefFileLink').value.trim();
  const note = $('graphicBriefDescription').value.trim() || 'ไม่มีคำขอเทคนิคพิเศษ';
  $('briefReviewContent').innerHTML = `
    <div class="brief-review-head"><h2>■ iPrint Brief — ${flowEscape(Number(lastCalc.W).toLocaleString('th-TH'))}×${flowEscape(Number(lastCalc.H).toLocaleString('th-TH'))} cm</h2><small>Preview</small></div>
    <div class="brief-review-name"><strong>ชื่องาน :</strong> ${flowEscape($('jobName').value.trim())}</div>
    <div class="brief-review-variants"><strong>จำนวนแบบ : ${variants.length} แบบ</strong>${variants.map((variant, index) => `<div class="brief-review-variant"><b>แบบที่ ${index + 1}</b><span>${flowEscape(variant.name || '-')}</span><strong>${variant.quantity.toLocaleString('th-TH')} ชิ้น</strong></div>`).join('')}</div>
    <div class="brief-review-metrics"><div><span>ขนาด / จำนวน</span><strong>${flowEscape(lastCalc.W)}×${flowEscape(lastCalc.H)} cm (${Number(lastCalc.Q).toLocaleString('th-TH')} ชิ้น)</strong></div><div><span>การจัดวางชิ้นงาน</span><strong>${lastCalc.b.yield} ชิ้น/แผ่น (${lastCalc.sheets} แผ่น)</strong></div><div><span>วัสดุ / การผลิต</span><strong>${flowEscape(lastCalc.material?.name || lastCalc.paper?.name || '-')}</strong></div><div><span>กำหนดส่งงาน</span><strong>${flowEscape(formatGregorianDate($('deliveryDeadline').value))}</strong></div></div>
    <div class="brief-review-note">${flowEscape(note)}<br><small>${flowEscape(services)}</small></div>
    <div class="brief-review-layout preview-gallery">${previewGalleryMarkup()}</div>
    <div class="artwork-summary-slot brief-review-artwork-summary" data-artwork-summary></div>
    ${link ? `<div class="brief-review-note"><strong>ลิงก์ไฟล์ต้นฉบับ</strong><br>${flowEscape(link)}</div>` : ''}`;
  if (typeof renderArtworkSummaries === 'function') renderArtworkSummaries();
  return true;
}

function showOrderSuccess(remote, order) {
  const modal = $('orderSuccessModal');
  const orderId = order?.quoteNo || String(remote?.id || '').slice(0, 12) || '-';
  $('successOrderId').textContent = `Order: ${orderId}`;
  $('successOrderSummary').textContent = `สร้างแล้ว ${Number(remote?.itemIds?.length || order?.orderItems?.length || 0).toLocaleString('th-TH')} รายการ และส่ง Brief ให้กราฟิกแล้ว`;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeOrderSuccess() {
  $('orderSuccessModal').classList.remove('open');
  $('orderSuccessModal').setAttribute('aria-hidden', 'true');
}

function prepareNewPrintItem() {
  editingCartItemId = '';
  if ($('jobName')) $('jobName').value = '';
  if ($('briefFileLink')) { $('briefFileLink').value = ''; $('briefFileLink').hidden = true; }
  if ($('graphicBriefDescription')) $('graphicBriefDescription').value = '';
  if ($('briefDeadline')) $('briefDeadline').value = '';
  if ($('deliveryDeadline')) $('deliveryDeadline').value = '';
  setJobVariants([{ name: '', quantity: Number($('qty')?.value) || 0 }]);
  if (typeof clearTemporaryImages === 'function') clearTemporaryImages();
}

function bindFlow() {
  setJobVariants([{ name: '', quantity: Number($('qty').value) || 500 }]);
  showAppView('home', { instant: true });
  $('startPrintOrder').addEventListener('click', () => showAppView('layout'));
  $('goHome').addEventListener('click', () => showAppView('home'));
  document.querySelectorAll('[data-flow-next]').forEach(button => button.addEventListener('click', () => showAppView(button.dataset.flowNext)));
  document.querySelectorAll('[data-flow-back]').forEach(button => button.addEventListener('click', () => showAppView(button.dataset.flowBack)));
  $('reviewBrief').addEventListener('click', () => { if (renderBriefReview()) showAppView('review'); });
  $('editBrief').addEventListener('click', () => showAppView('brief'));
  $('addAnotherItem').addEventListener('click', () => { prepareNewPrintItem(); showAppView('layout'); });
  $('workflowNewOrder').addEventListener('click', () => showAppView('home'));
  $('addJobVariant').addEventListener('click', () => {
    currentJobVariants = readVariantInputs();
    currentJobVariants.push({ id: variantId(), name: '', quantity: 0 });
    renderJobVariants();
  });
  $('jobVariants').addEventListener('input', () => validateJobVariants(false));
  $('jobVariants').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-variant]');
    if (!button || currentJobVariants.length <= 1) return;
    const row = button.closest('.job-variant');
    currentJobVariants = readVariantInputs().filter(variant => variant.id !== row?.dataset.variantId);
    renderJobVariants();
    validateJobVariants(true);
  });
  $('qty').addEventListener('change', () => {
    const variants = readVariantInputs();
    if (variants.length === 1) {
      variants[0].quantity = Number($('qty').value) || 0;
      setJobVariants(variants);
    }
  });
  document.querySelectorAll('[data-service-option]').forEach(button => button.addEventListener('click', () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    selectedHomeService = button.dataset.serviceOption || 'laser';
    document.querySelectorAll('[data-service-option]').forEach(option => {
      const selected = option === button;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', selected ? 'true' : 'false');
      const badge = option.querySelector('.service-state');
      if (badge && !option.classList.contains('is-coming-soon')) badge.textContent = selected ? 'Selected' : 'เลือก';
    });
    const art = button.querySelector('.service-art');
    $('serviceHero').dataset.selectedService = selectedHomeService;
    $('serviceHero').setAttribute('aria-label', `กำลังเลือกบริการ ${button.dataset.title || ''}`);
    $('serviceHero').querySelector('.hero-service-art').className = art?.className + ' hero-service-art';
    $('serviceHero').querySelector('.hero-service-art').textContent = art?.textContent || '';
    $('serviceHeroTitle').textContent = button.dataset.title || '';
    $('serviceHeroDescription').textContent = button.dataset.description || '';
  }));
  document.querySelectorAll('[data-file-provider]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    document.querySelectorAll('[data-file-provider]').forEach(option => option.classList.toggle('is-selected', option === button));
    $('briefFileLink').hidden = false;
    $('briefFileLink').dataset.provider = button.dataset.fileProvider;
    window.open(button.dataset.providerUrl, '_blank', 'noopener');
    $('briefFileLink').focus();
  }));
  ['briefDeadline', 'deliveryDeadline'].forEach(id => {
    const datePicker = document.querySelector(`[data-date-for="${id}"]`);
    $(id).addEventListener('input', event => {
      const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
      event.target.value = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
      event.target.classList.remove('is-invalid');
      const error = $(`${id}Error`);
      if (error) error.textContent = '';
    });
    $(id).addEventListener('blur', event => {
      event.target.value = formatFlowDateInput(event.target.value);
      if (datePicker) datePicker.value = normalizeFlowDateValue(event.target.value);
    });
    datePicker?.addEventListener('change', event => {
      $(id).value = formatFlowDateInput(event.target.value);
      $(id).classList.remove('is-invalid');
      const error = $(`${id}Error`);
      if (error) error.textContent = '';
      $(id).dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  $('startNewOrder').addEventListener('click', () => { closeOrderSuccess(); prepareNewPrintItem(); showAppView('home'); });
  $('viewOrderStatus').addEventListener('click', () => { closeOrderSuccess(); openWorkflow(); });
  $('openMaterialsServices').addEventListener('click', () => {
    if (typeof closeSide === 'function') closeSide();
    showAppView('cost');
  });
  $('costPreviewModeToggle')?.addEventListener('click', event => {
    const button = event.target.closest('[data-cost-preview-mode]');
    if (button) setCostPreviewMode(button.dataset.costPreviewMode);
  });
  $('rotateCostPiecePaper')?.addEventListener('click', rotateCostPiecePaper);
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-preview-carousel-action], [data-preview-carousel-index]');
    if (!control) return;
    const carousel = control.closest('[data-preview-carousel]');
    if (!carousel) return;
    if (control.dataset.previewCarouselIndex !== undefined) {
      syncPreviewCarousel(carousel, Number(control.dataset.previewCarouselIndex));
      return;
    }
    const current = Number(carousel.dataset.previewIndex) || 0;
    syncPreviewCarousel(carousel, current + (control.dataset.previewCarouselAction === 'prev' ? -1 : 1));
  });
  window.addEventListener('iprint:calculated', syncFlowSummary);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindFlow, { once: true });
else bindFlow();

window.showAppView = showAppView;
window.syncFlowSummary = syncFlowSummary;
window.getJobVariants = getJobVariants;
window.setJobVariants = setJobVariants;
window.validateJobVariants = validateJobVariants;
window.getSelectedPrintSide = () => {
  const selected = services.filter(service => selectedServiceIds[String(service.id)]).map(service => String(service.name || '').toLowerCase());
  if (selected.some(name => /2\s*หน้า|สองหน้า|double/.test(name))) return 'double';
  if (selected.some(name => /หน้าเดียว|single/.test(name))) return 'single';
  return 'unspecified';
};
window.getSelectedHomeService = () => selectedHomeService;
window.normalizeFlowDateValue = normalizeFlowDateValue;
window.formatFlowDateInput = formatFlowDateInput;
window.showOrderSuccess = showOrderSuccess;
window.renderBriefReview = renderBriefReview;
window.previewGalleryMarkup = previewGalleryMarkup;
window.setCostPreviewMode = setCostPreviewMode;
window.getCostPreviewMode = getCostPreviewMode;
window.rotateCostPiecePaper = rotateCostPiecePaper;
window.getCostPiecePaperRotation = getCostPiecePaperRotation;
