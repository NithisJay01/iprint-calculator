(function() {
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

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('apiKeyInput');
  const saveButton = document.getElementById('saveApiKeyBtn');
  const clearButton = document.getElementById('clearApiKeyBtn');

  try {
    const savedKey = localStorage.getItem(WRITE_API_KEY_STORAGE);
    if (input && savedKey) {
      input.value = savedKey;
    }
  } catch (error) {
    // Ignore localStorage errors in restricted browser contexts.
  }

  saveButton?.addEventListener('click', () => {
    const key = input?.value.trim() || '';

    if (!key) {
      alert('กรุณาใส่ API Key ก่อน');
      return;
    }

    try {
      localStorage.setItem(WRITE_API_KEY_STORAGE, key);
    } catch (error) {
      console.warn('Cannot save API Key to localStorage:', error);
    }

    updateApiKeyStatus();
  });

  clearButton?.addEventListener('click', () => {
    if (input) input.value = '';

    try {
      localStorage.removeItem(WRITE_API_KEY_STORAGE);
    } catch (error) {
      // Ignore localStorage errors.
    }

    updateApiKeyStatus();
  });

  updateApiKeyStatus();
});


  let presets= {
  }
  ,
  materials=[],
  services=[],
  customers=[],
  selectedSheet='',
  selectedMaterialId='',
  selectedServiceIds= {
  }
  ;
  let lastCalc=null,currentQuoteMeta=null;
  const $=id=>document.getElementById(id);
  const money=n=>Number(n||0).toLocaleString('th-TH', {
    minimumFractionDigits:2,maximumFractionDigits:2
  }
  );
  const unit=u=> {
    const x=String(u||'').toLowerCase();
    return x==='sheet'||x==='sheets'?'แผ่น':x==='piece'||x==='pieces'?'ชิ้น':x==='job'?'งาน':u||'หน่วย'
  }
  ;
  const writeHeaders = () => {
    const headers = {
      'Content-Type': 'application/json'
    };

    const apiKey = getWriteApiKey();

    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    return headers;
  };
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
  async function getJSON(url) {
    const r=await fetch(url, {
      method:'GET',cache:'no-store'
    }
    );
    const t=await r.text();
    let d= {
    }
    ;
    try {
      d=JSON.parse(t)
    } catch(e) {
    }
    if(!r.ok)throw new Error(d.detail||d.error||('HTTP '+r.status));
    return d
  }
  function renderPresets() {
    const sel=$('sheet');
    sel.innerHTML='';
    const ids=Object.keys(presets);
    if(!ids.length) {
      sel.innerHTML='<option value="">ไม่พบ Preset</option>';
      return
    }
    ids.forEach(id=> {
      const p=presets[id],o=document.createElement('option');
      o.value=id;
      o.textContent=p.name+' ('+p.fullW+' × '+p.fullH+' cm)';
      sel.appendChild(o)
    }
    );
    if(!presets[selectedSheet])selectedSheet=ids[0];
    sel.value=selectedSheet
  }
  async function syncPresets() {
    try {
      const d=await getJSON(API.presets);
      const next= {
      }
      ;
      (d.presets||[]).forEach(p=> {
        if(p&&p.name&&p.active!==false&&p.fullW>0&&p.fullH>0&&p.usableW>0&&p.usableH>0)next[String(p.id)]= {
          ...p,pageId:p.id
        }
      }
      );
      presets=next;
      cachePut(CACHE.presets,presets);
      renderPresets();
      setStatus('syncStatus','Notion • '+Object.keys(presets).length+' Preset','ok');
      calculate()
    } catch(e) {
      const c=cacheGet(CACHE.presets);
      if(c) {
        presets=c.data;
        renderPresets();
        setCachedStatus('syncStatus','ใช้ Preset จาก Cache',c.timestamp);
        calculate()
      } else {
        presets= {
        }
        ;
        renderPresets();
        setStatus('syncStatus','เชื่อมต่อ Notion ไม่สำเร็จ • ไม่มี Cache','warn')
      }
      console.error('GET /presets',e)
    }
  }
  function renderMaterials() {
    const sel=$('materialSelect');
    sel.innerHTML='';
    const ph=document.createElement('option');
    ph.value='';
    ph.textContent='เลือกวัสดุ';
    sel.appendChild(ph);
    materials.forEach(m=> {
      const o=document.createElement('option');
      o.value=String(m.id);
      o.textContent=m.name+' • ฿'+money(m.price)+' / '+unit(m.unit);
      o.selected=String(m.id)===String(selectedMaterialId);
      sel.appendChild(o)
    }
    );
    if(selectedMaterialId)sel.value=selectedMaterialId;
    setStatus('materialStatus','Notion • '+materials.length+' วัสดุ','ok');
    const m=materials.find(x=>String(x.id)===String(selectedMaterialId));
    const s=$('selectedMaterialSummary');
    if(m) {
      s.hidden=false;
      s.textContent='เลือก: '+m.name+' • ฿'+money(m.price)+' / '+unit(m.unit)
    } else s.hidden=true
  }
  async function syncMaterials() {
    try {
      const d=await getJSON(API.materials);
      materials=(d.materials||[]).filter(m=>m&&m.name&&m.active!==false);
      cachePut(CACHE.materials,materials);
      renderMaterials()
    } catch(e) {
      const c=cacheGet(CACHE.materials);
      if(c) {
        materials=c.data;
        renderMaterials();
        setCachedStatus('materialStatus','Cache Materials',c.timestamp)
      } else {
        materials=[];
        renderMaterials();
        setStatus('materialStatus','เชื่อมต่อ Materials ไม่สำเร็จ','warn')
      }
      console.error('GET /materials',e)
    }
  }
  function renderServices() {
    const box=$('servicesContainer');
    box.innerHTML='';
    if(!services.length) {
      box.innerHTML='<div class="ms-status">ไม่พบบริการที่ Active</div>';
      return
    }
    const groups= {
    }
    ;
    services.forEach(s=>(groups[String(s.category||'Other')]??=[]).push(s));
    Object.keys(groups).forEach(cat=> {
      const g=document.createElement('div');
      g.className='service-group';
      const t=document.createElement('div');
      t.className='service-group-title';
      t.textContent=cat;
      g.appendChild(t);
      groups[cat].forEach(s=> {
        const row=document.createElement('label');
        row.className='service-row';
        const cb=document.createElement('input');
        cb.type='checkbox';
        cb.checked=!!selectedServiceIds[String(s.id)];
        cb.addEventListener('change',()=> {
          if(cb.checked)selectedServiceIds[String(s.id)]=true;
          else delete selectedServiceIds[String(s.id)];
          saveState();
          calculate()
        }
        );
        const main=document.createElement('div');
        main.className='service-main';
        const n=document.createElement('div');
        n.className='service-name';
        n.textContent=s.name;
        const meta=document.createElement('div');
        meta.className='service-meta';
        meta.textContent=(s.material?s.material+' • ':'')+'หน่วย '+unit(s.unit);
        main.append(n,meta);
        const pr=document.createElement('div');
        pr.className='service-price';
        pr.textContent='฿'+money(s.price);
        row.append(cb,main,pr);
        g.appendChild(row)
      }
      );
      box.appendChild(g)
    }
    );
    $('serviceStatus').textContent='Notion • '+services.length+' บริการ';
  }
  async function syncServices() {
    try {
      const d=await getJSON(API.services);
      services=(d.services||[])
      .filter(s=>s&&s.name&&s.active!==false)
      .sort((a,b)=>
      (Number(a.sortOrder)||9999)-
      (Number(b.sortOrder)||9999)
      );
      cachePut(CACHE.services,services);
      renderServices();
    } catch(e) {
      const c=cacheGet(CACHE.services);
      if(c) {
        services=c.data;
        renderServices();
        setCachedStatus(
        'serviceStatus',
        'Cache Services',
        c.timestamp
        );
      } else {
        services=[];
        renderServices();
        setStatus(
        'serviceStatus',
        'เชื่อมต่อ Services ไม่สำเร็จ',
        'warn'
        );
      }
      console.error('GET /services',e);
    }
  }
  async function syncCustomers() {
    const input = $('quoteCustomer');
    const list = $('quoteCustomerList');

    if (!input || !list) return;

    try {
      const data = await getJSON(API.customers);

      customers = Array.isArray(data.customers)
        ? data.customers
        : [];

      cachePut('iprint_cache_customers_v1', customers);
      renderCustomerOptions();

      setStatus(
        'customerStatus',
        'Notion • ' + customers.length + ' ลูกค้า',
        'ok'
      );
    } catch (error) {
      const cached = cacheGet('iprint_cache_customers_v1');

      if (cached) {
        customers = cached.data || [];
        renderCustomerOptions();

        setCachedStatus(
          'customerStatus',
          'ใช้ Customer จาก Cache',
          cached.timestamp
        );
      } else {
        customers = [];
        renderCustomerOptions();

        setStatus(
          'customerStatus',
          'ยังไม่มีข้อมูล Customer • พิมพ์ชื่อเพื่อสร้างใหม่',
          'warn'
        );
      }

      console.error('GET /customers', error);
    }
  }

  function renderCustomerOptions() {
    const list = $('quoteCustomerList');
    if (!list) return;

    list.innerHTML = '';

    customers
      .filter(customer => customer && customer.active !== false)
      .forEach(customer => {
        const option = document.createElement('option');

        option.value = String(customer.name || '');

        if (customer.company) {
          option.label = String(customer.company);
        }

        list.appendChild(option);
      });
  }

  function findCustomerByInput(value) {
    const keyword = String(value || '').trim().toLowerCase();

    if (!keyword) return null;

    return customers.find(customer => {
      const name = String(customer.name || '').trim().toLowerCase();
      const company = String(customer.company || '').trim().toLowerCase();
      const phone = String(customer.phone || '').trim().toLowerCase();

      return keyword === name || keyword === company || keyword === phone;
    }) || null;
  }

  function selectQuoteCustomer() {
    const input = $('quoteCustomer');
    const pageIdInput = $('quoteCustomerPageId');
    const value = input.value.trim();
    const customer = findCustomerByInput(value);

    if (!value) {
      pageIdInput.value = '';

      setStatus(
        'customerStatus',
        'เลือกลูกค้าเก่า หรือพิมพ์ชื่อเพื่อสร้างใหม่',
        ''
      );

      buildQuote();
      return;
    }

    if (customer) {
      pageIdInput.value = customer.id;

      if (customer.phone || customer.email) {
        $('quoteContact').value = customer.phone || customer.email || '';
      }

      if (customer.address) {
        $('quoteAddress').value = customer.address;
      }

      if ($('quoteTaxId')) {
        $('quoteTaxId').value = customer.taxId || '';
      }

      setStatus(
        'customerStatus',
        'ลูกค้าเดิม • ' + customer.name,
        'ok'
      );
    } else {
      pageIdInput.value = '';

      setStatus(
        'customerStatus',
        'ลูกค้าใหม่ • จะสร้าง Customer อัตโนมัติเมื่อบันทึกใบเสนอราคา',
        'warn'
      );
    }

    buildQuote();
  }

  function normalizeUnit(u) {
    const x=String(u||'').toLowerCase();
    return x==='sheet'||x==='sheets'||x==='แผ่น'?'sheet':x==='piece'||x==='pieces'||x==='ชิ้น'||x==='ดวง'?'piece':x==='job'||x==='งาน'?'job':x
  }
  function serviceCost(sheetCount,pieceCount) {
    let total=0;
    services.filter(s=>selectedServiceIds[String(s.id)]).forEach(s=> {
      const p=Number(s.price)||0,u=normalizeUnit(s.unit);
      total+=u==='sheet'?p*sheetCount:u==='piece'?p*pieceCount:p
    }
    );
    return total
  }
  function selectedMaterialCost(sheetCount,pieceCount) {
    const m=materials.find(x=>String(x.id)===String(selectedMaterialId));
    if(!m)return 0;
    const p=Number(m.price)||0,u=normalizeUnit(m.unit);
    return u==='sheet'?p*sheetCount:u==='piece'?p*pieceCount:p
  }
  function findBest(p,Wcm,Hcm) {
    const uw=Number(p.usableW)*10,uh=Number(p.usableH)*10;
    const W=Number(Wcm)*10,H=Number(Hcm)*10;
    let best=null;
    [[W,H,false],[H,W,true]].forEach(([pw,ph,rotate])=> {
      const nx=Math.floor(uw/pw),ny=Math.floor(uh/ph),n=nx*ny;
      if(n>0&&(!best||n>best.yield))best= {
        yield:n,nx,ny,pieceW:pw,pieceH:ph,rotate
      }
    }
    );
    return best
  }
  function resetPreview() {
    $('previewSheets').textContent='—';
    $('sheetPreview').innerHTML='';
    $('previewInfo').textContent='—';
    $('sheets').textContent='—';
    $('yield').textContent='—';
    $('total').textContent='—';
    $('sale').textContent='—';
    lastCalc=null
  }
  function drawPreview(p,b) {
    const el=$('sheetPreview');
    el.innerHTML='';
    const fw=Number(p.fullW)*10,fh=Number(p.fullH)*10,uw=Number(p.usableW)*10,uh=Number(p.usableH)*10;
    const available=Math.max(240,($('sheetPreview').parentElement.clientWidth||340)-4),scale=Math.min(1,Math.min(560,available)/fw);
    el.style.width=Math.max(1,fw*scale)+'px';
    el.style.height=Math.max(1,fh*scale)+'px';
    const usable=document.createElement('div');
    usable.className='preview-usable';
    usable.style.left=((fw-uw)/2*scale)+'px';
    usable.style.top=((fh-uh)/2*scale)+'px';
    usable.style.width=(uw*scale)+'px';
    usable.style.height=(uh*scale)+'px';
    const grid=document.createElement('div');
    grid.className='preview-grid';
    grid.style.left='0';
    grid.style.top='0';
    grid.style.gridTemplateColumns='repeat('+b.nx+','+(b.pieceW*scale)+'px)';
    grid.style.gridTemplateRows='repeat('+b.ny+','+(b.pieceH*scale)+'px)';
    for(let i=0;
    i<b.yield;
    i++) {
      const piece=document.createElement('div');
      piece.className='piece';
      piece.textContent=i+1;
      piece.style.width=(b.pieceW*scale)+'px';
      piece.style.height=(b.pieceH*scale)+'px';
      const bleed=document.createElement('div');
      bleed.className='bleed';
      const inset=BLEED_MM*scale;
      bleed.style.left=inset+'px';
      bleed.style.top=inset+'px';
      bleed.style.right=inset+'px';
      bleed.style.bottom=inset+'px';
      piece.appendChild(bleed);
      grid.appendChild(piece)
    }
    usable.appendChild(grid);
    el.appendChild(usable);
    $('previewInfo').textContent='กระดาษ '+Number(p.fullW).toFixed(2)+' × '+Number(p.fullH).toFixed(2)+' cm • พื้นที่ใช้งาน '+Number(p.usableW).toFixed(2)+' × '+Number(p.usableH).toFixed(2)+' cm • '+b.yield+' ดวง/แผ่น • Bleed '+BLEED_MM+' mm/ด้าน • '+(b.rotate?'หมุน 90°':'แนวปกติ')+' • Layout '+b.nx+' × '+b.ny
  }
  function calculate() {
    try {
      const p=presets[selectedSheet];
      if(!p) {
        resetPreview();
        return
      }
      const W=Number($('w').value),H=Number($('h').value),Q=parseInt($('qty').value,10),C=Number($('cost').value),P=Number($('profitPercent').value);
      if(!(W>0&&H>0&&Q>0&&C>=0&&P>=0)) {
        resetPreview();
        return
      }
      const b=findBest(p,W,H);
      if(!b) {
        $('sheets').textContent='0';
        $('yield').textContent='ขนาดใหญ่เกินไป';
        $('previewSheets').textContent='0';
        $('sheetPreview').innerHTML='';
        return
      }
      const sheets=Math.ceil(Q/b.yield),matCost=selectedMaterialCost(sheets,Q),svcCost=serviceCost(sheets,Q),tc=sheets*C+matCost+svcCost,profit=tc*P/100,sale=tc+profit;
      $('sheets').textContent=sheets.toLocaleString('th-TH');
      $('previewSheets').textContent=sheets.toLocaleString('th-TH');
      $('yield').textContent=b.yield.toLocaleString('th-TH');
      $('total').textContent=money(tc);
      $('sale').textContent=money(sale);
      drawPreview(p,b);
      lastCalc= {
        paper:p,W,H,Q,C,P,b,sheets,material:materials.find(m=>String(m.id)===String(selectedMaterialId))||null,services:services.filter(s=>selectedServiceIds[String(s.id)]),matCost,svcCost,total:tc,profit,sale
      }
      ;
    } catch(e) {
      console.error('Iprint calculate error',e)
    }
  }
  function openPreset() {
    const m=$('presetModal');
    m.classList.add('open');
    m.setAttribute('aria-hidden','false');
    $('pName').focus()
  }
  function closePreset() {
    const m=$('presetModal');
    m.classList.remove('open');
    m.setAttribute('aria-hidden','true')
  }
  async function savePreset() {
    const err=$('presetError');
    err.textContent='';
    const name=$('pName').value.trim(),fw=Number($('pW').value),fh=Number($('pH').value),mode=$('pMode').value;
    let uw,uh;
    if(mode==='full') {
      uw=fw;
      uh=fh
    } else if(mode==='margin') {
      uw=fw-3;
      uh=fh-3
    } else {
      uw=Number($('pUW').value);
      uh=Number($('pUH').value)
    }
    if(!name||!(fw>0&&fh>0&&uw>0&&uh>0&&uw<=fw&&uh<=fh)) {
      err.textContent='กรุณากรอกข้อมูลให้ถูกต้อง';
      return
    }
    if(!getWriteApiKey()) {
      err.textContent='ยังไม่ได้ตั้งค่า Write API Key — อ่านข้อมูลได้ตามปกติ แต่การเพิ่ม/ลบ Preset ต้องตั้งค่า authentication ก่อน';
      return
    }
    try {
      const r=await fetch(API.presets, {
        method:'POST',headers:writeHeaders(),body:JSON.stringify( {
          name,fullW:fw,fullH:fh,usableW:uw,usableH:uh,type:mode==='full'?'เต็มพื้นที่':mode==='margin'?'เผื่อมาร์คมาตรฐาน':'กำหนดเอง',active:true
        }
        )
      }
      );
      const t=await r.text();
      let d= {
      }
      ;
      try {
        d=JSON.parse(t)
      } catch(e) {
      }
      if(!r.ok)throw new Error(d.detail||d.error||('HTTP '+r.status));
      closePreset();
      await syncPresets()
    } catch(e) {
      err.textContent='เพิ่ม Preset ไม่สำเร็จ: '+e.message;
      console.error(e)
    }
  }
  async function deletePreset() {
    const p=presets[selectedSheet];
    if(!p) {
      alert('กรุณาเลือก Preset ก่อน');
      return
    }
    if(!getWriteApiKey()) {
      alert('ยังไม่ได้ตั้งค่า Write API Key');
      return
    }
    if(!confirm('ลบขนาดกระดาษ "'+p.name+'" จาก Notion Database ใช่หรือไม่?'))return;
    try {
      const r=await fetch(API.presets+'?id='+encodeURIComponent(p.pageId||selectedSheet), {
        method:'DELETE',headers: {
          'X-API-Key':getWriteApiKey()
        }
      }
      );
      const t=await r.text();
      let d= {
      }
      ;
      try {
        d=JSON.parse(t)
      } catch(e) {
      }
      if(!r.ok)throw new Error(d.detail||d.error||('HTTP '+r.status));
      selectedSheet='';
      await syncPresets()
    } catch(e) {
      alert('ลบ Preset ไม่สำเร็จ: '+e.message);
      console.error(e)
    }
  }
  function localDateKey() {
    const d=new Date();
    return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')
  }
  function quoteSeq() {
    const day=localDateKey(),key='lastQuoteSeq:'+day;
    let n=Number(localStorage.getItem(key)||0)+1;
    localStorage.setItem(key,String(n));
    return 'QT-'+day+'-'+String(n).padStart(3,'0')
  }
  function quoteItems() {
    if (!lastCalc) return [];

    const addon = [];
    const selectedServices = Array.isArray(lastCalc.services)
      ? lastCalc.services
      : [];

    if (lastCalc.material) {
      const material = lastCalc.material;
      const materialUnit = normalizeUnit(material.unit);
      const qty = materialUnit === 'piece'
        ? Number(lastCalc.Q) || 0
        : materialUnit === 'sheet'
          ? Number(lastCalc.sheets) || 0
          : 1;

      addon.push({
        name: String(material.name || 'วัสดุ'),
        size: 'วัสดุ',
        qty,
        unit: unit(material.unit),
        price: (Number(material.price) || 0) * qty
      });
    }

    selectedServices.forEach(service => {
      if (!service) return;

      const serviceUnit = normalizeUnit(service.unit);
      const qty = serviceUnit === 'piece'
        ? Number(lastCalc.Q) || 0
        : serviceUnit === 'sheet'
          ? Number(lastCalc.sheets) || 0
          : 1;

      addon.push({
        name: String(service.name || 'บริการ'),
        size: 'บริการ',
        qty,
        unit: unit(service.unit),
        price: (Number(service.price) || 0) * qty
      });
    });

    const addonTotal = addon.reduce(
      (sum, item) => sum + (Number(item.price) || 0),
      0
    );

    const sale = Number(lastCalc.sale) || 0;
    const basePrice = Math.max(0, sale - addonTotal);

    return [
      {
        name: 'งานพิมพ์',
        size: `${(Number(lastCalc.W) || 0).toFixed(2)} × ${(Number(lastCalc.H) || 0).toFixed(2)} cm`,
        qty: Number(lastCalc.Q) || 0,
        unit: 'ดวง',
        price: basePrice
      },
      ...addon
    ];
  }

  function quotePriceSummary() {
    const subtotal = Number(lastCalc?.sale) || 0;
    const vat = subtotal * 0.07;
    const grandTotal = subtotal + vat;

    return {
      subtotal,
      vat,
      grandTotal
    };
  }

  function formatCreatedAt(value) {
    if (!value) return '-';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  function buildQuote() {
    if (!lastCalc) return null;

    const customerInput = $('quoteCustomer');
    const customerPageIdInput = $('quoteCustomerPageId');

    const customerPageId = customerPageIdInput
      ? String(customerPageIdInput.value || '').trim()
      : '';

    const inputName = customerInput
      ? String(customerInput.value || '').trim()
      : '';

    const selectedCustomer = customerPageId
      ? customers.find(customer =>
          String(customer.id) === customerPageId
        )
      : null;

    const customer = selectedCustomer?.name || inputName || '-';

    const contact = String($('quoteContact')?.value || '').trim() || '-';
    const taxId = String($('quoteTaxId')?.value || '').trim();
    const address = String($('quoteAddress')?.value || '').trim() || '-';
    if(!currentQuoteMeta) {
      currentQuoteMeta= {
        quoteNo:quoteSeq(),
        date:new Date().toLocaleDateString('th-TH', {
          year:'numeric',month:'2-digit',day:'2-digit'
        }
        )
      }
      ;
    }
    const items=quoteItems();
    let rows='';
    items.forEach((it,i)=>rows+='<tr><td>'+(i+1)+'</td><td><b>'+escapeHtml(it.name)+'</b><br><span>'+escapeHtml(it.size)+'</span></td><td>'+Number(it.qty).toLocaleString('th-TH')+' '+escapeHtml(it.unit)+'</td><td>฿'+money(it.price)+'</td></tr>');
    $('quotePreview').innerHTML='<div class="quote-top"><div><div class="quote-brand">iPrint</div><div class="quote-meta">Design & Production</div></div><div class="quote-title">ใบเสนอราคา<div class="quote-meta">เลขที่ '+currentQuoteMeta.quoteNo+'<br>'+currentQuoteMeta.date+'<br>สร้างเมื่อ '+formatCreatedAt(currentQuoteMeta.createdAt)+'</div></div></div><div class="quote-customer"><b>ลูกค้า:</b> '+escapeHtml(customer)+'<br><b>เลขประจำตัวผู้เสียภาษี:</b> '+escapeHtml(taxId || '-')+'<br><b>ติดต่อ:</b> '+escapeHtml(contact)+'<br><b>ที่อยู่:</b> '+escapeHtml(address)+'</div><table class="quote-table"><thead><tr><th>#</th><th>รายการ</th><th>จำนวน</th><th>ราคา</th></tr></thead><tbody>'+rows+'</tbody></table><div class="quote-total"><span>จำนวนแผ่นผลิต</span><span>'+lastCalc.sheets.toLocaleString('th-TH')+' แผ่น</span></div><div class="quote-total"><span>ราคาก่อน VAT</span><span>฿'+money(quotePriceSummary().subtotal)+'</span></div><div class="quote-total"><span>VAT 7%</span><span>฿'+money(quotePriceSummary().vat)+'</span></div><div class="quote-total" style="font-size:14px;border-top:2px solid #111;padding-top:8px"><span>ยอดรวมสุทธิ</span><span>฿'+money(quotePriceSummary().grandTotal)+'</span></div>';
    return {
      quoteNo:currentQuoteMeta.quoteNo,
      date:currentQuoteMeta.date,
      createdAt:currentQuoteMeta.createdAt || new Date().toISOString(),
      customer,
      customerPageId,
      contact,
      taxId,
      address,
      items,
      total:lastCalc.sale,
      sheets:lastCalc.sheets,
      pieceCount:lastCalc.Q,
      size:lastCalc.W.toFixed(2)+' × '+lastCalc.H.toFixed(2)+' cm',
      paper:lastCalc.paper?.name || ''
    }
    ;
  }
  function escapeHtml(s) {
    return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')
  }
  function openQuote() {
    if(!lastCalc) {
      alert('กรุณากรอกข้อมูลให้คำนวณก่อน');
      return
    }
    currentQuoteMeta=null;
    $('quoteModal').classList.add('open');
    $('quoteModal').setAttribute('aria-hidden','false');
    buildQuote()
  }
  function closeQuote() {
    $('quoteModal').classList.remove('open');
    $('quoteModal').setAttribute('aria-hidden','true');
    currentQuoteMeta=null
  }
  async function saveQuoteLocal(q) {
    try {
      const key='iprint_quote_history_v1';
      const arr=JSON.parse(localStorage.getItem(key)||'[]');
      arr.push( {
        ...q,savedAt:new Date().toISOString()
      }
      );
      localStorage.setItem(key,JSON.stringify(arr.slice(-500)))
    } catch(e) {
    }
  }
  async function saveQuoteRemote(q) {
    try {
      const apiKey = getWriteApiKey();

      if (!apiKey) {
        throw new Error('ยังไม่ได้ตั้งค่า API Key');
      }

      const response = await fetch(API.quotes, {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify(q)
      });

      const text = await response.text();

      let data = {};

      try {
        data = JSON.parse(text);
      } catch (error) {
        // Keep raw response text for diagnostics.
      }

      if (!response.ok) {
        const detail =
          data.detail ||
          data.error ||
          text ||
          `HTTP ${response.status}`;

        throw new Error(
          `POST /quotes HTTP ${response.status}: ${detail}`
        );
      }

      if (data.success !== true) {
        throw new Error(
          data.error ||
          data.detail ||
          'Worker did not return success:true'
        );
      }

      return {
        success: true,
        id: data.id || null
      };
    } catch (error) {
      console.error('POST /quotes', error);
      return false;
    }
  }

  async function createCustomerRemote(customerData) {
    try {
      const response = await fetch(API.customers, {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify(customerData)
      });

      const text = await response.text();
      let data = {};

      try {
        data = JSON.parse(text);
      } catch (error) {
        // Keep the original response text for diagnostics.
      }

      if (!response.ok) {
        throw new Error(
          data.detail || data.error || 'HTTP ' + response.status
        );
      }

      if (!data.id) {
        throw new Error('POST /customers did not return id');
      }

      return data;
    } catch (error) {
      console.error('POST /customers', error);
      return null;
    }
  }

  async function ensureQuoteCustomer(q) {
    const input = $('quoteCustomer');
    const existingId = $('quoteCustomerPageId').value.trim();
    const name = input.value.trim();

    if (existingId || !name) {
      return q;
    }

    const customerData = {
      name,
      contactPerson: '',
      phone: q.contact || '',
      email: '',
      taxId: q.taxId || '',
      address: q.address || '',
      active: true
    };

    setStatus(
      'customerStatus',
      'กำลังสร้าง Customer ใหม่…',
      ''
    );

    const created = await createCustomerRemote(customerData);

    if (!created) {
      setStatus(
        'customerStatus',
        'สร้าง Customer ไม่สำเร็จ • แต่ยังพิมพ์ใบเสนอราคาได้',
        'warn'
      );

      return q;
    }

    const customerPageId = String(created.id);

    $('quoteCustomerPageId').value = customerPageId;

    customers.push({
      id: customerPageId,
      name,
      company: '',
      contactPerson: '',
      phone: q.contact || '',
      email: '',
      address: q.address || '',
      active: true
    });

    renderCustomerOptions();

    setStatus(
      'customerStatus',
      'สร้าง Customer ใหม่แล้ว',
      'ok'
    );

    q.customerPageId = customerPageId;

    return q;
  }

  async function printQuote() {
    let q = buildQuote();

    if (!q) return;

    q = await ensureQuoteCustomer(q);

    const customerName =
      String($('quoteCustomer')?.value || '').trim();

    if (customerName && !q.customerPageId) {
      setStatus(
        'customerStatus',
        'ไม่สามารถสร้าง/เชื่อม Customer ได้ • ตรวจ API Key และ Notion Database',
        'warn'
      );

      alert(
        'ยังไม่สามารถเชื่อม Customer กับ Notion ได้\n\n' +
        'กรุณาตรวจ API Key และลองใหม่อีกครั้ง'
      );

      return;
    }

    const hasApiKey = !!getWriteApiKey();
    const remote = hasApiKey
      ? await saveQuoteRemote(q)
      : false;

    if (!remote) {
      await saveQuoteLocal(q);

      $('quoteSaveStatus').textContent = hasApiKey
        ? 'บันทึก Notion ไม่สำเร็จ • เก็บประวัติไว้ในเครื่องแล้ว'
        : 'ยังไม่ได้ตั้ง API Key • เก็บประวัติไว้ในเครื่องแล้ว';
    } else {
      $('quoteSaveStatus').textContent =
        'บันทึกประวัติใบเสนอราคาใน Notion แล้ว';
    }

    setTimeout(() => window.print(), 80);
  }

  function bind() {
    loadState();
    renderPresets();
    $('sheet').addEventListener('change',e=> {
      selectedSheet=e.target.value;
      saveState();
      calculate()
    }
    );
    ['w','h','qty','cost','profitPercent'].forEach(id=> {
      const el=$(id);
      el.addEventListener('input',calculate);
      el.addEventListener('change',calculate)
    }
    );
    $('addPreset').addEventListener('click',openPreset);
    $('cancelPreset').addEventListener('click',closePreset);
    $('savePreset').addEventListener('click',savePreset);
    $('deletePreset').addEventListener('click',deletePreset);
    $('pMode').addEventListener('change',()=> {
      $('customArea').hidden=$('pMode').value!=='custom'
    }
    );
    $('materialSelect').addEventListener('change',e=> {
      selectedMaterialId=e.target.value;
      saveState();
      renderMaterials();
      calculate()
    }
    );
    $('openMaterialsServices').addEventListener('click',()=> {
      $('materialsServicesSheet').classList.add('open');
      $('sheetOverlay').classList.add('open')
    }
    );
    $('closeMaterialsServices').addEventListener('click',closeSide);
    $('sheetOverlay').addEventListener('click',closeSide);
    function closeSide() {
      $('materialsServicesSheet').classList.remove('open');
      $('sheetOverlay').classList.remove('open')
    }
    $('openQuote').addEventListener('click',openQuote);
    $('closeQuote').addEventListener('click',closeQuote);
    $('cancelQuote2').addEventListener('click',closeQuote);
    $('quoteCustomer').addEventListener('input',selectQuoteCustomer);
    $('quoteCustomer').addEventListener('change',selectQuoteCustomer);
    ['quoteContact','quoteTaxId','quoteAddress'].forEach(id=>$(id).addEventListener('input',buildQuote));
    $('printQuote').addEventListener('click',printQuote);
    window.addEventListener('resize',()=>setTimeout(calculate,60));
    calculate();
    syncPresets();
    syncMaterials();
    syncServices();
    syncCustomers()
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
  else bind();
  window.Iprint= {
    calculate,syncPresets,syncMaterials,syncServices,syncCustomers,openQuote,buildQuote
  }
  ;
}
)();
