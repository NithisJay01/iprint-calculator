'use strict';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 3;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp'
]);

function artworkFileMessage(file) {
  if (!file) return 'ไม่พบไฟล์ภาพ';
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) return 'รองรับเฉพาะ PNG, JPG และ WEBP';
  if (file.size > MAX_IMAGE_BYTES) return 'ภาพต้องมีขนาดไม่เกิน 8 MB';
  return '';
}

function artworkFileSize(bytes) {
  const size = Number(bytes) || 0;
  return size < 1024 * 1024
    ? `${(size / 1024).toLocaleString('th-TH', { maximumFractionDigits: 0 })} KB`
    : `${(size / (1024 * 1024)).toLocaleString('th-TH', { maximumFractionDigits: 1 })} MB`;
}

function setAssetStatus(text, kind = '') {
  const status = $('assetStatus');
  if (!status) return;
  status.textContent = text;
  status.className = 'asset-status status' + (kind ? ` ${kind}` : '');
}

function normalizeArtworkRotation(value) {
  return ((Math.round(Number(value) || 0) % 360) + 360) % 360;
}

function getArtworkRotation(side = activeArtworkSide) {
  return normalizeArtworkRotation(side === 'back' ? artworkRotationBack : artworkRotationFront);
}

function artworkRotationScale(rotation, width, height) {
  const angle = normalizeArtworkRotation(rotation);
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  return angle % 180 === 0 ? 1 : Math.max(safeWidth / safeHeight, safeHeight / safeWidth);
}

function applyArtworkRotation(element, side = activeArtworkSide, width = 1, height = 1) {
  if (!element) return;
  const rotation = getArtworkRotation(side);
  const scale = artworkRotationScale(rotation, width, height);
  element.style.setProperty('--artwork-rotation', `${rotation}deg`);
  element.style.setProperty('--artwork-rotation-scale', String(scale));
  element.dataset.rotation = String(rotation);
}

function renderReferences() {
  const list = $('referenceList');
  if (!list) return;
  list.innerHTML = '';

  referenceImages.forEach(reference => {
    const item = document.createElement('div');
    item.className = 'reference-item';
    const image = document.createElement('img');
    image.src = reference.url;
    image.alt = `Ref: ${reference.file.name}`;
    const details = document.createElement('div');
    const name = document.createElement('strong');
    const meta = document.createElement('span');
    name.textContent = reference.file.name;
    meta.textContent = `${artworkFileSize(reference.file.size)} • Ref สำหรับภาพสรุปบรีฟ`;
    details.append(name, meta);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-asset';
    remove.textContent = 'ลบ';
    remove.addEventListener('click', () => removeReferenceImage(reference.id));
    item.append(image, details, remove);
    list.appendChild(item);
  });
}

function renderArtworkSummaries() {
  const activeFile = activeArtworkSide === 'back'
    ? (useFrontArtworkForBack ? artworkImage : artworkBackImage)
    : artworkImage;
  const activeUrl = getArtworkPreviewUrl(activeArtworkSide);
  const rotation = getArtworkRotation(activeArtworkSide);
  const sideLabel = activeArtworkSide === 'back' ? 'ด้านหลัง' : 'ด้านหน้า';

  document.querySelectorAll('[data-artwork-summary]').forEach(slot => {
    slot.replaceChildren();
    if (!activeFile || !activeUrl) {
      slot.hidden = true;
      return;
    }

    const card = document.createElement('div');
    card.className = 'artwork-current artwork-summary-card';
    const image = document.createElement('img');
    image.src = activeUrl;
    image.alt = `ภาพงานหลัก${sideLabel}`;
    applyArtworkRotation(image, activeArtworkSide, 1, 1);
    const details = document.createElement('div');
    const name = document.createElement('strong');
    const meta = document.createElement('span');
    name.textContent = `${sideLabel} • ${activeFile.name}`;
    meta.textContent = `${artworkFileSize(activeFile.size)} • มุม ${rotation}° • ใช้ชั่วคราวและล้างเมื่อส่งบรีฟ`;
    details.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'artwork-current-actions';
    const rotate = document.createElement('button');
    rotate.type = 'button';
    rotate.className = 'artwork-summary-rotate';
    rotate.innerHTML = '<img class="button-icon" src="image/rotate.svg" alt="">หมุน 90°';
    rotate.addEventListener('click', () => rotateArtworkImage(activeArtworkSide));
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'artwork-summary-clear';
    clear.textContent = 'ล้างภาพ';
    clear.addEventListener('click', clearArtworkImage);
    actions.append(rotate, clear);
    card.append(image, details, actions);
    slot.appendChild(card);
    slot.hidden = false;
  });
}

function updateArtworkControls() {
  const current = $('artworkCurrent');
  const thumbnail = $('artworkThumbnail');
  const name = $('artworkName');
  const meta = $('artworkMeta');
  const referencePickerMeta = $('referencePickerMeta');
  const activeFile = activeArtworkSide === 'back'
    ? (useFrontArtworkForBack ? artworkImage : artworkBackImage)
    : artworkImage;
  const activeUrl = activeArtworkSide === 'back'
    ? (useFrontArtworkForBack ? artworkImageUrl : artworkBackImageUrl)
    : artworkImageUrl;
  const hasArtwork = Boolean(activeFile && activeUrl);
  const referenceCount = referenceImages.length;

  if (referencePickerMeta) {
    referencePickerMeta.textContent = referenceCount
      ? `แนบแล้ว ${referenceCount}/${MAX_REFERENCE_IMAGES} ภาพ`
      : `เพิ่มได้สูงสุด ${MAX_REFERENCE_IMAGES} ภาพ`;
  }

  if (hasArtwork) {
    current.hidden = false;
    thumbnail.src = activeUrl;
    name.textContent = `${activeArtworkSide === 'back' ? 'ด้านหลัง' : 'ด้านหน้า'} • ${activeFile.name}`;
    const rotation = getArtworkRotation(activeArtworkSide);
    meta.textContent = `${artworkFileSize(activeFile.size)} • มุม ${rotation}° • ใช้ชั่วคราวและล้างเมื่อส่งบรีฟ`;
    applyArtworkRotation(thumbnail, activeArtworkSide, 1, 1);
  } else {
    current.hidden = true;
    thumbnail.removeAttribute('src');
  }

  renderArtworkSummaries();
  renderReferences();
  if (hasArtwork || referenceCount) {
    const artworkLabel = hasArtwork ? 'ภาพงานหลัก' : '';
    const refLabel = referenceCount ? `Ref ${referenceCount} ภาพ` : '';
    setAssetStatus(`พร้อมใช้${[artworkLabel, refLabel].filter(Boolean).join(' และ ')}ใน Preview/ภาพสรุปบรีฟ`);
  } else {
    setAssetStatus('ยังไม่ได้เลือกภาพงานหรือ Ref สำหรับบรีฟ');
  }
  syncArtworkSideControls();
}

function setArtworkImage(file, side = activeArtworkSide) {
  const error = artworkFileMessage(file);
  if (error) {
    setAssetStatus(error, 'warn');
    return false;
  }
  if (side === 'back') {
    if (artworkBackImageUrl) URL.revokeObjectURL(artworkBackImageUrl);
    artworkBackImage = file;
    artworkBackImageUrl = URL.createObjectURL(file);
    artworkRotationBack = 0;
    useFrontArtworkForBack = false;
  } else {
    if (artworkImageUrl) URL.revokeObjectURL(artworkImageUrl);
    artworkImage = file;
    artworkImageUrl = URL.createObjectURL(file);
    artworkRotationFront = 0;
    if (useFrontArtworkForBack) artworkRotationBack = 0;
  }
  updateArtworkControls();
  calculate();
  return true;
}

function addReferenceImages(files) {
  const candidates = Array.from(files || []);
  const available = MAX_REFERENCE_IMAGES - referenceImages.length;
  if (!candidates.length) return false;
  if (available <= 0) {
    setAssetStatus(`แนบ Ref ได้สูงสุด ${MAX_REFERENCE_IMAGES} ภาพ`, 'warn');
    return false;
  }

  const accepted = [];
  let error = '';
  candidates.slice(0, available).forEach(file => {
    const validation = artworkFileMessage(file);
    if (validation) {
      error = validation;
      return;
    }
    accepted.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      url: URL.createObjectURL(file)
    });
  });
  referenceImages.push(...accepted);
  updateArtworkControls();
  if (candidates.length > available) {
    setAssetStatus(`เพิ่ม Ref แล้ว ${accepted.length} ภาพ • แนบได้สูงสุด ${MAX_REFERENCE_IMAGES} ภาพ`, 'warn');
  } else if (error) {
    setAssetStatus(error, 'warn');
  }
  return accepted.length > 0;
}

function removeReferenceImage(id) {
  const reference = referenceImages.find(item => item.id === id);
  if (reference?.url) URL.revokeObjectURL(reference.url);
  referenceImages = referenceImages.filter(item => item.id !== id);
  updateArtworkControls();
}

function hasTemporaryArtwork() {
  return Boolean(artworkImage || artworkBackImage);
}

function hasTemporaryImages() {
  return hasTemporaryArtwork() || referenceImages.length > 0;
}

function refreshActiveArtworkReview() {
  const reviewView = document.querySelector('[data-app-view="review"].is-active');
  if (reviewView && typeof renderBriefReview === 'function') renderBriefReview({ skipValidation: true });
}

function clearArtworkImage() {
  if (activeArtworkSide === 'back') {
    if (artworkBackImageUrl) URL.revokeObjectURL(artworkBackImageUrl);
    artworkBackImage = null;
    artworkBackImageUrl = '';
    artworkRotationBack = 0;
    useFrontArtworkForBack = false;
  } else {
    if (artworkImageUrl) URL.revokeObjectURL(artworkImageUrl);
    artworkImage = null;
    artworkImageUrl = '';
    artworkRotationFront = 0;
    useFrontArtworkForBack = false;
  }
  $('artworkImage').value = '';
  updateArtworkControls();
  calculate();
  refreshActiveArtworkReview();
}

function clearTemporaryImages() {
  if (artworkImageUrl) URL.revokeObjectURL(artworkImageUrl);
  if (artworkBackImageUrl) URL.revokeObjectURL(artworkBackImageUrl);
  referenceImages.forEach(reference => URL.revokeObjectURL(reference.url));
  artworkImage = null;
  artworkImageUrl = '';
  artworkBackImage = null;
  artworkBackImageUrl = '';
  activeArtworkSide = 'front';
  useFrontArtworkForBack = false;
  artworkRotationFront = 0;
  artworkRotationBack = 0;
  referenceImages = [];
  $('artworkImage').value = '';
  $('referenceImages').value = '';
  if (typeof clearDiecutShape === 'function') clearDiecutShape();
  updateArtworkControls();
  calculate();
}

function getArtworkPreviewUrl(side = activeArtworkSide) {
  if (side === 'back') return useFrontArtworkForBack ? artworkImageUrl : artworkBackImageUrl;
  return artworkImageUrl;
}

function getArtworkSideState() {
  return {
    activeSide: activeArtworkSide,
    hasFront: Boolean(artworkImage && artworkImageUrl),
    hasBack: Boolean((artworkBackImage && artworkBackImageUrl) || (useFrontArtworkForBack && artworkImageUrl)),
    useFrontForBack: useFrontArtworkForBack,
    frontRotation: getArtworkRotation('front'),
    backRotation: getArtworkRotation('back')
  };
}

function rotateArtworkImage(side = activeArtworkSide) {
  const targetSide = side === 'back' ? 'back' : 'front';
  if (!getArtworkPreviewUrl(targetSide)) return false;
  if (targetSide === 'back') artworkRotationBack = normalizeArtworkRotation(artworkRotationBack + 90);
  else artworkRotationFront = normalizeArtworkRotation(artworkRotationFront + 90);
  updateArtworkControls();
  calculate();
  refreshActiveArtworkReview();
  return true;
}

function setActiveArtworkSide(side) {
  const nextSide = side === 'back' ? 'back' : 'front';
  if (activeArtworkSide === nextSide) {
    syncArtworkSideControls();
    return;
  }
  activeArtworkSide = nextSide;
  updateArtworkControls();
  calculate();
}

function setUseFrontArtworkForBack(enabled) {
  const nextValue = Boolean(enabled);
  if (nextValue && !useFrontArtworkForBack) artworkRotationBack = artworkRotationFront;
  useFrontArtworkForBack = nextValue;
  updateArtworkControls();
  calculate();
}

function syncArtworkSideControls() {
  const controls = $('artworkSideControls');
  if (!controls) return;
  const doubleSided = typeof getSelectedPrintSide === 'function' && getSelectedPrintSide() === 'double';
  controls.hidden = !doubleSided;
  if (!doubleSided && activeArtworkSide === 'back') {
    activeArtworkSide = 'front';
    updateArtworkControls();
    return;
  }
  controls.querySelectorAll('[data-artwork-side]').forEach(button => {
    const selected = button.dataset.artworkSide === activeArtworkSide;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  const sameInput = $('useFrontArtworkForBack');
  if (sameInput) sameInput.checked = useFrontArtworkForBack;
  const uploadLabel = $('activeArtworkUploadLabel');
  if (uploadLabel) uploadLabel.textContent = activeArtworkSide === 'back' ? 'อัปโหลดภาพด้านหลัง' : 'เปลี่ยนภาพด้านหน้า';
  const sideStatus = $('artworkSideStatus');
  if (sideStatus) {
    const state = getArtworkSideState();
    sideStatus.textContent = `หน้า ${state.hasFront ? `พร้อม (${state.frontRotation}°)` : 'ยังไม่มีภาพ'} • หลัง ${state.hasBack ? `พร้อม (${state.backRotation}°)` : 'ยังไม่มีภาพ'}`;
  }
}

function createBriefImageDataUrl(file, maximum = 520, rotation = 0) {
  if (!file) return Promise.resolve('');
  const sourceUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width || 1;
      const height = image.naturalHeight || image.height || 1;
      const angle = normalizeArtworkRotation(rotation);
      const swapsSides = angle % 180 !== 0;
      const rotatedWidth = swapsSides ? height : width;
      const rotatedHeight = swapsSides ? width : height;
      const scale = Math.min(1, maximum / Math.max(rotatedWidth, rotatedHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(rotatedWidth * scale));
      canvas.height = Math.max(1, Math.round(rotatedHeight * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(angle * Math.PI / 180);
      context.drawImage(image, -width * scale / 2, -height * scale / 2, width * scale, height * scale);
      context.restore();
      URL.revokeObjectURL(sourceUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error('อ่านไฟล์ภาพสำหรับบรีฟไม่สำเร็จ'));
    };
    image.src = sourceUrl;
  });
}

function getArtworkPreviewDataUrl() {
  return createBriefImageDataUrl(artworkImage, 520, getArtworkRotation('front'));
}

async function getArtworkPreviewDataUrls() {
  const front = await createBriefImageDataUrl(artworkImage, 520, getArtworkRotation('front'));
  const backFile = useFrontArtworkForBack ? artworkImage : artworkBackImage;
  const back = await createBriefImageDataUrl(backFile, 520, getArtworkRotation('back'));
  return { front, back };
}

function getBriefReferenceDataUrls() {
  return Promise.all(referenceImages.map(reference => createBriefImageDataUrl(reference.file, 300)));
}

function bindPreviewArtworkDrop() {
  const zone = $('previewDropZone');
  if (!zone || zone.dataset.dropBound) return;
  zone.dataset.dropBound = 'true';
  let leaveTimer = null;

  const filesFrom = event => Array.from(event.dataTransfer?.files || []);
  const hasFiles = event => filesFrom(event).length > 0;
  const clearDragState = () => {
    clearTimeout(leaveTimer);
    zone.classList.remove('is-drag-over');
  };

  zone.addEventListener('dragenter', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    clearTimeout(leaveTimer);
    zone.classList.add('is-drag-over');
  });
  zone.addEventListener('dragover', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    clearTimeout(leaveTimer);
    zone.classList.add('is-drag-over');
  });
  zone.addEventListener('dragleave', event => {
    if (!hasFiles(event)) return;
    leaveTimer = setTimeout(clearDragState, 40);
  });
  zone.addEventListener('drop', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    clearDragState();
    const files = filesFrom(event);
    const image = files.find(file => SUPPORTED_IMAGE_TYPES.has(file.type)) || files[0];
    if (!setArtworkImage(image)) return;
    setAssetStatus('วางภาพงานใน Preview แล้ว • ใช้ชั่วคราวและล้างเมื่อส่งบรีฟ');
  });

  zone.addEventListener('dblclick', () => {
    $('artworkImage')?.click();
  });
}

function bindArtwork() {
  $('artworkImage').addEventListener('change', event => {
    const [file] = Array.from(event.target.files || []);
    setArtworkImage(file);
    event.target.value = '';
  });
  $('referenceImages').addEventListener('change', event => {
    addReferenceImages(event.target.files);
    event.target.value = '';
  });
  $('clearArtworkImage').addEventListener('click', clearArtworkImage);
  $('rotateArtworkImage')?.addEventListener('click', () => rotateArtworkImage(activeArtworkSide));
  $('artworkSideControls')?.addEventListener('click', event => {
    const button = event.target.closest('[data-artwork-side]');
    if (button) setActiveArtworkSide(button.dataset.artworkSide);
  });
  $('useFrontArtworkForBack')?.addEventListener('change', event => setUseFrontArtworkForBack(event.target.checked));
  bindPreviewArtworkDrop();
  updateArtworkControls();
}

window.renderArtworkSummaries = renderArtworkSummaries;
