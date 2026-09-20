import { fetchTicketStatus, rememberedOrders, customerStatusLabel, paymentStatusLabel, itemStatusLabel } from '../shared/orders-client.js';
import { esc } from '../shared/format.js';

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

function ticketHtml({ ticket, items, testMode }) {
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
    $('trackSheet').innerHTML = ticketHtml(await fetchTicketStatus(id));
    $('refresh').addEventListener('click', () => showTicket(id));
  } catch (error) {
    $('trackSheet').innerHTML = '';
    $('status').textContent = error.message;
  }
}

function showRecent() {
  const orders = rememberedOrders();
  $('recentSheet').hidden = !orders.length;
  $('recentList').innerHTML = orders.map(order => `<article class="cart-item"><div><b class="cart-title">${esc(order.quoteNo || order.id)}</b><p>${order.itemCount || 0} รายการ${order.date ? ` • รับงาน ${esc(formatDay(order.date))}` : ''}</p></div><div class="cart-actions"><a href="track.html?id=${encodeURIComponent(order.id)}">ดูสถานะ</a></div></article>`).join('');
}

const id = new URLSearchParams(location.search).get('id');
showRecent();
if (id) await showTicket(id);
else $('trackSheet').innerHTML = '<h1>ติดตามออร์เดอร์</h1><p class="empty-cart">เปิดลิงก์ติดตามที่ได้รับหลังสั่งซื้อ หรือเลือกจากรายการด้านล่าง</p>';
