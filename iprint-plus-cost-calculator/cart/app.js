import { readCart, removeCartItem, clearCart, CART_KEY } from '../shared/cart.js';
import { resolveCartItems } from '../shared/cart-products.js';
import { cartTotals, VAT_PERCENT } from '../shared/cart-totals.js';
import { loadAvailability, isSelectable, dayLabel } from '../shared/capacity-client.js';
import { money, esc } from '../shared/format.js';

// Cart shared by every catalog product: list of items -> one delivery date for the whole order ->
// address and payment -> payment slip. Products are priced by their adapters (see shared/cart-products.js).
// The last step is still a demo: it does not create the order in the production system yet.
const $ = id => document.getElementById(id);
const STEPS = 4;
const TITLES = ['ตะกร้าสินค้า', 'เลือกวันที่รับงาน', 'ชำระเงินและระบุที่อยู่จัดส่ง', 'ส่งหลักฐานชำระเงิน'];
const NEXT_LABELS = ['เลือกวันรับงาน', 'เลือกวิธีจัดส่ง', 'ยืนยันและไปชำระเงิน', 'ยืนยันการแจ้งชำระเงิน'];

const state = { step: 1, entries: [], totals: cartTotals([]), availability: null, date: '', shipping: 'pickup', slip: null, removeId: '' };

const formatDate = iso => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const setStatus = (message = '') => { $('status').textContent = message; };
const payment = () => document.querySelector('[name="payment"]:checked')?.value || '';
const isCash = () => payment() === 'เงินสด';

// ---------- step 1: items ----------
function itemHtml(entry) {
  const failed = entry.problems.length > 0;
  const price = failed ? '<strong class="cart-price">—</strong>'
    : `<strong class="cart-price">฿${money(entry.price)}${entry.discount > 0 ? `<small>฿${money(entry.price + entry.discount)}</small>` : ''}</strong>`;
  return `<article class="cart-item ${failed ? 'has-problem' : ''}" data-item="${esc(entry.id)}">
    <div>
      <b class="cart-title">${esc(entry.title)}</b>
      ${entry.spec ? `<p>${esc(entry.spec)}</p>` : ''}
      ${entry.promotion ? `<p class="cart-promo">โค้ด ${esc(entry.promoCode)} · ${esc(entry.promotion)} −฿${money(entry.discount)}</p>` : ''}
      ${entry.note ? `<p class="cart-note">${esc(entry.note)}</p>` : ''}
      ${entry.problems.map(problem => `<p class="cart-problem">${esc(problem)}${entry.editUrl ? ' กรุณาแก้ไขหรือลบรายการนี้' : ''}</p>`).join('')}
      ${price}
    </div>
    <div class="cart-actions">
      ${entry.editUrl ? `<a href="${esc(entry.editUrl)}">แก้ไข</a>` : ''}
      <button type="button" data-remove="${esc(entry.id)}">ลบ</button>
    </div>
  </article>`;
}

function renderTotals() {
  const totals = state.totals;
  $('cartTotals').hidden = !state.entries.length;
  $('cartTotals').innerHTML = `<dl>
    <div><dt>ราคาสินค้า (${totals.count} รายการ)</dt><dd>฿${money(totals.subtotal)}</dd></div>
    ${totals.discount > 0 ? `<div class="discount"><dt>ส่วนลดที่หักในราคาแล้ว</dt><dd>−฿${money(totals.discount)}</dd></div>` : ''}
    <div><dt>VAT ${VAT_PERCENT}%</dt><dd>฿${money(totals.vat)}</dd></div>
    <div class="total"><dt>ยอดรวม</dt><dd>฿${money(totals.subtotal + totals.vat)}</dd></div>
  </dl><p class="points">ใช้กำลังผลิตรวมทั้งออร์เดอร์ ${money(totals.points)} แต้ม</p>`;
}

function renderCart() {
  state.totals = cartTotals(state.entries, { shipping: state.shipping });
  $('cartHeadingCount').textContent = state.entries.length ? `(${state.entries.length} รายการ)` : '';
  $('emptyCart').hidden = state.entries.length > 0;
  $('cartList').innerHTML = state.entries.map(itemHtml).join('');
  renderTotals();
  renderFooter();
}

async function loadCart() {
  const items = readCart().items;
  $('cartList').innerHTML = items.length ? '<p class="empty-cart">กำลังคำนวณราคา…</p>' : '';
  state.entries = await resolveCartItems(items);
  renderCart();
}

// ---------- footer / steps ----------
function renderFooter() {
  const withShipping = state.step >= 3;
  $('grandTotal').textContent = `฿${money(withShipping ? state.totals.grand : state.totals.subtotal + state.totals.vat)}`;
  $('transferTotal').textContent = `฿${money(state.totals.grand)}`;
  $('totalLabel').textContent = state.step === 4 ? 'ยอดชำระสุทธิ' : 'ยอดรวมในตะกร้า';
  $('next').textContent = NEXT_LABELS[state.step - 1] || '';
  $('back').hidden = state.step === 1 || state.step === 5;
  $('checkoutBar').hidden = state.step === 5;
}

function goto(step) {
  state.step = step;
  document.querySelectorAll('.step').forEach(section => { section.hidden = Number(section.dataset.step) !== step; });
  $('progress').innerHTML = Array.from({ length: STEPS }, (unused, index) => `<span class="${index + 1 <= step ? 'active' : ''}"></span>`).join('');
  $('stepLabel').textContent = step <= STEPS ? `${step} / ${STEPS}` : '';
  $('pageTitle').textContent = TITLES[step - 1] || 'สั่งซื้อเรียบร้อย';
  if (step === 2) loadDates();
  if (step === 4) $('quoteNo').textContent = `เลขอ้างอิง: #IP-${Date.now().toString().slice(-5)}`;
  renderFooter();
  setStatus('');
  scrollTo({ top: 0, behavior: 'smooth' });
}

function validate() {
  if (state.step === 1) {
    if (!state.entries.length) return 'ตะกร้ายังว่างอยู่';
    if (state.entries.some(entry => entry.problems.length)) return 'มีรายการที่ต้องแก้ไขหรือลบก่อนสั่งซื้อ';
  }
  if (state.step === 2 && !state.date) return 'กรุณาเลือกวันที่ต้องการรับงาน';
  if (state.step === 3) {
    if (!$('customerName').value.trim() || !$('phone').value.trim()) return 'กรุณากรอกชื่อและเบอร์โทร';
    if (state.shipping === 'ems' && !$('address').value.trim()) return 'กรุณากรอกที่อยู่จัดส่ง';
    if (state.shipping === 'ems' && isCash()) return 'เงินสดใช้ได้เฉพาะรับสินค้าที่หน้าร้าน';
  }
  if (state.step === 4 && !isCash() && !state.slip) return 'กรุณาแนบหลักฐานการชำระเงิน';
  return '';
}

// ---------- step 2: one delivery date for the whole order ----------
function renderCalendar() {
  const days = state.availability?.days || [];
  const months = new Map();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(day);
  }
  $('calendar').innerHTML = [...months].map(([key, list]) => {
    const first = new Date(`${list[0].date}T00:00:00`);
    const title = first.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    const blanks = '<span></span>'.repeat(first.getDay());
    const cells = list.map(day => {
      const selectable = isSelectable(day);
      const classes = [selectable ? 'available' : '', day.date === state.date ? 'selected' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${classes}" data-date="${day.date}" ${selectable ? '' : 'disabled'} aria-label="${esc(`${formatDate(day.date)} ${dayLabel(day)}`)}"><b>${Number(day.date.slice(8))}</b></button>`;
    }).join('');
    return `<div class="month"><b>${esc(title)}</b><div class="calendar">${blanks}${cells}</div></div>`;
  }).join('');
}

async function loadDates() {
  const { points, count } = state.totals;
  const summary = $('capacitySummary');
  summary.className = 'capacity-summary';
  summary.textContent = 'กำลังตรวจคิวล่าสุด…';
  $('calendar').innerHTML = '';
  try {
    state.availability = await loadAvailability({ points });
    const recommended = state.availability.recommendedDate;
    summary.textContent = recommended
      ? `วันแนะนำเร็วที่สุด ${formatDate(recommended)} • ใช้กำลังผลิตรวม ${money(points)} แต้ม จาก ${count} รายการ`
      : 'ยังไม่พบวันที่รองรับงานทั้งออร์เดอร์นี้ กรุณาติดต่อทีมงาน';
    if (state.date && !isSelectable((state.availability.days || []).find(day => day.date === state.date))) state.date = '';
    $('dateSummary').textContent = state.date ? formatDate(state.date) : 'กรุณาเลือกวันที่';
    renderCalendar();
  } catch (error) {
    summary.className = 'capacity-summary error';
    summary.innerHTML = `${esc(error.message || 'โหลดกำลังผลิตไม่สำเร็จ')} <button type="button" id="retryDates">ลองอีกครั้ง</button>`;
  }
}

// ---------- events ----------
document.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    const entry = state.entries.find(item => item.id === remove.dataset.remove);
    state.removeId = remove.dataset.remove;
    $('removeText').textContent = `“${entry?.title || 'รายการนี้'}” จะถูกนำออกจากตะกร้า`;
    $('removeDialog').returnValue = '';
    $('removeDialog').showModal();
    return;
  }
  const day = event.target.closest('[data-date]');
  if (day) {
    state.date = day.dataset.date;
    $('dateSummary').textContent = formatDate(state.date);
    renderCalendar();
    return;
  }
  if (event.target.closest('#retryDates')) loadDates();
});

$('removeDialog').addEventListener('close', () => {
  if ($('removeDialog').returnValue !== 'confirm' || !state.removeId) return;
  removeCartItem(state.removeId);
  state.removeId = '';
  loadCart();
});

document.querySelectorAll('[name="shipping"]').forEach(radio => radio.addEventListener('change', () => {
  state.shipping = radio.value;
  $('addressHint').textContent = radio.value === 'ems' ? '(จำเป็นเมื่อส่ง EMS)' : '(ไม่ต้องกรอกถ้ารับที่หน้าร้าน)';
  renderCart();
}));

$('pickSlip').addEventListener('click', () => $('paymentSlip').click());
$('paymentSlip').addEventListener('change', event => {
  state.slip = event.target.files[0] || null;
  if (!state.slip) return;
  $('slipPreview').hidden = false;
  $('slipPreview').innerHTML = `<img src="${URL.createObjectURL(state.slip)}" alt="หลักฐานการชำระเงิน"><b>${esc(state.slip.name)}</b>`;
  $('pickSlip').hidden = true;
});

function confirmOrder() {
  const id = `IP-${Date.now().toString().slice(-6)}`;
  const summary = { id, itemCount: state.totals.count, total: state.totals.grand, date: state.date, shipping: state.shipping, payment: payment() };
  try { localStorage.setItem('iprint-last-order', JSON.stringify(summary)); } catch { /* the confirmation is still shown */ }
  clearCart();
  $('doneSheet').innerHTML = `<span class="eyebrow">ORDER RECEIVED</span><h1>รับแจ้งชำระเงินแล้ว</h1><p>ทีมงานจะตรวจสอบหลักฐานและยืนยันออร์เดอร์</p>
    <div class="price-box"><span>หมายเลขออร์เดอร์</span><strong class="done-id">${esc(id)}</strong><span>${summary.itemCount} รายการ • รับงาน ${esc(formatDate(state.date))}</span></div>
    <p class="mock-note">โหมดทดลอง: ออร์เดอร์นี้ยังไม่ได้ถูกส่งเข้าระบบผลิตจริง</p>
    <a class="add-more" href="../catalog/">กลับไป Catalog</a>`;
  goto(5);
}

$('next').addEventListener('click', () => {
  const problem = validate();
  if (problem) { setStatus(problem); return; }
  if (state.step < STEPS) goto(state.step + 1);
  else confirmOrder();
});
$('back').addEventListener('click', () => { if (state.step > 1) goto(state.step - 1); });
addEventListener('storage', event => { if (event.key === CART_KEY && state.step === 1) loadCart(); });

await loadCart();
goto(1);
