import { loadPricing, loadCatalog, API_ROOT, LOCAL } from '../shared/pricing-client.js';
import { findProduct, resolveSets, defaultSelection, quoteSelection, quantityChoices } from '../business-card/product.js';
import { validatePrintRequest, requestSummary, requestSummaryItems, lineRequestText, lineRequestUrl, MAX_ARTWORK_BYTES } from '../shared/print-request.js';

import { buildArtworkBundle, nameArtworkBundle } from './artwork-bundle.js';
import { largeOriginals, announceOriginals, referenceSources, uploadOriginals } from './originals.js';

const $ = id => document.getElementById(id);
let turnstileLoading;
const isDesktop = () => window.matchMedia?.('(pointer: fine)').matches && window.innerWidth >= 768;
async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const field = document.createElement('textarea');
  field.value = text; field.setAttribute('readonly', ''); field.style.position = 'fixed'; field.style.opacity = '0';
  document.body.appendChild(field); field.select();
  const copied = document.execCommand('copy'); field.remove();
  if (!copied) throw new Error('คัดลอกข้อความไม่สำเร็จ');
}
function renderLineQr(url) {
  if (!isDesktop() || typeof globalThis.qrcode !== 'function') return false;
  const qr = globalThis.qrcode(0, 'M');
  qr.addData(url, 'Byte'); qr.make();
  $('requestLineQrImage').src = qr.createDataURL(7, 12);
  $('requestLineQr').hidden = false;
  return true;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '', cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, cursor);
  return cursor + lineHeight;
}

export function downloadBriefImage({ ticketId, value }, { documentValue = document } = {}) {
  const canvas = documentValue.createElement('canvas');
  canvas.width = 1200; canvas.height = 1500;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('อุปกรณ์นี้ยังไม่รองรับการสร้างภาพสรุปบรีฟ');

  ctx.fillStyle = '#eef7ff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a8cff'; ctx.fillRect(0, 0, canvas.width, 220);
  ctx.fillStyle = '#fff'; ctx.font = '700 76px system-ui, sans-serif'; ctx.fillText('iPrint', 80, 118);
  ctx.font = '500 30px system-ui, sans-serif'; ctx.fillText('สรุปคำขอสั่งพิมพ์', 80, 170);

  roundedRect(ctx, 65, 265, 1070, 1125, 34);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.strokeStyle = '#cfe4f5'; ctx.lineWidth = 3; ctx.stroke();

  ctx.fillStyle = '#0a8cff'; ctx.font = '700 25px system-ui, sans-serif'; ctx.fillText('PRINT REQUEST', 115, 340);
  ctx.fillStyle = '#12385e'; ctx.font = '700 46px system-ui, sans-serif'; ctx.fillText(value.jobName || 'งานพิมพ์', 115, 410);
  ctx.fillStyle = '#64798e'; ctx.font = '500 26px system-ui, sans-serif'; ctx.fillText('รหัสคำขอ', 115, 470);
  ctx.fillStyle = '#0a8cff'; ctx.font = '700 35px system-ui, sans-serif'; ctx.fillText(String(ticketId), 115, 518);

  ctx.strokeStyle = '#d8e8f7'; ctx.beginPath(); ctx.moveTo(115, 560); ctx.lineTo(1085, 560); ctx.stroke();
  let y = 625;
  const details = [`ผู้ติดต่อ: ${value.name}`, `เบอร์โทร: ${value.phone}`, ...(value.lineId ? [`LINE ID: ${value.lineId}`] : []), ...requestSummaryItems(value)];
  for (const detail of details) {
    ctx.fillStyle = '#12385e'; ctx.font = '600 27px system-ui, sans-serif';
    y = drawWrappedText(ctx, detail, 115, y, 970, 42) + 14;
  }
  ctx.fillStyle = '#64798e'; ctx.font = '500 23px system-ui, sans-serif';
  drawWrappedText(ctx, 'ทีมงานจะยืนยันวัสดุ ราคา และวันผลิตก่อนเริ่มงาน', 115, 1320, 970, 34);
  ctx.textAlign = 'center'; ctx.fillText('เก็บภาพนี้ไว้ใช้อ้างอิงกับทีมงาน iPrint', canvas.width / 2, 1440);

  const link = documentValue.createElement('a');
  link.download = `iprint-brief-${String(ticketId).replace(/[^a-zA-Z0-9_-]+/g, '-')}.png`;
  link.href = canvas.toDataURL('image/png');
  documentValue.body.appendChild(link); link.click(); link.remove();
}

function downloadPreviewImage(dataUrl, ticketId, jobName) {
  if (!dataUrl) return false;
  const safeJob = String(jobName || 'business-card').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'business-card';
  const link = document.createElement('a');
  link.download = `iprint-3d-preview-${safeJob}-${String(ticketId).replace(/[^a-zA-Z0-9_-]+/g, '-')}.png`;
  link.href = dataUrl;
  document.body.appendChild(link); link.click(); link.remove();
  return true;
}

function loadTurnstile() {
  return turnstileLoading ||= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => { turnstileLoading = null; script.remove(); reject(new Error('โหลดการตรวจสอบความปลอดภัยไม่สำเร็จ กรุณาลองใหม่')); };
    document.head.append(script);
  });
}
export function initPrintRequest({ card, layers, panel, capturePreviewSheet = async () => '' }) {
  let downloadUrls = [], opening = 0;
  let snapshot, settings, catalog, product, packs = [], widget, token = '', submitting = false, saved = false;
  const form = $('printRequestForm'), dialog = $('printRequestDialog');
  let uploading = false, originalsState = null, successRequest = null; // originals over 10 MB are uploaded after the request is saved
  const payload = () => ({ version: 2, jobName: $('requestJobName').value.trim(), materialName: $('requestMaterialName').value.trim(), hasBack: Boolean(snapshot.files.backArtwork), key: snapshot.key, ...(snapshot.large?.length ? { originals: announceOriginals(snapshot.large) } : {}), spec: snapshot.spec, quantity: Number($('requestQuantity').value), name: $('requestName').value.trim(), phone: $('requestPhone').value.trim(), lineId: $('requestLineId').value.trim() });
  function updateDownloads() {
    for (const url of downloadUrls) URL.revokeObjectURL(url);
    downloadUrls = [];
    $('requestArtworkDownloads').replaceChildren();
    if (!snapshot?.exports) return;
    const metadata = payload();
    if (!metadata.name || !metadata.jobName || !metadata.materialName || !Number.isInteger(metadata.quantity) || metadata.quantity < 1 || metadata.quantity > 100000) {
      $('requestArtworkDownloads').textContent = 'กรอกชื่อลูกค้า ชื่องาน วัสดุ และจำนวน เพื่อดาวน์โหลดไฟล์ที่ตั้งชื่อครบถ้วน';
      return;
    }
    for (const file of nameArtworkBundle(snapshot.exports, metadata)) {
      const link = document.createElement('a');
      const url = URL.createObjectURL(file.blob);
      downloadUrls.push(url);
      link.href = url; link.download = file.filename;
      link.textContent = `ดาวน์โหลด ${file.kind.toUpperCase()} ${file.side === 'front' ? 'ด้านหน้า' : 'ด้านหลัง'}: ${file.filename}`;
      link.style.display = 'block';
      $('requestArtworkDownloads').append(link);
    }
  }
  function updatePrice() {
    if (!snapshot) return;
    $('requestSummary').replaceChildren(...requestSummaryItems(payload()).map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    $('requestPrice').textContent = 'รอประเมินราคา';
    $('requestPriceDetail').textContent = 'ทีมงานจะยืนยันราคาตามวัสดุ ขนาด และเทคนิคที่เลือก';
    const pack = packs.find(item => item.id === $('requestPackage').value);
    if (!pack || !settings || !catalog) return;
    try {
      if (product?.mode === 'packages' && !quantityChoices(product, pack).includes(payload().quantity)) throw new Error('จำนวนนี้อยู่นอกแพ็กเกจ');
      const selection = defaultSelection({ product, catalog, pack });
      const quote = quoteSelection({ settings, pack, material: selection.material, services: selection.services, quantity: payload().quantity });
      if (!Number.isFinite(quote.price) || quote.price <= 0) throw new Error('ไม่มีราคาที่เผยแพร่');
      $('requestPrice').textContent = `ราคาอ้างอิง ฿${quote.price.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
      $('requestPriceDetail').textContent = `อ้างอิงเซต ${pack.name}: ${selection.material?.name || ''} / ${selection.services.map(item => item.name).join(', ')} — ไม่ใช่ยอดยืนยันของดีไซน์นี้ ยังไม่รวม VAT ค่าส่ง และเทคนิคพิเศษ ทีมงานจะตรวจสเปกก่อนแจ้งยอดจริง`;
    } catch { /* Never interpolate a package price or invent a price for an unsupported quantity. */ }
  }
  async function verify() {
    if (LOCAL) { $('requestVerification').textContent = 'โหมดทดสอบ: การส่งคำขอเปิดใช้บนเว็บจริงเท่านั้น'; return; }
    token = '';
    const api = await loadTurnstile();
    if (!dialog.open) return;
    if (widget !== undefined) { api.reset(widget); return; }
    widget = api.render($('requestVerification'), { sitekey: '0x4AAAAAAEsjKgPkaJZ-diT2', action: 'create_order', callback: value => { token = value; }, 'expired-callback': () => { token = ''; }, 'error-callback': () => { token = ''; $('requestStatus').textContent = 'การตรวจสอบความปลอดภัยขัดข้อง กรุณาปิดหน้าต่างแล้วลองใหม่'; } });
  }
  $('requestPrint').addEventListener('click', async () => {
    if (!$('loader').classList.contains('is-hidden')) { $('status').textContent = 'รอให้พรีวิวอัปเดตเสร็จก่อนสั่งพิมพ์'; return; }
    const generation = ++opening;
    const sources = layers.exportSources();
    if (!sources.art?.file) { $('status').textContent = 'กรุณาอัปโหลดดีไซน์ของคุณในขั้น 1 แบบของคุณ ก่อนสั่งพิมพ์'; return; }
    if (panel.state.finish !== 'none' && !sources.mask?.file) { $('status').textContent = 'กรุณาอัปโหลดรูปทรงเทคนิคพิเศษในขั้น 4 เทคนิคพิเศษ'; return; }
    const files = { artwork: sources.art.file, backArtwork: sources.backArt?.file, finish: sources.mask?.file, dieline: sources.cut?.file };
    const spec = { ...sources.params, width: card.spec.bounds.w, height: card.spec.bounds.h, paper: panel.state.paper, coating: panel.state.coating, finish: panel.state.finish };
    // Keep the retry key for an unchanged design. A new design starts a new request.
    const exportOptions = { colorMode: $('exportColor').value, jobPage: $('exportJob').checked };
    const exportSources = { ...sources, paperId: panel.state.paper, coatingId: panel.state.coating, finishId: panel.state.finish };
    const exportSignature = JSON.stringify([exportOptions, sources.mask?.invert]);
    const same = snapshot && snapshot.exportSignature === exportSignature && JSON.stringify(snapshot.spec) === JSON.stringify(spec) && Object.keys(files).every(key => files[key] === snapshot.files[key]);
    if (!same || saved) snapshot = { key: crypto.randomUUID(), spec, files, exportOptions, exportSources, exportSignature, large: largeOriginals(sources) };
    const current = snapshot;
    saved = false;
    form.hidden = false; $('requestSuccess').hidden = true;
    $('requestOriginals').hidden = true; originalsState = null;
    $('requestStatus').textContent = '';
    $('requestSubmit').textContent = spec.finish === 'none' ? 'ส่งคำขอสั่งพิมพ์' : 'สอบถามราคาเทคนิคพิเศษ';
    $('requestSubmit').disabled = true;
    $('requestPdfDownload').hidden = true;
    $('requestPdfWarnings').textContent = '';
    $('requestConsent').checked = false;
    $('requestArtworkDownloads').replaceChildren();
    for (const [target, source] of [['requestName', 'exportCustomer'], ['requestJobName', 'exportJobName'], ['requestMaterialName', 'exportMaterialName'], ['requestQuantity', 'exportQuantity']]) {
      if ($(source).value.trim()) $(target).value = $(source).value;
    }
    dialog.showModal();
    updatePrice();
    $('requestPdfStatus').textContent = 'กำลัง Export PDF และ SVG ทุกด้านจากดีไซน์นี้…';
    try {
      const { exportFile } = await import('./exportFiles.js');
      if (current.large.length) $('requestPdfStatus').textContent = 'ไฟล์ต้นฉบับมีขนาดใหญ่ — ระบบส่งไฟล์ตัวอย่างขนาดย่อไปกับคำขอ และอัปโหลดไฟล์ต้นฉบับแยกต่างหากหลังส่งคำขอ';
      current.exports ||= await buildArtworkBundle(exportFile, current.large.length ? await referenceSources(current.exportSources) : current.exportSources, current.exportOptions);
      if (generation !== opening || !dialog.open) return;
      if (current.exports.some(file => file.blob.size > MAX_ARTWORK_BYTES)) throw new Error('ไฟล์แต่ละไฟล์ต้องไม่เกิน 10 MB กรุณาลดขนาดภาพต้นฉบับแล้วลองใหม่');
      updateDownloads();
      $('requestPdfStatus').textContent = `เตรียม PDF และ SVG แล้ว ${current.exports.length} ไฟล์ · ${sources.backArt ? 'ด้านหน้าและด้านหลัง' : 'ด้านหน้า'}`;
      $('requestPdfWarnings').textContent = [...new Set(current.exports.flatMap(file => file.plan.checks.filter(check => check.level === 'warn' || check.level === 'note').map(check => `${file.side === 'back' ? 'ด้านหลัง' : 'ด้านหน้า'}: ${check.text}`)))].join(' • ');
      $('requestSubmit').disabled = LOCAL;
    } catch (error) { if (generation === opening && dialog.open) $('requestPdfStatus').textContent = error.message; return; }
    verify().catch(error => { $('requestStatus').textContent = error.message; });
    try {
      [settings, catalog] = await Promise.all([loadPricing(), loadCatalog()]);
      product = findProduct(settings);
      packs = product ? resolveSets(product) : [];
      $('requestPackage').replaceChildren(...packs.map(pack => new Option(pack.name, pack.id)));
      $('requestPackageWrap').hidden = !packs.length;
      updatePrice();
    } catch { $('requestPriceDetail').textContent = 'โหลดราคาไม่สำเร็จ ยังส่งคำขอให้ทีมงานประเมินราคาได้'; }
  });
  for (const [requestId, exportId] of [['requestName', 'exportCustomer'], ['requestJobName', 'exportJobName'], ['requestMaterialName', 'exportMaterialName'], ['requestQuantity', 'exportQuantity']]) {
    $(requestId).addEventListener('input', () => { $(exportId).value = $(requestId).value; updatePrice(); updateDownloads(); });
  }
  $('requestPackage').addEventListener('change', updatePrice);
  dialog.addEventListener('close', () => { opening++; token = ''; for (const url of downloadUrls) URL.revokeObjectURL(url); downloadUrls = []; });
  function close() { if (!submitting && !uploading) dialog.close(); }
  async function sendOriginals() {
    const state = originalsState;
    if (!state || uploading) return;
    const status = $('requestOriginalsStatus'), bar = $('requestOriginalsBar'), retry = $('requestOriginalsRetry');
    $('requestOriginals').hidden = false; retry.hidden = true; bar.hidden = false; bar.value = 0;
    status.textContent = 'กำลังอัปโหลดไฟล์ต้นฉบับ… กรุณาอย่าปิดหน้านี้';
    uploading = true; $('requestClose').disabled = true;
    try {
      await uploadOriginals({ apiRoot: API_ROOT, token: state.token, items: state.items, onProgress: ({ name, loaded, total }) => {
        bar.value = Math.round(loaded / total * 100);
        status.textContent = `กำลังอัปโหลด ${name} ${bar.value}% — กรุณาอย่าปิดหน้านี้`;
      } });
      status.textContent = 'อัปโหลดไฟล์ต้นฉบับครบแล้ว'; bar.hidden = true; originalsState = null;
    } catch (error) {
      status.textContent = `${error.message} — คำขอถูกบันทึกแล้ว กดลองอีกครั้ง หรือส่งไฟล์ให้ร้านทาง LINE พร้อมรหัสคำขอ`; retry.hidden = false; bar.hidden = true;
    } finally { uploading = false; $('requestClose').disabled = false; }
  }
  $('requestOriginalsRetry').addEventListener('click', sendOriginals);
  $('requestLine').addEventListener('click', event => {
    if (!successRequest) return;
    try { downloadBriefImage(successRequest); }
    catch (error) { $('requestStatus').textContent = error.message; }
    if (isDesktop()) {
      event.preventDefault();
      const text = lineRequestText(successRequest.ticketId, requestSummary(successRequest.value));
      copyText(text).then(() => {
        $('requestLineHint').textContent = 'คัดลอกข้อความคำขอแล้ว สแกน QR และวางข้อความพร้อมแนบภาพในแชทได้เลย';
      }).catch(() => {
        $('requestLineHint').textContent = 'สแกน QR เพิ่มเพื่อนร้าน แล้วส่งรหัสคำขอและภาพที่ดาวน์โหลดในแชท';
      });
    }
  });
  $('requestClose').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { if (submitting || uploading) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || LOCAL || !form.reportValidity()) return;
    const value = payload(), errors = validatePrintRequest(value);
    if (errors.length || !token) { $('requestStatus').textContent = errors.join(' • ') || 'กรุณาผ่านการตรวจสอบความปลอดภัย'; return; }
    if (!snapshot.exports || snapshot.exports.some(file => file.blob.size > MAX_ARTWORK_BYTES)) return;
    const fingerprint = JSON.stringify({ ...value, key: '' });
    if (snapshot.submittedFingerprint && snapshot.submittedFingerprint !== fingerprint) { snapshot.key = crypto.randomUUID(); value.key = snapshot.key; }
    snapshot.submittedFingerprint = fingerprint;
    submitting = true; $('requestSubmit').disabled = true; $('requestClose').disabled = true;
    $('requestStatus').textContent = 'กำลังส่งบรีฟภาษาไทยและ PDF / SVG Artwork กรุณารอสักครู่…';
    const previewImage = Promise.resolve(capturePreviewSheet({ includeBack: value.hasBack })).catch(error => {
      console.error('สร้างภาพพรีวิว 3D ไม่สำเร็จ', error);
      return '';
    });
    try {
      const body = new FormData();
      body.append('request', JSON.stringify(value)); body.append('turnstileToken', token);
      for (const file of nameArtworkBundle(snapshot.exports, value)) body.append(file.field, file.blob, file.filename);
      const response = await fetch(`${API_ROOT}/public/print-requests`, { method: 'POST', body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.id) throw new Error(result.error || 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่');
      saved = true; form.hidden = true; $('requestSuccess').hidden = false;
      successRequest = { ticketId: result.id, value };
      $('requestTicket').textContent = result.id;
      if (downloadPreviewImage(await previewImage, result.id, value.jobName)) {
        window.alert('บันทึกภาพการ์ด 3D แล้ว\nกรุณาส่งภาพให้ทีมงานเพื่อเป็นข้อมูลประกอบการพิจารณาวิธีผลิตชิ้นงาน');
      }
      if (snapshot.large.length) {
        if (result.uploadToken) { originalsState = { token: result.uploadToken, items: snapshot.large.map(item => ({ ...item })) }; sendOriginals(); }
        else { $('requestOriginals').hidden = false; $('requestOriginalsStatus').textContent = 'ระบบรับไฟล์ต้นฉบับยังไม่พร้อม — คำขอถูกบันทึกแล้ว กรุณาส่งไฟล์ต้นฉบับให้ร้านทาง LINE พร้อมรหัสคำขอ'; }
      }
      const url = lineRequestUrl(result.id, requestSummary(value));
      $('requestLine').hidden = !url;
      if (url) {
        $('requestLine').href = isDesktop() ? '#requestLineQr' : url;
        if (renderLineQr(url)) $('requestLine').textContent = 'คัดลอกข้อมูลคำขอสำหรับส่งใน LINE';
      }
      $('requestLineHint').hidden = !url;
      if (url) $('requestLineHint').textContent = isDesktop()
        ? 'QR นี้มีเลขอ้างอิงและรายละเอียดงาน เมื่อสแกน LINE จะเตรียมข้อความให้ส่งทันที'
        : 'ระบบจะบันทึกภาพสรุปบรีฟลงเครื่องก่อนเปิด LINE';
      $('requestLinePending').hidden = Boolean(url);
      $('requestStatus').textContent = '';
    } catch (error) {
      $('requestStatus').textContent = `${error.message} — ไฟล์และสเปกยังอยู่ กดส่งอีกครั้งได้`;
    } finally {
      submitting = false; $('requestSubmit').disabled = false; $('requestClose').disabled = false; token = '';
      if (widget !== undefined) window.turnstile?.reset(widget);
    }
  });
}
