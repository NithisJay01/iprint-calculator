'use strict';
  const API_ROOT='https://iprint-preset-api.iprint-garphic1.workers.dev';
  const API= {
    presets:API_ROOT+'/presets',materials:API_ROOT+'/materials',services:API_ROOT+'/services',quotes:API_ROOT+'/quotes',customers: API_ROOT + '/customers',
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
