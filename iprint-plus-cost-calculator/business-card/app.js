import { BUSINESS_CARD_SIZE, buildOrderPayload, calculateBusinessCardQuote, isoDate, safeFilename } from './logic.js';

const API_ROOT = 'https://iprint-flow-api.iprint-garphic1.workers.dev';
const IS_LOCAL_PREVIEW = ['127.0.0.1', 'localhost'].includes(location.hostname);
const $ = id => document.getElementById(id);
const money = value => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[character]));
const PACKAGES = [
  { id:'essential', name:'Essential', tagline:'เริ่มต้นธุรกิจอย่างมั่นใจ', quantity:100, print:'single', laminate:'none', bullets:['Art Paper 300g','พิมพ์หน้าเดียว','เหมาะกับงานเริ่มต้น'] },
  { id:'corporate', name:'Corporate', tagline:'ครบสำหรับทีมและองค์กร', quantity:500, print:'double', laminate:'matte', recommended:true, bullets:['Art Paper 300g','พิมพ์หน้า–หลัง','เคลือบด้าน ลดรอยนิ้วมือ'] },
  { id:'signature', name:'Signature', tagline:'โดดเด่นสำหรับแบรนด์ที่ต้องการภาพจำ', quantity:1000, print:'double', laminate:'gloss', bullets:['Art Paper 300g','พิมพ์หน้า–หลัง','เคลือบเงา สีสดเด่น'] }
];
const LOCAL_CATALOG = {
  presets:{presets:[{id:'3c91a0ce-e8bd-8032-bb21-f6553f6f4ce2',name:'13×19" กระดาษมาตรฐาน (ประมาณ A3)',usableW:31.02,usableH:47.26,active:true}]},
  materials:{materials:[{id:'3c91a0ce-e8bd-807e-8583-dde326de7701',name:'Art Paper 300g',price:1.2,unit:'sheet',active:true,updatedAt:'local-preview'}]},
  services:{services:[{id:'3c91a0ce-e8bd-808d-ba83-dcc59ed24df1',name:'พิมพ์หน้าเดียว',price:20,unit:'sheet',active:true,serviceRole:'PRINT_SINGLE',capacityPoints:1,capacityBasis:'job',capacityStep:1,updatedAt:'local-preview'},{id:'3c91a0ce-e8bd-806d-ab92-fe7578812e11',name:'พิมพ์หน้า-หลัง',price:30,unit:'sheet',active:true,serviceRole:'PRINT_DOUBLE',capacityPoints:2,capacityBasis:'job',capacityStep:1,updatedAt:'local-preview'},{id:'3c91a0ce-e8bd-8048-9fbc-e01e72ea68cf',name:'เคลือบด้าน',price:20,unit:'sheet',active:true,capacityPoints:.25,capacityBasis:'sheet',capacityStep:1,updatedAt:'local-preview'},{id:'3c91a0ce-e8bd-80c0-b1d6-d57614292391',name:'เคลือบเงา',price:20,unit:'sheet',active:true,capacityPoints:.25,capacityBasis:'sheet',capacityStep:1,updatedAt:'local-preview'}]}
};

const state = { step:1, packageId:'corporate', packageName:'Corporate', catalogs:null, preset:null, material:null, services:[], quantity:500, quote:null, availability:null, deliveryDate:'', boost:null, frontFile:null, backFile:null, references:[], ticketId:'', jobName:'', version:'V1', driveLink:'', note:'', customerName:'', phone:'', email:'', lineId:'', address:'', paymentMethod:'รอใบแจ้งชำระ' };

function renderPackages() {
  const markup = PACKAGES.map(item => `<article class="package-card ${item.recommended?'recommended':''}">${item.recommended?'<span class="tag">แนะนำ</span>':''}<h3>${item.name}</h3><p>${item.tagline}</p><strong>${item.quantity.toLocaleString('th-TH')} ใบ</strong><ul>${item.bullets.map(value=>`<li>${value}</li>`).join('')}</ul><button class="button" data-package="${item.id}">เลือกแพ็กเกจนี้</button></article>`).join('');
  $('packageCards').innerHTML = markup;
  $('builderPackages').innerHTML = PACKAGES.map(item => `<button type="button" class="choice ${item.id===state.packageId?'selected':''}" data-builder-package="${item.id}"><b>${item.name}${item.recommended?' • แนะนำ':''}</b><small>${item.quantity.toLocaleString('th-TH')} ใบ • ${item.tagline}</small></button>`).join('');
}

async function getJSON(path) {
  if (IS_LOCAL_PREVIEW) {
    if (path === '/presets') return LOCAL_CATALOG.presets;
    if (path === '/materials') return LOCAL_CATALOG.materials;
    if (path === '/services') return LOCAL_CATALOG.services;
    if (path.startsWith('/public/capacity')) return localAvailability(Number(new URL(`${API_ROOT}${path}`).searchParams.get('points')) || 1);
  }
  const response = await fetch(`${API_ROOT}${path}`, { cache:'no-store' });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!response.ok) throw new Error(data.error || `โหลดข้อมูลไม่สำเร็จ (${response.status})`);
  return data;
}

function localAvailability(points) {
  const days=[]; const cursor=new Date(); cursor.setHours(0,0,0,0); let recommendedDate='';
  for(let index=0;index<45;index+=1){const date=isoDate(cursor);const closed=cursor.getDay()===0;const available=!closed&&index>=2;if(available&&!recommendedDate)recommendedDate=date;days.push({date,availability:closed?'CLOSED':available?'AVAILABLE':'TOO_SOON',bookable:available,boostDays:0,boostMultiplier:0});cursor.setDate(cursor.getDate()+1)}
  return {success:true,requiredPoints:points,recommendedDate,schedulable:true,days,testMode:true};
}

function loadTurnstile() {
  if (IS_LOCAL_PREVIEW) { const target=document.querySelector('.cf-turnstile'); if(target) target.textContent='Local Preview • Turnstile ทำงานเมื่อเปิดบน iprint.tchl.online'; return; }
  const script=document.createElement('script'); script.src='https://challenges.cloudflare.com/turnstile/v0/api.js'; script.async=true; script.defer=true; document.head.appendChild(script);
}

async function loadCatalogs() {
  const [presetData, materialData, serviceData] = await Promise.all([getJSON('/presets'), getJSON('/materials'), getJSON('/services')]);
  const presets = (presetData.presets || []).filter(item => item.active !== false);
  const materials = (materialData.materials || []).filter(item => item.active !== false);
  const services = (serviceData.services || []).filter(item => item.active !== false);
  state.catalogs = { presets, materials, services };
  state.preset = presets.find(item => /13.?19.*กระดาษมาตรฐาน/i.test(item.name)) || presets[0];
  $('material').innerHTML = materials.filter(item => /art|อาร์ต|card|pvc/i.test(item.name)).map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  const printServices = services.filter(isPrintService);
  const laminates = services.filter(item => /เคลือบ|laminat/i.test(`${item.name} ${item.category}`));
  $('printChoices').innerHTML = printServices.map(item => `<button type="button" class="choice" data-service-print="${esc(item.id)}"><b>${esc(item.name)}</b><small>฿${money(item.price)} / ${esc(item.unit)}</small></button>`).join('');
  $('laminationChoices').innerHTML = `<button type="button" class="choice" data-service-laminate="none"><b>ไม่เคลือบ</b><small>ประหยัดและเขียนบนผิวได้ง่าย</small></button>${laminates.map(item => `<button type="button" class="choice" data-service-laminate="${esc(item.id)}"><b>${esc(item.name)}</b><small>฿${money(item.price)} / ${esc(item.unit)}</small></button>`).join('')}`;
  applyPackage(state.packageId);
  $('heroPrice').textContent = `เริ่มต้น ฿${money(state.quote?.price || 0)}`;
}

function isPrintService(item) { return ['PRINT_SINGLE','PRINT_DOUBLE'].includes(String(item.serviceRole || '').toUpperCase()) || /พิมพ์.*หน้า|print/i.test(`${item.name} ${item.category}`); }
function isDouble(item) { return String(item?.serviceRole || '').toUpperCase() === 'PRINT_DOUBLE' || /หน้า\s*[-–—/]?\s*หลัง|2\s*หน้า/.test(item?.name || ''); }

function applyPackage(id) {
  const item = PACKAGES.find(entry => entry.id === id) || PACKAGES[1];
  state.packageId = item.id; state.packageName = item.name; state.quantity = item.quantity; state.boost = null; state.deliveryDate = '';
  if (state.catalogs) {
    state.material = state.catalogs.materials.find(entry => /art paper 300|อาร์ต.*300/i.test(entry.name)) || state.catalogs.materials[0];
    const print = state.catalogs.services.find(entry => item.print === 'double' ? isDouble(entry) : isPrintService(entry) && !isDouble(entry));
    const laminate = item.laminate === 'none' ? null : state.catalogs.services.find(entry => new RegExp(item.laminate === 'matte' ? 'ด้าน' : 'เงา').test(entry.name));
    state.services = [print, laminate].filter(Boolean);
    $('quantity').value = String(item.quantity); $('material').value = state.material?.id || '';
  }
  renderPackages(); syncSelections(); recalculate();
}

function syncSelections() {
  document.querySelectorAll('[data-service-print]').forEach(button => button.classList.toggle('selected', state.services.some(item => item.id === button.dataset.servicePrint)));
  const selectedLaminate = state.services.find(item => !isPrintService(item));
  document.querySelectorAll('[data-service-laminate]').forEach(button => button.classList.toggle('selected', (selectedLaminate?.id || 'none') === button.dataset.serviceLaminate));
  document.querySelectorAll('[data-builder-package]').forEach(button => button.classList.toggle('selected', button.dataset.builderPackage === state.packageId));
  $('backFileWrap').hidden = !state.services.some(isDouble);
}

function recalculate() {
  if (!state.preset || !state.material) return;
  state.quote = calculateBusinessCardQuote({ preset:state.preset, material:state.material, services:state.services, quantity:state.quantity, boost:state.boost });
  const q = state.quote;
  $('priceSummary').innerHTML = `<div class="summary-line"><span>${q.pieces.toLocaleString('th-TH')} ใบ • ${q.layout.yield} ใบ/แผ่น</span><b>${q.sheets} แผ่น</b></div><div class="summary-line"><span>กำลังผลิตโดยประมาณ</span><b>${q.points} แต้ม</b></div>${state.boost?`<div class="summary-line"><span>Boost เร็วขึ้น ${state.boost.days} วัน</span><b>+${state.boost.multiplier*100}%</b></div>`:''}<div class="summary-line summary-total"><span>ราคา</span><b>฿${money(q.price)}</b></div>`;
  if (!state.deliveryDate) loadAvailability().catch(showCapacityError);
  if (state.step === 4) renderFinalSummary();
}

function openBuilder(packageId = state.packageId) { applyPackage(packageId); $('order').hidden = false; $('success').hidden = true; showStep(1); $('order').scrollIntoView({ behavior:'smooth', block:'start' }); }
function showStep(step) {
  state.step = Math.max(1, Math.min(4, step));
  document.querySelectorAll('[data-step]').forEach(panel => panel.hidden = Number(panel.dataset.step) !== state.step);
  $('progress').innerHTML = [1,2,3,4].map(value => `<span class="${value<=state.step?'active':''}"></span>`).join('');
  $('backStep').hidden = state.step === 1; $('nextStep').hidden = state.step === 4; $('submitOrder').hidden = state.step !== 4;
  if (state.step === 3) loadAvailability().catch(showCapacityError);
  if (state.step === 4) { collectInputs(); renderFinalSummary(); }
}

function validateStep() {
  if (state.step === 1 && (!state.quote || !state.services.some(isPrintService))) return 'กรุณาเลือกรูปแบบการพิมพ์';
  if (state.step === 2) {
    collectInputs();
    if (!state.jobName) return 'กรุณากรอกชื่องาน';
    if (!state.frontFile) return 'กรุณาแนบไฟล์ด้านหน้า';
    if (state.services.some(isDouble) && !state.backFile) return 'แพ็กเกจนี้พิมพ์หน้า–หลัง กรุณาแนบไฟล์ด้านหลัง';
  }
  if (state.step === 3 && !state.deliveryDate) return 'กรุณาเลือกวันรับงาน';
  return '';
}

function collectInputs() {
  state.jobName = $('jobName').value.trim(); state.version = $('version').value.trim() || 'V1'; state.frontFile = $('frontFile').files[0] || state.frontFile; state.backFile = $('backFile').files[0] || null;
  state.references = [...$('referenceFiles').files].slice(0,3); state.driveLink = $('driveLink').value.trim(); state.note = $('note').value.trim();
  state.customerName = $('customerName').value.trim(); state.phone = $('phone').value.trim(); state.email = $('email').value.trim(); state.lineId = $('lineId').value.trim(); state.address = $('address').value.trim();
  state.paymentMethod = document.querySelector('[name="payment"]:checked')?.value || 'รอใบแจ้งชำระ';
}

async function loadAvailability() {
  if (!state.quote) return;
  $('capacitySummary').textContent = 'กำลังตรวจคิวล่าสุด…';
  const from = isoDate(); const end = new Date(); end.setDate(end.getDate()+45); const to = isoDate(end);
  state.availability = await getJSON(`/public/capacity?from=${from}&to=${to}&points=${encodeURIComponent(state.quote.points)}`);
  $('capacitySummary').textContent = state.availability.recommendedDate ? `วันแนะนำเร็วที่สุด ${formatDate(state.availability.recommendedDate)} • ใช้ ${state.quote.points} แต้ม` : 'ยังไม่พบวันที่รองรับงานนี้';
  $('calendar').innerHTML = (state.availability.days || []).map(day => { const selectable = day.bookable || Number(day.boostDays)>0; return `<button type="button" class="day ${day.availability==='AVAILABLE'?'available':''} ${day.boostDays?'boostable':''} ${day.date===state.deliveryDate?'selected':''}" data-date="${day.date}" ${selectable?'':'disabled'}><b>${new Date(day.date+'T00:00:00').getDate()}</b><small>${day.boostDays?`Boost -${day.boostDays} วัน`:day.availability==='AVAILABLE'?'ว่าง':day.availability==='CLOSED'?'ปิด':'เร็วเกินไป'}</small></button>`; }).join('');
}
function showCapacityError(error) { $('capacitySummary').textContent = error.message || 'โหลดกำลังผลิตไม่สำเร็จ'; }
function selectDate(date) {
  const day = state.availability?.days?.find(item => item.date === date); if (!day) return;
  state.deliveryDate = date; state.boost = day.boostDays ? { days:Number(day.boostDays), multiplier:Number(day.boostMultiplier), date } : null;
  $('boostOffer').hidden = !state.boost; $('boostOffer').innerHTML = state.boost ? `<b>Boost เร็วขึ้น ${state.boost.days} วัน</b><p>เพิ่มราคา ${state.boost.multiplier*100}% ระบบยังตรวจ Capacity จริงก่อนรับออร์เดอร์</p>` : '';
  recalculate(); loadAvailability().catch(showCapacityError);
}

function renderArtworkPreview() {
  state.frontFile = $('frontFile').files[0] || null; state.backFile = $('backFile').files[0] || null;
  const files = [['ด้านหน้า',state.frontFile],['ด้านหลัง',state.backFile]].filter(([,file])=>file);
  $('artworkPreview').innerHTML = files.map(([label,file]) => `<figure><img src="${URL.createObjectURL(file)}" alt="Preview ${label}"><figcaption>${label} • ${esc(file.name)}</figcaption></figure>`).join('');
}

function renderFinalSummary() {
  const q=state.quote; const vat=q.price*.07;
  $('finalSummary').innerHTML = `<span class="eyebrow">ORDER SUMMARY</span><h3>${esc(state.packageName)}</h3><div class="summary-line"><span>งาน</span><b>${esc(state.jobName||'-')}</b></div><div class="summary-line"><span>จำนวน</span><b>${q.pieces.toLocaleString('th-TH')} ใบ</b></div><div class="summary-line"><span>วัสดุ</span><b>${esc(state.material?.name||'-')}</b></div><div class="summary-line"><span>บริการ</span><b>${state.services.map(item=>esc(item.name)).join(', ')}</b></div><div class="summary-line"><span>วันรับ</span><b>${formatDate(state.deliveryDate)}</b></div><div class="summary-line"><span>ราคา</span><b>฿${money(q.price)}</b></div><div class="summary-line"><span>VAT 7%</span><b>฿${money(vat)}</b></div><div class="summary-line summary-total"><span>รวม</span><b>฿${money(q.price+vat)}</b></div>`;
}

async function submitOrder(event) {
  event.preventDefault(); collectInputs();
  if (!state.customerName || !state.phone || !state.address || !$('consent').checked) { setSubmitStatus('กรุณากรอกชื่อ เบอร์โทร ที่อยู่ และยืนยันข้อมูล', true); return; }
  const token = document.querySelector('[name="cf-turnstile-response"]')?.value || '';
  if (!token) { setSubmitStatus('กรุณาผ่านการตรวจสอบความปลอดภัย', true); return; }
  $('submitOrder').disabled = true; setSubmitStatus('กำลังสร้าง Ticket และจัดคิวผลิต…');
  try {
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0,8)}`; const quoteNo = `BC-${isoDate().replaceAll('-','').slice(2)}-${stamp.slice(-6).toUpperCase()}`; const orderKey = `business-card-${stamp}`;
    const payload = buildOrderPayload({ state, quote:state.quote, orderKey, quoteNo });
    const brief = await buildBriefBlob(payload);
    const form = new FormData(); form.append('order', JSON.stringify(payload)); form.append('turnstileToken', token); form.append('brief_0_0', brief, `${quoteNo}-brief.png`);
    state.references.forEach((file,index)=>form.append(`brief_0_${index+1}`,file,safeFilename(file.name)));
    const response = await fetch(`${API_ROOT}/public/orders`, { method:'POST', body:form }); const text=await response.text(); let data={}; try{data=JSON.parse(text)}catch{}
    if(!response.ok||data.success!==true) throw new Error(data.error||data.detail||text||`HTTP ${response.status}`);
    state.ticketId=data.id; localStorage.setItem('iprint_business_card_last_ticket',data.id); showSuccess();
  } catch(error) { setSubmitStatus(error.message||'สร้างออร์เดอร์ไม่สำเร็จ',true); window.turnstile?.reset(); }
  finally { $('submitOrder').disabled=false; }
}

async function buildBriefBlob(payload) {
  const canvas=document.createElement('canvas'); canvas.width=1200; canvas.height=state.backFile?1050:720; const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#0a1a2d'; ctx.font='700 38px Arial'; ctx.fillText(`iPrint Brief — 9 × 5.4 cm`,50,64); ctx.font='24px Arial'; ctx.fillText(`${state.jobName} • ${state.quantity} ใบ • รับ ${state.deliveryDate}`,50,105); ctx.strokeStyle='#dbeafe'; ctx.strokeRect(40,125,1120,canvas.height-165);
  const images=[['ด้านหน้า',state.frontFile],['ด้านหลัง',state.backFile]].filter(([,file])=>file); let y=160;
  for(const [label,file] of images){const image=await loadImage(file); ctx.fillStyle='#0a8cff';ctx.font='700 24px Arial';ctx.fillText(label,70,y+28);drawContain(ctx,image,260,y,850,360);y+=410}
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('สร้างภาพบรีฟไม่สำเร็จ')),'image/png'));
}
function loadImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file);const image=new Image();image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};image.onerror=reject;image.src=url})}
function drawContain(ctx,image,x,y,w,h){const scale=Math.min(w/image.width,h/image.height);const dw=image.width*scale,dh=image.height*scale;ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}

function showSuccess(){ $('order').hidden=true;$('success').hidden=false;$('ticketId').textContent=state.ticketId;$('success').scrollIntoView({behavior:'smooth'});checkStatus(); }
async function checkStatus(){const id=state.ticketId||localStorage.getItem('iprint_business_card_last_ticket');if(!id)return;$('trackingResult').textContent='กำลังโหลดสถานะ…';try{const data=await getJSON(`/public/orders/${encodeURIComponent(id)}`);$('trackingResult').innerHTML=`<h3>${esc(data.ticket.title)}</h3><p>สถานะรวม: <b>${esc(statusLabel(data.ticket.customerStatus||data.ticket.status))}</b></p>${(data.items||[]).map(item=>`<div class="track-item"><b>${esc(item.title)}</b><span>${esc(statusLabel(item.status))}</span></div>`).join('')}`}catch(error){$('trackingResult').textContent=error.message||'ยังโหลดสถานะไม่ได้'}}
function statusLabel(value){return({NEW:'รับออร์เดอร์แล้ว',ORDER_RECEIVED:'รับออร์เดอร์แล้ว',IN_PROGRESS:'กำลังเตรียมไฟล์',PRODUCTION:'กำลังผลิต',READY:'พร้อมรับสินค้า',COMPLETED:'เสร็จสมบูรณ์',GRAPHIC_ACCEPTED:'กราฟิกรับงานแล้ว',FILE_CHECK:'กำลังตรวจไฟล์',DESIGNING:'กำลังจัดทำ',PROOF_READY:'รอยืนยันแบบ',APPROVED:'อนุมัติแล้ว',PRODUCTION_QUEUED:'เข้าคิวผลิต',IN_PRODUCTION:'กำลังผลิต',QC:'ตรวจคุณภาพ',DELIVERED:'ส่งมอบแล้ว'})[value]||value||'ไม่ระบุ'}
function formatDate(value){if(!value)return'-';return new Date(value+'T00:00:00').toLocaleDateString('th-TH-u-ca-gregory',{day:'numeric',month:'short',year:'numeric'})}
function setSubmitStatus(message,error=false){$('submitStatus').textContent=message;$('submitStatus').classList.toggle('error',error)}

document.addEventListener('click',event=>{const start=event.target.closest('[data-start]');if(start)openBuilder();const packageButton=event.target.closest('[data-package]');if(packageButton)openBuilder(packageButton.dataset.package);const builderPackage=event.target.closest('[data-builder-package]');if(builderPackage)applyPackage(builderPackage.dataset.builderPackage);const print=event.target.closest('[data-service-print]');if(print){state.services=state.services.filter(item=>!isPrintService(item));const service=state.catalogs.services.find(item=>item.id===print.dataset.servicePrint);if(service)state.services.unshift(service);syncSelections();recalculate()}const laminate=event.target.closest('[data-service-laminate]');if(laminate){state.services=state.services.filter(isPrintService);const service=state.catalogs.services.find(item=>item.id===laminate.dataset.serviceLaminate);if(service)state.services.push(service);syncSelections();recalculate()}const day=event.target.closest('[data-date]');if(day)selectDate(day.dataset.date)});
$('quantity').addEventListener('change',event=>{state.quantity=Number(event.target.value);state.deliveryDate='';state.boost=null;recalculate()});$('material').addEventListener('change',event=>{state.material=state.catalogs.materials.find(item=>item.id===event.target.value);state.deliveryDate='';state.boost=null;recalculate()});
$('frontFile').addEventListener('change',renderArtworkPreview);$('backFile').addEventListener('change',renderArtworkPreview);$('referenceFiles').addEventListener('change',event=>{if(event.target.files.length>3){alert('แนบภาพ Ref ได้สูงสุด 3 ภาพ');event.target.value=''}});
$('nextStep').addEventListener('click',()=>{const error=validateStep();if(error){alert(error);return}showStep(state.step+1)});$('backStep').addEventListener('click',()=>showStep(state.step-1));$('closeBuilder').addEventListener('click',()=>{$('order').hidden=true});$('orderForm').addEventListener('submit',submitOrder);$('checkStatus').addEventListener('click',checkStatus);$('newOrder').addEventListener('click',()=>openBuilder('corporate'));

renderPackages(); loadTurnstile(); loadCatalogs().catch(error=>{$('heroPrice').textContent='โหลดราคาไม่สำเร็จ';$('priceSummary').textContent=error.message});
