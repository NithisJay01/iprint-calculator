import { fetchTicketStatus, rememberedOrders, customerStatusLabel, paymentStatusLabel, itemStatusLabel, trackingIdFrom } from '../shared/orders-client.js';
import { esc } from '../shared/format.js';
import { friendlyError } from '../shared/errors.js';
import { LINE_ADD_URL } from '../shared/print-request.js';

// Customer-facing tracking page. The Worker answers with statuses only (no prices, no personal data).
const $ = id => document.getElementById(id);
const formatDateTime = iso => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const formatDay = iso => {
  const date = new Date(String(iso).length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

function ticketHtml({ ticket, items, testMode }, id) {
  return `<span class="eyebrow">ORDER STATUS</span>
    <h1>${esc(ticket.title || 'ออร์เดอร์')}</h1>
    <div class="track-badges"><span class="badge">${esc(customerStatusLabel(ticket.customerStatus))}</span><span class="badge soft">${esc(paymentStatusLabel(ticket.paymentStatus))}</span></div>
    ${ticket.createdAt ? `<p class="track-meta">สั่งเมื่อ ${esc(formatDateTime(ticket.createdAt))}</p>` : ''}
    ${testMode ? '<p class="mock-note">โหมดทดลองบนเครื่องนี้: ไม่ได้เชื่อมต่อระบบจริง</p>' : ''}
    <div class="track-items">${(items || []).map(item => `<article class="cart-item">
      <div><b class="cart-title">${esc(item.title)}</b>
      <p>${esc(itemStatusLabel(item.status))}${item.productionStatus && item.productionStatus !== 'WAITING' ? ` • ผลิต: ${esc(itemStatusLabel(item.productionStatus))}` : ''}</p>
      ${item.estimatedCompletion ? `<p>กำหนดรับงาน ${esc(formatDay(item.estimatedCompletion))}</p>` : ''}</div>
    </article>`).join('')}</div>
    <button type="button" class="add-more" id="refresh">รีเฟรชสถานะ</button>`;
}

async function showTicket(id) {
  $('status').textContent = '';
  $('trackSheet').innerHTML = '<p class="empty-cart">กำลังโหลดสถานะ…</p>';
  try {
    $('trackSheet').innerHTML = ticketHtml(await fetchTicketStatus(id), id);
    $('refresh').addEventListener('click', () => showTicket(id));
  } catch (error) {
    $('trackSheet').innerHTML = '';
    $('status').textContent = friendlyError(error, 'โหลดสถานะไม่สำเร็จ กรุณาลองใหม่ หรือติดต่อทีมงานทาง LINE');
    showLookup();
  }
}

// No order in the link: let the customer paste the order number or tracking link, and say where to get help.
function showLookup() {
  const hasRecent = rememberedOrders().length > 0;
  const sheet = $('trackSheet');
  sheet.innerHTML = `<h1>ติดตามออร์เดอร์</h1>
    <p class="track-intro">${hasRecent ? 'กรอกเลขติดตามหรือวางลิงก์ติดตาม หรือเลือกจากออร์เดอร์ที่สั่งจากเครื่องนี้ด้านล่าง' : 'กรอกเลขติดตามหรือวางลิงก์ติดตามที่ได้รับหลังสั่งซื้อ'}</p>
    <form id="lookupForm" class="track-lookup" novalidate>
      <label for="trackingInput">เลขติดตามหรือลิงก์ติดตาม</label>
      <input id="trackingInput" autocomplete="off" spellcheck="false" placeholder="เช่น 1a2b3c4d-… หรือวางลิงก์ทั้งหมด" aria-describedby="trackingError">
      <small class="field-error" id="trackingError" hidden></small>
      <button type="submit">ดูสถานะ</button>
    </form>
    <p class="track-help">หาเลขติดตามไม่เจอ? <a href="${esc(LINE_ADD_URL)}" target="_blank" rel="noopener">ติดต่อทีมงานทาง LINE</a></p>`;
  $('lookupForm').addEventListener('submit', event => {
    event.preventDefault();
    const input = $('trackingInput');
    const ticketId = trackingIdFrom(input.value);
    if (!ticketId) {
      $('trackingError').textContent = input.value.trim() ? 'ไม่พบเลขติดตามในข้อความนี้ กรุณาตรวจสอบแล้วลองใหม่' : 'กรุณากรอกเลขติดตามหรือวางลิงก์ติดตาม';
      $('trackingError').hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    history.replaceState(null, '', `track.html?id=${encodeURIComponent(ticketId)}`);
    showTicket(ticketId);
  });
  $('trackingInput').addEventListener('input', () => { $('trackingError').hidden = true; $('trackingInput').removeAttribute('aria-invalid'); });
}

function showRecent() {
  const orders = rememberedOrders();
  $('recentSheet').hidden = !orders.length;
  $('recentList').innerHTML = orders.map(order => `<article class="cart-item"><div><b class="cart-title">${esc(order.quoteNo || order.id)}</b><p>${order.itemCount || 0} รายการ${order.date ? ` • รับงาน ${esc(formatDay(order.date))}` : ''}</p></div><div class="cart-actions"><a href="track.html?id=${encodeURIComponent(order.id)}">ดูสถานะ</a></div></article>`).join('');
}

const id = new URLSearchParams(location.search).get('id');
showRecent();
if (id) await showTicket(id);
else showLookup();
