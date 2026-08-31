const LAST_ORDER_STORAGE_KEY = IPRINT_TEST_MODE ? 'iprint_test_last_order_v1' : 'iprint_last_order_v1';

const WORKFLOW_LABELS = {
  NEW: 'งานใหม่',
  GRAPHIC_ACCEPTED: 'กราฟิกรับงาน',
  FILE_CHECK: 'ตรวจไฟล์',
  NEEDS_INFO: 'รอข้อมูลเพิ่ม',
  DESIGNING: 'กำลังจัดทำไฟล์',
  PROOF_READY: 'รออนุมัติ Proof',
  REVISION_REQUESTED: 'แก้ไข Proof',
  APPROVED: 'อนุมัติแล้ว',
  PRODUCTION_QUEUED: 'เข้าคิวผลิต',
  IN_PRODUCTION: 'กำลังผลิต',
  QC: 'ตรวจ QC',
  REWORK: 'แก้ไขงานผลิต',
  READY: 'พร้อมส่ง/รับ',
  DELIVERED: 'ส่งมอบแล้ว'
};

const WORKFLOW_TRANSITIONS = {
  NEW: ['GRAPHIC_ACCEPTED'],
  GRAPHIC_ACCEPTED: ['FILE_CHECK'],
  FILE_CHECK: ['NEEDS_INFO', 'DESIGNING'],
  NEEDS_INFO: ['FILE_CHECK'],
  DESIGNING: ['PROOF_READY'],
  PROOF_READY: ['REVISION_REQUESTED', 'APPROVED'],
  REVISION_REQUESTED: ['DESIGNING'],
  APPROVED: ['PRODUCTION_QUEUED'],
  PRODUCTION_QUEUED: ['IN_PRODUCTION'],
  IN_PRODUCTION: ['QC'],
  QC: ['REWORK', 'READY'],
  REWORK: ['IN_PRODUCTION'],
  READY: ['DELIVERED'],
  DELIVERED: []
};

function workflowEscape(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeTicketId(value) {
  const raw = String(value || '').trim();
  const uuid = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0];

  const compact = raw.match(/[0-9a-f]{32}/i);
  if (!compact) return raw;

  const id = compact[0];
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

function workflowPhase(status) {
  if (['PRODUCTION_QUEUED', 'IN_PRODUCTION', 'QC', 'REWORK'].includes(status)) return 'PRODUCTION';
  if (status === 'READY') return 'READY';
  if (status === 'DELIVERED') return 'COMPLETED';
  if (status === 'APPROVED') return 'APPROVED';
  return 'GRAPHIC';
}

function workflowProgress(status) {
  if (status === 'DELIVERED') return 4;
  if (status === 'READY') return 3;
  if (['PRODUCTION_QUEUED', 'IN_PRODUCTION', 'QC', 'REWORK'].includes(status)) return 3;
  if (status === 'APPROVED') return 2;
  if (['PROOF_READY', 'REVISION_REQUESTED'].includes(status)) return 2;
  return 1;
}

function readLastOrder() {
  try {
    return JSON.parse(localStorage.getItem(LAST_ORDER_STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function rememberOrder(remote, order) {
  if (!remote?.id) return;

  const reference = {
    ticketId: remote.id,
    url: remote.url || '',
    quoteNo: order?.quoteNo || '',
    customer: order?.customer || '',
    itemCount: Array.isArray(order?.orderItems) ? order.orderItems.length : 0,
    createdAt: new Date().toISOString()
  };

  localStorage.setItem(LAST_ORDER_STORAGE_KEY, JSON.stringify(reference));
  const input = $('workflowTicketId');
  if (input) input.value = reference.ticketId;
}

function setWorkflowStatus(text, kind = '') {
  const status = $('workflowStatus');
  if (!status) return;
  status.textContent = text;
  status.className = 'workflow-status status' + (kind ? ` ${kind}` : '');
}

function renderWorkflow(order) {
  currentWorkflowOrder = order || null;
  const summary = $('workflowTicketSummary');
  const list = $('workflowItemList');

  if (!order?.ticket) {
    summary.hidden = true;
    list.innerHTML = '<div class="workflow-empty">ยังไม่ได้โหลดข้อมูล Ticket</div>';
    return;
  }

  const ticket = order.ticket;
  const reference = readLastOrder();
  if ($('workflowCustomer')) $('workflowCustomer').innerHTML = `<strong>สวัสดี, ${workflowEscape(reference?.customer || 'ลูกค้า')}</strong><br><span>คุณสามารถติดตามความคืบหน้าของงานแต่ละรายการได้ที่นี่</span>`;
  if ($('workflowOrderNumber')) $('workflowOrderNumber').textContent = reference?.quoteNo ? `หมายเลขออเดอร์ ${reference.quoteNo}` : (ticket.title || '');
  summary.hidden = false;
  summary.innerHTML = `<div class="workflow-ticket-head">
    <div><h3>${workflowEscape(ticket.title || 'Iprint Job')}</h3><p>${Number(order.items?.length || 0).toLocaleString('th-TH')} รายการ • อัปเดต ${workflowEscape(ticket.updatedAt || '-')}</p></div>
    <span class="workflow-badge" data-phase="${workflowEscape(workflowPhase(ticket.status))}">${workflowEscape(WORKFLOW_LABELS[ticket.status] || ticket.status || 'ไม่ระบุสถานะ')}</span>
  </div>`;

  if (!Array.isArray(order.items) || !order.items.length) {
    list.innerHTML = '<div class="workflow-empty">Ticket นี้ยังไม่มี Order Items ที่เชื่อมอยู่</div>';
    return;
  }

  list.innerHTML = order.items.map(item => {
    const currentStatus = item.status || 'NEW';
    const transitions = Array.isArray(item.allowedTransitions)
      ? item.allowedTransitions
      : (WORKFLOW_TRANSITIONS[currentStatus] || []);
    const progress = workflowProgress(currentStatus);
    const options = transitions.map(status =>
      `<option value="${workflowEscape(status)}">${workflowEscape(WORKFLOW_LABELS[status] || status)}</option>`
    ).join('');
    const deadlines = [
      item.briefDeadline ? `กำหนดกราฟิก ${formatGregorianDate(item.briefDeadline)}` : '',
      item.deliveryDeadline ? `กำหนดส่ง ${formatGregorianDate(item.deliveryDeadline)}` : ''
    ].filter(Boolean).join(' • ') || 'ยังไม่ได้กำหนด Deadline';
    const variants = Array.isArray(item.variants) ? item.variants : [];
    const detailRows = [
      item.paper ? `กระดาษ: ${workflowEscape(item.paper?.name || item.paper)}` : '',
      item.yield ? `จัดวาง: ${Number(item.yield).toLocaleString('th-TH')} ชิ้น/แผ่น • ใช้ ${Number(item.sheets || 0).toLocaleString('th-TH')} แผ่น` : '',
      variants.length ? `จำนวนแบบ: ${variants.map((variant, index) => `แบบที่ ${index + 1} ${workflowEscape(variant.name || '-')} ${Number(variant.quantity || 0).toLocaleString('th-TH')} ชิ้น`).join(' • ')}` : '',
      item.brief ? `บรีฟ: ${workflowEscape(item.brief)}` : ''
    ].filter(Boolean).join('<br>');

    return `<article class="workflow-item" data-workflow-item-id="${workflowEscape(item.id)}">
      <div class="workflow-item-head">
        <div class="workflow-item-title"><strong>${workflowEscape(item.title || 'Order Item')}</strong><span>${workflowEscape(item.size || '')}${item.quantity ? ` • ${Number(item.quantity).toLocaleString('th-TH')} ${workflowEscape(item.unit || 'ดวง')}` : ''}</span></div>
        <span class="workflow-badge" data-phase="${workflowEscape(item.phase || workflowPhase(currentStatus))}">${workflowEscape(WORKFLOW_LABELS[currentStatus] || currentStatus)}</span>
      </div>
      <div class="workflow-progress" aria-label="ความคืบหน้า ${progress} จาก 4"><span class="active"></span><span class="${progress >= 2 ? 'active' : ''}"></span><span class="${progress >= 3 ? 'active' : ''}"></span><span class="${progress >= 4 ? 'active' : ''}"></span></div>
      <div class="workflow-current-step"><small>ขั้นตอนปัจจุบัน</small><div class="workflow-step-row"><span>${workflowEscape(deadlines)}</span><strong>${workflowEscape(WORKFLOW_LABELS[currentStatus] || currentStatus)}</strong></div></div>
      <details class="workflow-details"><summary>ดูรายละเอียด</summary><div class="workflow-item-meta">${detailRows || 'ไม่มีรายละเอียดเพิ่มเติม'}</div></details>
      ${transitions.length ? `<div class="workflow-update">
        <select data-workflow-next aria-label="สถานะถัดไป">${options}</select>
        <input data-workflow-note maxlength="500" placeholder="หมายเหตุ เช่น จุดที่ต้องแก้ หรือผล QC">
        <button type="button" data-workflow-action="update">อัปเดต</button>
      </div>` : '<div class="workflow-item-done">รายการนี้ส่งมอบเรียบร้อยแล้ว</div>'}
    </article>`;
  }).join('');
}

async function loadWorkflow() {
  const input = $('workflowTicketId');
  const ticketId = normalizeTicketId(input?.value || readLastOrder()?.ticketId || '');

  if (!ticketId) {
    setWorkflowStatus('กรุณาใส่ Ticket ID หรือสร้างออเดอร์ใหม่ก่อน', 'warn');
    renderWorkflow(null);
    return false;
  }

  input.value = ticketId;
  const button = $('refreshWorkflow');
  button.disabled = true;
  button.textContent = 'กำลังโหลด…';
  setWorkflowStatus(IPRINT_TEST_MODE ? 'กำลังโหลดสถานะจาก Mock data…' : 'กำลังดึงสถานะจาก Notion…');

  try {
    const order = await fetchOrderWorkflowRemote(ticketId);
    if (!order?.success) throw new Error(order?.error || 'โหลดสถานะไม่สำเร็จ');
    renderWorkflow(order);
    setWorkflowStatus(IPRINT_TEST_MODE ? 'โหลดสถานะล่าสุดจาก Mock data แล้ว • ไม่เรียก API' : 'อัปเดตสถานะล่าสุดจาก Notion แล้ว', 'ok');
    return true;
  } catch (error) {
    renderWorkflow(null);
    setWorkflowStatus(error.message || String(error), 'warn');
    return false;
  } finally {
    button.disabled = false;
    button.textContent = 'โหลดสถานะ';
  }
}

async function handleWorkflowAction(event) {
  const button = event.target.closest('[data-workflow-action="update"]');
  if (!button) return;

  const card = button.closest('[data-workflow-item-id]');
  const itemId = card?.dataset.workflowItemId;
  const status = card?.querySelector('[data-workflow-next]')?.value || '';
  const note = card?.querySelector('[data-workflow-note]')?.value.trim() || '';
  if (!itemId || !status) return;

  button.disabled = true;
  button.textContent = 'กำลังบันทึก…';
  setWorkflowStatus(`กำลังเปลี่ยนสถานะเป็น ${WORKFLOW_LABELS[status] || status}…`);

  try {
    const result = await updateOrderItemStatusRemote(itemId, status, note);
    if (!result?.success) throw new Error(result?.error || 'อัปเดตสถานะไม่สำเร็จ');
    await loadWorkflow();
  } catch (error) {
    setWorkflowStatus(error.message || String(error), 'warn');
  } finally {
    button.disabled = false;
    button.textContent = 'อัปเดต';
  }
}

function openWorkflow() {
  const reference = readLastOrder();
  if (reference?.ticketId && !$('workflowTicketId').value) {
    $('workflowTicketId').value = reference.ticketId;
  }
  if (typeof showAppView === 'function') showAppView('workflow');
  renderWorkflow(null);
  if ($('workflowTicketId').value) loadWorkflow();
}

function closeWorkflow() {
  if (typeof showAppView === 'function') showAppView('home');
}

function bindWorkflow() {
  if (IPRINT_RESET_TEST_DATA) localStorage.removeItem(LAST_ORDER_STORAGE_KEY);
  const reference = readLastOrder();
  if (reference?.ticketId) $('workflowTicketId').value = reference.ticketId;
  $('openWorkflow')?.addEventListener('click', openWorkflow);
  $('closeWorkflow').addEventListener('click', closeWorkflow);
  $('refreshWorkflow').addEventListener('click', loadWorkflow);
  $('workflowItemList').addEventListener('click', handleWorkflowAction);
}
