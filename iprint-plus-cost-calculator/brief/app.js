import { FIELD_KEYS, FIELD_LABELS, STATUS, STATUS_LABELS, groupBrief, hasBriefContent } from '../shared/brief-model.js';
import { esc } from '../shared/format.js';

// Brief Button V1 (staff): pick a LINE chat -> "สร้างบรีฟ" -> review and edit the Draft Brief -> "Create Ticket".
// Claude only proposes the brief; nothing is created in Notion until the owner confirms in the dialog.
const $ = id => document.getElementById(id);
const API_ROOT = String(window.IPRINT_CONFIG?.apiRoot || '').replace(/\/$/, '');
const KEY_SESSION = 'iprint_write_api_key_session';
const KEY_LOCAL = 'iprint_write_api_key';

const state = { view: 'list', conversations: [], draft: null, editing: false, busy: false };

const STATUS_HINT = {
  confirmed: 'ลูกค้ายืนยันชัดเจนแล้ว',
  need_confirmation: 'มีพูดถึงแต่ยังไม่ชัด',
  missing: 'ยังไม่มีข้อมูล'
};
const GROUPS = [
  { id: 'confirmed', status: STATUS.CONFIRMED },
  { id: 'needConfirmation', status: STATUS.NEED_CONFIRMATION },
  { id: 'missing', status: STATUS.MISSING }
];

const setStatus = (message = '', kind = 'error') => {
  $('status').textContent = message;
  $('status').dataset.kind = kind;
};

function storedKey() {
  try {
    return (sessionStorage.getItem(KEY_SESSION) || localStorage.getItem(KEY_LOCAL) || '').trim();
  } catch {
    return '';
  }
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    cache: 'no-store',
    headers: { 'X-API-Key': storedKey(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    try { sessionStorage.removeItem(KEY_SESSION); } catch { /* storage unavailable */ }
    show('key');
    setStatus('Staff API Key ไม่ถูกต้อง กรุณาลองใหม่');
    throw new ApiError('Staff API Key ไม่ถูกต้อง', 401, data);
  }
  if (!response.ok || data.success === false) throw new ApiError(data.error || `เกิดข้อผิดพลาด (${response.status})`, response.status, data);
  return data;
}

function show(view) {
  state.view = view;
  for (const name of ['key', 'list', 'draft', 'done']) $(`view${name[0].toUpperCase()}${name.slice(1)}`).hidden = name !== view;
  $('actionBar').hidden = view !== 'draft';
  window.scrollTo({ top: 0 });
}

function setBusy(busy, label = '') {
  state.busy = busy;
  document.body.classList.toggle('busy', busy);
  for (const button of document.querySelectorAll('button')) button.disabled = busy;
  if (busy && label) setStatus(label, 'info');
}

// ---------- conversation list ----------
function ago(timestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - Number(timestamp)) / 60000));
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} ชั่วโมงที่แล้ว`;
  return `${Math.round(minutes / (60 * 24))} วันที่แล้ว`;
}

function renderConversations() {
  $('emptyList').hidden = state.conversations.length > 0;
  $('conversations').innerHTML = state.conversations.map(item => `
    <article class="conversation">
      <div>
        <b>${esc(item.displayName || 'ลูกค้า LINE (ไม่ทราบชื่อ)')}</b>
        <span>${esc(ago(item.lastMessageAt))}</span>
        <p>${esc(item.preview || '')}</p>
      </div>
      <button class="primary" type="button" data-brief="${esc(item.id)}">สร้างบรีฟ</button>
    </article>`).join('');
}

async function loadConversations() {
  setBusy(true, 'กำลังโหลดแชท…');
  try {
    state.conversations = (await api('/staff/line/conversations')).conversations;
    setStatus('');
    show('list');
    renderConversations();
  } catch (error) {
    if (error.status !== 401) setStatus(error.message);
  } finally {
    setBusy(false);
  }
}

// ---------- draft brief ----------
const fieldValue = key => state.draft.brief.fields[key];

function chip(status) {
  return `<span class="chip ${status}">${STATUS_LABELS[status]}</span>`;
}

function renderCounts() {
  const groups = groupBrief(state.draft.brief);
  $('groupCounts').innerHTML = GROUPS.map(({ id, status }) =>
    `<span class="count ${status}"><b>${groups[id].length}</b>${STATUS_LABELS[status]}</span>`).join('');
}

function itemRow(key) {
  const field = fieldValue(key);
  const detail = [
    field.evidence && `<small>ลูกค้าพิมพ์ว่า “${esc(field.evidence)}”</small>`,
    field.reason && `<small class="reason">${esc(field.reason)}</small>`
  ].filter(Boolean).join('');
  return `<li><span class="label">${FIELD_LABELS[key]}</span><span class="value">${esc(field.value)}${detail}</span></li>`;
}

function renderReadView() {
  const brief = state.draft.brief;
  const groups = groupBrief(brief);
  const card = ({ id, status }) => {
    const rows = groups[id].map(key => key === 'customer'
      ? `<li><span class="label">Customer</span><span class="value muted">ยังไม่ทราบชื่อลูกค้า</span></li>`
      : status === STATUS.MISSING
        ? `<li><span class="label">${FIELD_LABELS[key]}</span><span class="value muted">ไม่มีข้อมูลในแชท</span></li>`
        : itemRow(key)).join('');
    return `<section class="sheet group ${status}">
      <h2>${chip(status)}<small>${STATUS_HINT[status]}</small></h2>
      ${rows ? `<ul class="items">${rows}</ul>` : '<p class="empty small">ไม่มีรายการ</p>'}
    </section>`;
  };
  return `
    <section class="sheet summary">
      <ul class="items">
        <li><span class="label">Customer</span><span class="value">${esc(brief.customer) || '<span class="muted">-</span>'}</span></li>
        <li><span class="label">Note</span><span class="value">${esc(brief.note) || '<span class="muted">-</span>'}</span></li>
      </ul>
    </section>
    ${GROUPS.map(card).join('')}`;
}

function renderEditView() {
  const brief = state.draft.brief;
  const row = key => {
    const field = fieldValue(key);
    return `<div class="edit-row" data-key="${key}">
      <label for="v-${key}">${FIELD_LABELS[key]}</label>
      <input id="v-${key}" data-value="${key}" value="${esc(field.value)}" maxlength="500" autocomplete="off">
      <select data-status="${key}" aria-label="สถานะของ ${FIELD_LABELS[key]}">
        ${Object.values(STATUS).map(status => `<option value="${status}" ${field.status === status ? 'selected' : ''}>${STATUS_LABELS[status]}</option>`).join('')}
      </select>
      ${field.evidence ? `<small>ลูกค้าพิมพ์ว่า “${esc(field.evidence)}”</small>` : ''}
      ${field.reason ? `<small class="reason">${esc(field.reason)}</small>` : ''}
    </div>`;
  };
  return `<section class="sheet edit">
    <div class="edit-row wide">
      <label for="v-customer">Customer</label>
      <input id="v-customer" data-customer value="${esc(brief.customer)}" maxlength="120" autocomplete="off">
    </div>
    ${FIELD_KEYS.map(row).join('')}
    <div class="edit-row wide">
      <label for="v-note">Note</label>
      <textarea id="v-note" data-note rows="3" maxlength="1500">${esc(brief.note)}</textarea>
    </div>
    <p class="hint">เลือกสถานะให้ตรงความจริง: Confirmed = ลูกค้ายืนยันชัดเจน · ช่องที่ยังไม่มีข้อมูลให้ปล่อยว่างและเป็น Missing</p>
  </section>`;
}

function renderDraft() {
  const { draft } = state;
  $('draftTitle').textContent = draft.brief.customer || 'ลูกค้า LINE';
  $('draftMeta').textContent = `สรุปจาก ${draft.messages.length} ข้อความ · ตรวจและแก้ไขได้ก่อนสร้าง Ticket`;
  $('sourceCount').textContent = `(${draft.messages.length})`;
  $('sourceList').innerHTML = draft.messages.map(message => `<li class="${message.role}">
    <small>${new Date(message.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} · ${message.role === 'owner' ? 'เจ้าของร้าน' : 'ลูกค้า'}</small>
    <span>${esc(message.text)}</span></li>`).join('');
  $('draftBody').innerHTML = state.editing ? renderEditView() : renderReadView();
  $('toggleEdit').textContent = state.editing ? 'เสร็จสิ้นการแก้ไข' : 'แก้ไข';
  renderCounts();
}

async function createBrief(conversationId) {
  setBusy(true, 'กำลังอ่านแชทและสรุปบรีฟ…');
  try {
    const data = await api('/staff/briefs/draft', {
      method: 'POST',
      body: { conversationId, limit: Number($('limit').value), ownerNote: $('ownerNote').value }
    });
    state.draft = data;
    state.editing = false;
    setStatus('');
    show('draft');
    renderDraft();
  } catch (error) {
    if (error.status !== 401) setStatus(error.message);
  } finally {
    setBusy(false);
  }
}

// Edits are written into the draft as the owner types. The page is redrawn only when the shape changes
// (status select, Edit toggle) so typing never loses focus.
function onEdit(event) {
  const target = event.target;
  const brief = state.draft?.brief;
  if (!brief) return;
  if ('customer' in target.dataset) brief.customer = target.value;
  else if ('note' in target.dataset) brief.note = target.value;
  else if (target.dataset.value) {
    const field = brief.fields[target.dataset.value];
    field.value = target.value;
    // Typing into a Missing field means there is something to confirm; clearing a field makes it Missing again.
    const next = !target.value.trim() ? STATUS.MISSING : field.status === STATUS.MISSING ? STATUS.NEED_CONFIRMATION : field.status;
    if (next !== field.status) {
      field.status = next;
      target.closest('.edit-row').querySelector('select').value = next;
    }
  } else if (target.dataset.status) {
    brief.fields[target.dataset.status].status = target.value;
  }
  renderCounts();
}

function confirmText() {
  const groups = groupBrief(state.draft.brief);
  const open = [];
  if (groups.needConfirmation.length) open.push(`${groups.needConfirmation.length} รายการที่ต้องยืนยันกับลูกค้า`);
  if (groups.missing.length) open.push(`${groups.missing.length} รายการที่ยังไม่มีข้อมูล`);
  return open.length
    ? `Ticket จะระบุว่ายังมี ${open.join(' และ ')} เพื่อให้ทีมติดตามต่อ`
    : 'ข้อมูลครบและลูกค้ายืนยันแล้วทุกรายการ';
}

async function submitTicket() {
  setBusy(true, 'กำลังสร้าง Ticket ใน Notion…');
  try {
    // briefKey is fixed per draft, so a retry after a timeout returns the same ticket instead of a second one.
    const data = await api('/staff/briefs/ticket', {
      method: 'POST',
      body: { reviewed: true, briefKey: state.draft.briefKey, brief: state.draft.brief }
    });
    setStatus('');
    $('doneText').textContent = data.deduplicated
      ? 'บรีฟนี้เคยสร้าง Ticket ไว้แล้ว ระบบจึงไม่สร้างซ้ำ'
      : 'ทีมงานเห็นใบงานใหม่ใน Notion แล้ว';
    $('doneLink').hidden = !data.url;
    if (data.url) $('doneLink').href = data.url;
    show('done');
  } catch (error) {
    if (error.status !== 401) setStatus(`สร้าง Ticket ไม่สำเร็จ: ${error.message} (กดสร้างซ้ำได้ ระบบจะไม่สร้างซ้อน)`);
  } finally {
    setBusy(false);
  }
}

// ---------- wiring ----------
$('conversations').addEventListener('click', event => {
  const id = event.target.closest('[data-brief]')?.dataset.brief;
  if (id && !state.busy) createBrief(id);
});
$('draftBody').addEventListener('input', onEdit);
$('draftBody').addEventListener('change', event => {
  onEdit(event);
  if (event.target.dataset.status) renderCounts();
});
$('refresh').addEventListener('click', loadConversations);
$('backToList').addEventListener('click', () => { setStatus(''); show('list'); });
$('doneNew').addEventListener('click', () => { state.draft = null; $('ownerNote').value = ''; loadConversations(); });
$('toggleEdit').addEventListener('click', () => { state.editing = !state.editing; renderDraft(); });

$('createTicket').addEventListener('click', () => {
  if (!hasBriefContent(state.draft.brief)) {
    setStatus('บรีฟยังว่างอยู่ กรอกข้อมูลอย่างน้อยหนึ่งช่องก่อนสร้าง Ticket');
    return;
  }
  $('confirmText').textContent = confirmText();
  $('confirmDialog').showModal();
});
$('confirmCancel').addEventListener('click', () => $('confirmDialog').close());
$('confirmCreate').addEventListener('click', () => {
  $('confirmDialog').close();
  submitTicket();
});

$('keyForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    sessionStorage.setItem(KEY_SESSION, $('keyInput').value.trim());
  } catch {
    setStatus('เบราว์เซอร์ไม่อนุญาตให้จำ API Key ในหน้านี้');
    return;
  }
  $('keyInput').value = '';
  await loadConversations();
});

if (!API_ROOT) setStatus('ยังไม่ได้ตั้งค่า apiRoot ใน js/config.js');
else if (!storedKey()) show('key');
else loadConversations();
