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
    meta.textContent = `${artworkFileSize(activeFile.size)} • ใช้ชั่วคราวและล้างเมื่อส่งบรีฟ`;
  } else {
    current.hidden = true;
    thumbnail.removeAttribute('src');
  }

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
    useFrontArtworkForBack = false;
  } else {
    if (artworkImageUrl) URL.revokeObjectURL(artworkImageUrl);
    artworkImage = file;
    artworkImageUrl = URL.createObjectURL(file);
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

function clearArtworkImage() {
  if (activeArtworkSide === 'back') {
    if (artworkBackImageUrl) URL.revokeObjectURL(artworkBackImageUrl);
    artworkBackImage = null;
    artworkBackImageUrl = '';
    useFrontArtworkForBack = false;
  } else {
    if (artworkImageUrl) URL.revokeObjectURL(artworkImageUrl);
    artworkImage = null;
    artworkImageUrl = '';
    useFrontArtworkForBack = false;
  }
  $('artworkImage').value = '';
  updateArtworkControls();
  calculate();
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
  referenceImages = [];
  $('artworkImage').value = '';
  $('referenceImages').value = '';
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
    useFrontForBack: useFrontArtworkForBack
  };
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
  useFrontArtworkForBack = Boolean(enabled);
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
    sideStatus.textContent = `หน้า ${state.hasFront ? 'พร้อม' : 'ยังไม่มีภาพ'} • หลัง ${state.hasBack ? 'พร้อม' : 'ยังไม่มีภาพ'}`;
  }
}

function createBriefImageDataUrl(file, maximum = 520) {
  if (!file) return Promise.resolve('');
  const sourceUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width || 1;
      const height = image.naturalHeight || image.height || 1;
      const scale = Math.min(1, maximum / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
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
  return createBriefImageDataUrl(artworkImage, 520);
}

async function getArtworkPreviewDataUrls() {
  const front = await createBriefImageDataUrl(artworkImage, 520);
  const back = useFrontArtworkForBack
    ? front
    : await createBriefImageDataUrl(artworkBackImage, 520);
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
  $('artworkSideControls')?.addEventListener('click', event => {
    const button = event.target.closest('[data-artwork-side]');
    if (button) setActiveArtworkSide(button.dataset.artworkSide);
  });
  $('useFrontArtworkForBack')?.addEventListener('change', event => setUseFrontArtworkForBack(event.target.checked));
  bindPreviewArtworkDrop();
  updateArtworkControls();
}
