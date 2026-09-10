'use strict';
  const IPRINT_TEST_MODE=new URLSearchParams(window.location.search).get('testMode')==='1';
  const IPRINT_RESET_TEST_DATA=IPRINT_TEST_MODE&&new URLSearchParams(window.location.search).get('resetTest')==='1';
  const IPRINT_CONFIG=window.IPRINT_CONFIG||{};
  const API_ROOT=String(IPRINT_CONFIG.apiRoot||'https://iprint-flow-api.iprint-garphic1.workers.dev').replace(/\/$/,'');
  const API= {
    presets:API_ROOT+'/presets',flowSettings:API_ROOT+'/flow-settings',materials:API_ROOT+'/materials',services:API_ROOT+'/services',quotes:API_ROOT+'/quotes',tickets:API_ROOT+'/tickets',orders:API_ROOT+'/orders',publicOrders:API_ROOT+'/public/orders',publicCapacity:API_ROOT+'/public/capacity',orderItems:API_ROOT+'/order-items',customers: API_ROOT + '/customers',authCheck:API_ROOT+'/auth/check',staffMaterials:API_ROOT+'/staff/materials',staffServices:API_ROOT+'/staff/services',staffFlowSettings:API_ROOT+'/staff/flow-settings',staffCapacity:API_ROOT+'/staff/capacity',staffQueue:API_ROOT+'/staff/queue',staffOrders:API_ROOT+'/staff/orders',
  }
  ;
  const BLEED_MM=3;
  const KEY=IPRINT_TEST_MODE?'iprint_test_calculator_v1':'iprint_calculator_v16';
  const CACHE= {
    presets:IPRINT_TEST_MODE?'iprint_test_cache_presets_v1':'iprint_cache_presets_v1',
    materials:IPRINT_TEST_MODE?'iprint_test_cache_materials_v1':'iprint_cache_materials_v1',
    services:IPRINT_TEST_MODE?'iprint_test_cache_services_v1':'iprint_cache_services_v1',
    flowSettings:IPRINT_TEST_MODE?'iprint_test_flow_settings_v1':'iprint_flow_settings_v1'
  }
  ;
  /* Static HTML cannot keep a write key secret. Leave blank unless you accept that the key is visible to browser users.
  Preferred production setup: secure POST/DELETE at the Worker using Cloudflare Access or another authenticated backend. */
  const WRITE_API_KEY_STORAGE = 'iprint_write_api_key';
  const WRITE_API_KEY_SESSION_STORAGE = 'iprint_write_api_key_session';

  // Shared application state. These values intentionally remain mutable because
  // the existing feature modules communicate through the global script scope.
  let presets = {};
  let materials = [];
  let services = [];
  let flowSettings = null;
  let customers = [];
  let selectedSheet = '';
  let selectedMaterialId = '';
  let selectedServiceIds = {};
  let customServiceRequest = '';
  let lastCalc = null;
  let currentQuoteMeta = null;
  let cartItems = [];
  let editingCartItemId = '';
  let currentWorkflowOrder = null;
  // The preview image stays in memory only and is cleared after creating a brief.
  let artworkImage = null;
  let artworkImageUrl = '';
  let artworkBackImage = null;
  let artworkBackImageUrl = '';
  let activeArtworkSide = 'front';
  let useFrontArtworkForBack = false;
  let artworkRotationFront = 0;
  let artworkRotationBack = 0;
  let referenceImages = [];
  let diecutShapeFile = null;
  let diecutShapeUrl = '';

  const $ = id => document.getElementById(id);
  const money = value => Number(value || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const unit = value => {
    const normalized = String(value || '').toLowerCase();

    return normalized === 'sheet' || normalized === 'sheets'
      ? 'แผ่น'
      : normalized === 'piece' || normalized === 'pieces'
        ? 'ชิ้น'
        : normalized === 'job'
          ? 'งาน'
          : value || 'หน่วย';
  };

  const writeHeaders = () => {
    const apiKey = getWriteApiKey();

    return apiKey
      ? { 'Content-Type': 'application/json', 'X-API-Key': apiKey }
      : { 'Content-Type': 'application/json' };
  };

function localDateKey() {
  const date = new Date();

  return date.getFullYear() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
}

function quoteSeq() {
  const day = localDateKey();
  const key = (IPRINT_TEST_MODE ? 'testQuoteSeq:' : 'lastQuoteSeq:') + day;
  const next = Number(localStorage.getItem(key) || 0) + 1;

  localStorage.setItem(key, String(next));
  return 'QT-' + day + '-' + String(next).padStart(3, '0');
}

function getWriteApiKey() {
  if (IPRINT_TEST_MODE) return 'IPRINT-LOCAL-TEST-MODE';
  const input = document.getElementById('apiKeyInput');
  const fromInput = input ? normalizeWriteApiKey(input.value) : '';

  if (fromInput) {
    return fromInput;
  }

  try {
    return normalizeWriteApiKey(
      sessionStorage.getItem(WRITE_API_KEY_SESSION_STORAGE) ||
      localStorage.getItem(WRITE_API_KEY_STORAGE) || ''
    );
  } catch (error) {
    return normalizeWriteApiKey(window.IPRINT_WRITE_API_KEY || '');
  }
}

function storeWriteApiKey(key, remember = true) {
  const normalized = normalizeWriteApiKey(key);
  if (!normalized) return;

  if (remember) {
    localStorage.setItem(WRITE_API_KEY_STORAGE, normalized);
    sessionStorage.removeItem(WRITE_API_KEY_SESSION_STORAGE);
  } else {
    sessionStorage.setItem(WRITE_API_KEY_SESSION_STORAGE, normalized);
    localStorage.removeItem(WRITE_API_KEY_STORAGE);
  }
}

function removeWriteApiKey() {
  try { localStorage.removeItem(WRITE_API_KEY_STORAGE); } catch (error) {}
  try { sessionStorage.removeItem(WRITE_API_KEY_SESSION_STORAGE); } catch (error) {}
  window.IPRINT_WRITE_API_KEY = '';
}

async function verifyWriteApiKey(key) {
  const response = await fetch(API.authCheck, {
    method: 'GET',
    headers: { 'X-API-Key': normalizeWriteApiKey(key) }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    throw new Error(response.status === 401
      ? 'รหัสเข้าใช้งานไม่ถูกต้อง'
      : String(data.error || 'ไม่สามารถเชื่อมต่อระบบได้'));
  }

  return true;
}

function normalizeWriteApiKey(value) {
  return String(value || '')
    .trim()
    .replace(/^WRITE_API_KEY\s*=\s*/i, '')
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim();
}

function updateApiKeyStatus() {
  const status = document.getElementById('apiKeyStatus');
  if (!status) return;

  const key = getWriteApiKey();
  status.className = 'api-key-state' + (key ? ' ok' : ' warn');
  status.textContent = IPRINT_TEST_MODE
    ? 'Test Mode • Mock data เท่านั้น'
    : key
    ? 'พร้อมใช้งาน • มีคีย์บันทึกอยู่ในเบราว์เซอร์นี้'
    : 'ยังไม่ได้ตั้งค่า WRITE_API_KEY';
}

function setApiKeyStatus(message, kind = '') {
  const status = document.getElementById('apiKeyStatus');
  if (!status) return;
  status.textContent = message;
  status.className = 'api-key-state' + (kind ? ' ' + kind : '');
}

async function saveWriteApiKey() {
  const input = $('apiKeyInput');
  const button = $('saveApiKey');
  const key = normalizeWriteApiKey(input?.value || '');

  if (IPRINT_TEST_MODE) {
    setApiKeyStatus('Test Mode ใช้ Mock key อัตโนมัติ ไม่ต้องบันทึกคีย์จริง', 'ok');
    return;
  }

  if (!key) {
    setApiKeyStatus('กรุณาวาง WRITE_API_KEY ก่อนบันทึก', 'warn');
    input?.focus();
    return;
  }

  button.disabled = true;
  button.textContent = 'กำลังตรวจสอบ…';
  setApiKeyStatus('กำลังตรวจสอบคีย์กับ iPrint Flow API…');

  try {
    await verifyWriteApiKey(key);
    storeWriteApiKey(key, true);

    input.value = '';
    setApiKeyStatus('เชื่อมต่อสำเร็จ • บันทึกคีย์ในเบราว์เซอร์นี้แล้ว', 'ok');
  } catch (error) {
    setApiKeyStatus(error?.message || 'เชื่อมต่อ API ไม่สำเร็จ', 'warn');
  } finally {
    button.disabled = false;
    button.textContent = 'ตรวจสอบและบันทึก';
  }
}

function clearWriteApiKey() {
  removeWriteApiKey();
  const input = $('apiKeyInput');
  if (input) input.value = '';
  setApiKeyStatus('ลบคีย์ออกจากเบราว์เซอร์นี้แล้ว', 'warn');
}

function openApiSettings() {
  const input = $('apiKeyInput');
  if (input) {
    input.value = '';
    input.type = 'password';
  }
  const toggle = $('toggleApiKeyVisibility');
  if (toggle) {
    toggle.textContent = 'แสดง';
    toggle.setAttribute('aria-label', 'แสดงคีย์');
    toggle.setAttribute('aria-pressed', 'false');
  }
  updateApiKeyStatus();
  openSide('apiSettingsSheet');
  setTimeout(() => input?.focus(), 260);
}

function toggleApiKeyVisibility() {
  const input = $('apiKeyInput');
  const button = $('toggleApiKeyVisibility');
  if (!input || !button) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.textContent = show ? 'ซ่อน' : 'แสดง';
  button.setAttribute('aria-label', show ? 'ซ่อนคีย์' : 'แสดงคีย์');
  button.setAttribute('aria-pressed', String(show));
}

function dataSourceLabel() {
  return IPRINT_TEST_MODE ? 'Test Mode' : 'Notion';
}

function setStatus(id,text,kind) {
    const el=$(id);
    if(!el)return;
    el.textContent=text;
    el.className='status'+(kind?' '+kind:'')
  }

let uiChangeToastTimer = 0;

function announceUiChange(message, target, options = {}) {
  const toast = $('uiChangeToast');
  if (toast && message) {
    clearTimeout(uiChangeToastTimer);
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    uiChangeToastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => { toast.hidden = true; }, 180);
    }, 2800);
  }
  if (!target || options.scroll === false) return;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    window.setTimeout(() => {
      target.focus({ preventScroll: true });
      target.classList.add('is-ui-change-focus');
      window.setTimeout(() => target.classList.remove('is-ui-change-focus'), 1400);
    }, reducedMotion ? 0 : 320);
  });
}

window.announceUiChange = announceUiChange;

function syncPieceMarginLine(piece, widthMm, heightMm) {
  if (!piece) return null;
  let line = piece.querySelector('.bleed');
  if (!line) {
    line = document.createElement('div');
    line.className = 'bleed';
    piece.appendChild(line);
  }
  const calculatedMargin = Number(lastCalc?.bleed);
  const marginMm = Math.max(0, Number.isFinite(calculatedMargin) ? calculatedMargin : (typeof previewBleed === 'function' ? previewBleed() : 3));
  const safeWidth = Math.max(.01, Number(widthMm) || 1);
  const safeHeight = Math.max(.01, Number(heightMm) || 1);
  const horizontalInset = Math.min(49, marginMm / safeWidth * 100);
  const verticalInset = Math.min(49, marginMm / safeHeight * 100);
  line.style.left = `${horizontalInset}%`;
  line.style.right = `${horizontalInset}%`;
  line.style.top = `${verticalInset}%`;
  line.style.bottom = `${verticalInset}%`;
  line.setAttribute('aria-hidden', 'true');
  line.title = `เส้นตัด • ตัดตก ${marginMm.toLocaleString('th-TH', { maximumFractionDigits: 1 })} mm`;
  let safeLine = piece.querySelector('.safe-zone');
  if (!safeLine) {
    safeLine = document.createElement('div');
    safeLine.className = 'safe-zone';
    piece.appendChild(safeLine);
  }
  const safeHorizontalInset = Math.min(49, marginMm * 2 / safeWidth * 100);
  const safeVerticalInset = Math.min(49, marginMm * 2 / safeHeight * 100);
  safeLine.style.left = `${safeHorizontalInset}%`;
  safeLine.style.right = `${safeHorizontalInset}%`;
  safeLine.style.top = `${safeVerticalInset}%`;
  safeLine.style.bottom = `${safeVerticalInset}%`;
  safeLine.setAttribute('aria-hidden', 'true');
  safeLine.title = `พื้นที่ปลอดภัย • เข้าในเส้นตัด ${marginMm.toLocaleString('th-TH', { maximumFractionDigits: 1 })} mm`;
  return line;
}

window.syncPieceMarginLine = syncPieceMarginLine;

function syncPieceBleedArtwork(piece, widthMm, heightMm) {
  if (!piece) return;
  piece.querySelectorAll('.piece-artwork-trim').forEach(node => node.remove());
  const artwork = piece.querySelector('.piece-artwork');
  if (!artwork) return;
  const bleedMm = Math.max(0, Number(lastCalc?.bleed) || 3);
  const width = Math.max(.01, Number(widthMm) || 1);
  const height = Math.max(.01, Number(heightMm) || 1);
  piece.style.setProperty('--trim-inset-x', `${Math.min(49, bleedMm / width * 100)}%`);
  piece.style.setProperty('--trim-inset-y', `${Math.min(49, bleedMm / height * 100)}%`);
  const trimArtwork = artwork.cloneNode(true);
  trimArtwork.classList.add('piece-artwork-trim');
  trimArtwork.setAttribute('aria-hidden', 'true');
  artwork.after(trimArtwork);
}

window.syncPieceBleedArtwork = syncPieceBleedArtwork;

function isValidProjectUrl(value, httpsOnly = false) {
  try {
    const protocol = new URL(String(value || '').trim()).protocol;
    return httpsOnly ? protocol === 'https:' : ['http:', 'https:'].includes(protocol);
  } catch {
    return false;
  }
}

function syncUrlValidationFeedback(input, showInvalid = false) {
  if (!input) return false;
  const value = input.value.trim();
  const valid = Boolean(value) && isValidProjectUrl(value, input.id === 'staffCatalogImageUrl');
  input.classList.toggle('is-valid', valid);
  if (valid) input.classList.remove('is-invalid');
  else if (showInvalid && value) input.classList.add('is-invalid');
  else input.classList.remove('is-valid');
  let status = input.parentElement?.querySelector(`[data-url-validation-for="${input.id}"]`);
  if (!status && input.parentElement) {
    status = document.createElement('small');
    status.className = 'url-validation-status';
    status.dataset.urlValidationFor = input.id;
    input.insertAdjacentElement('afterend', status);
  }
  if (status) {
    status.classList.toggle('is-valid', valid);
    status.classList.toggle('is-invalid', Boolean(showInvalid && value && !valid));
    status.textContent = valid ? '✓ ลิงก์ถูกต้อง' : showInvalid && value ? 'กรุณาตรวจสอบรูปแบบลิงก์' : '';
  }
  return valid;
}

function bindUrlValidationFeedback() {
  document.querySelectorAll('input[type="url"]').forEach(input => {
    if (input.dataset.urlValidationBound) return;
    input.dataset.urlValidationBound = 'true';
    input.addEventListener('input', () => syncUrlValidationFeedback(input));
    input.addEventListener('change', () => syncUrlValidationFeedback(input, true));
    input.addEventListener('blur', () => syncUrlValidationFeedback(input, true));
    syncUrlValidationFeedback(input);
  });
}

window.isValidProjectUrl = isValidProjectUrl;
window.syncUrlValidationFeedback = syncUrlValidationFeedback;
window.bindUrlValidationFeedback = bindUrlValidationFeedback;

function cachePut(key,data) {
    try {
      localStorage.setItem(key,JSON.stringify( {
        timestamp:Date.now(),data
      }
      ))
    } catch(e) {
    }
  }

function cacheGet(key) {
    try {
      const x=JSON.parse(localStorage.getItem(key)||'null');
      return x&&x.data?x:null
    } catch(e) {
      return null
    }
  }

function saveState() {
    try {
      localStorage.setItem(KEY,JSON.stringify( {
        selectedSheet,selectedMaterialId,selectedServiceIds,customServiceRequest
      }
      ))
    } catch(e) {
    }
  }

function loadState() {
    try {
      const s=JSON.parse(localStorage.getItem(KEY)||'{}');
      selectedSheet=s.selectedSheet||'';
      selectedMaterialId=s.selectedMaterialId||'';
      selectedServiceIds=s.selectedServiceIds|| {
      }
      customServiceRequest=String(s.customServiceRequest||'');
    } catch(e) {
    }
  }

function setCachedStatus(id,label,age) {
    const days=Math.max(0,Math.floor((Date.now()-age)/86400000));
    const element=$(id);
    if(!element)return;
    element.textContent=label+' • ข้อมูลอาจไม่ล่าสุด (ออฟไลน์)'+(days?' • '+days+' วัน':'')
  }
