'use strict';
  const IPRINT_TEST_MODE=new URLSearchParams(window.location.search).get('testMode')==='1';
  const IPRINT_RESET_TEST_DATA=IPRINT_TEST_MODE&&new URLSearchParams(window.location.search).get('resetTest')==='1';
  const API_ROOT='https://iprint-flow-api.iprint-garphic1.workers.dev';
  const API= {
    presets:API_ROOT+'/presets',materials:API_ROOT+'/materials',services:API_ROOT+'/services',quotes:API_ROOT+'/quotes',tickets:API_ROOT+'/tickets',orders:API_ROOT+'/orders',orderItems:API_ROOT+'/order-items',customers: API_ROOT + '/customers',authCheck:API_ROOT+'/auth/check',
  }
  ;
  const BLEED_MM=3;
  const KEY=IPRINT_TEST_MODE?'iprint_test_calculator_v1':'iprint_calculator_v16';
  const CACHE= {
    presets:IPRINT_TEST_MODE?'iprint_test_cache_presets_v1':'iprint_cache_presets_v1',
    materials:IPRINT_TEST_MODE?'iprint_test_cache_materials_v1':'iprint_cache_materials_v1',
    services:IPRINT_TEST_MODE?'iprint_test_cache_services_v1':'iprint_cache_services_v1'
  }
  ;
  /* Static HTML cannot keep a write key secret. Leave blank unless you accept that the key is visible to browser users.
  Preferred production setup: secure POST/DELETE at the Worker using Cloudflare Access or another authenticated backend. */
  const WRITE_API_KEY_STORAGE = 'iprint_write_api_key';

  // Shared application state. These values intentionally remain mutable because
  // the existing feature modules communicate through the global script scope.
  let presets = {};
  let materials = [];
  let services = [];
  let customers = [];
  let selectedSheet = '';
  let selectedMaterialId = '';
  let selectedServiceIds = {};
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
    return normalizeWriteApiKey(localStorage.getItem(WRITE_API_KEY_STORAGE) || '');
  } catch (error) {
    return normalizeWriteApiKey(window.IPRINT_WRITE_API_KEY || '');
  }
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
    const response = await fetch(API.authCheck, {
      method: 'GET',
      headers: { 'X-API-Key': key }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new Error(response.status === 401
        ? 'คีย์ไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่'
        : String(data.error || 'ไม่สามารถตรวจสอบคีย์ได้'));
    }

    try {
      localStorage.setItem(WRITE_API_KEY_STORAGE, key);
    } catch (error) {
      window.IPRINT_WRITE_API_KEY = key;
    }

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
  try {
    localStorage.removeItem(WRITE_API_KEY_STORAGE);
  } catch (error) {
    // Fall through to the in-memory value for restricted browser contexts.
  }
  window.IPRINT_WRITE_API_KEY = '';
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
        selectedSheet,selectedMaterialId,selectedServiceIds
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
    } catch(e) {
    }
  }

function setCachedStatus(id,label,age) {
    const days=Math.max(0,Math.floor((Date.now()-age)/86400000));
    const element=$(id);
    if(!element)return;
    element.textContent=label+' • ข้อมูลอาจไม่ล่าสุด (ออฟไลน์)'+(days?' • '+days+' วัน':'')
  }
