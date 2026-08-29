'use strict';
  const API_ROOT='https://iprint-preset-api.iprint-garphic1.workers.dev';
  const API= {
    presets:API_ROOT+'/presets',materials:API_ROOT+'/materials',services:API_ROOT+'/services',quotes:API_ROOT+'/quotes',tickets:API_ROOT+'/tickets',customers: API_ROOT + '/customers',
  }
  ;
  const BLEED_MM=3;
  const KEY='iprint_calculator_v16';
  const CACHE= {
    presets:'iprint_cache_presets_v1',materials:'iprint_cache_materials_v1',services:'iprint_cache_services_v1'
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
  // The preview image stays in memory only and is cleared after creating a brief.
  let artworkImage = null;
  let artworkImageUrl = '';
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
  const key = 'lastQuoteSeq:' + day;
  const next = Number(localStorage.getItem(key) || 0) + 1;

  localStorage.setItem(key, String(next));
  return 'QT-' + day + '-' + String(next).padStart(3, '0');
}

function getWriteApiKey() {
  const input = document.getElementById('apiKeyInput');
  const fromInput = input ? input.value.trim() : '';

  if (fromInput) {
    return fromInput;
  }

  try {
    return localStorage.getItem(WRITE_API_KEY_STORAGE) || '';
  } catch (error) {
    return window.IPRINT_WRITE_API_KEY || '';
  }
}

function updateApiKeyStatus() {
  const status = document.getElementById('apiKeyStatus');
  if (!status) return;

  const key = getWriteApiKey();
  status.textContent = key
    ? `ตั้งค่าแล้ว (${key.length} ตัวอักษร)`
    : 'ยังไม่ได้ตั้งค่า';
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
    $(id).textContent=label+' • ข้อมูลอาจไม่ล่าสุด (ออฟไลน์)'+(days?' • '+days+' วัน':'')
  }
