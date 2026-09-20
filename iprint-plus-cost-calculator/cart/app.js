import { readCart, removeCartItem, clearCart, CART_KEY } from '../shared/cart.js';
import { resolveCartItems } from '../shared/cart-products.js';
import { cartTotals, VAT_PERCENT } from '../shared/cart-totals.js';
import { loadAvailability, isSelectable, isRushDay, dayLabel } from '../shared/capacity-client.js';
import { money, esc } from '../shared/format.js';
import { buildCartOrder, checkoutIdentity, clearCheckoutIdentity } from '../shared/order-payload.js';
import { submitOrder, rememberOrder } from '../shared/orders-client.js';
import { LOCAL } from '../shared/pricing-client.js';

// Cart shared by every catalog product: list of items -> one delivery date for the whole order ->
// customer, delivery and payment -> review and confirm. Products are priced by their adapters
// (see shared/cart-products.js). Confirming creates ONE real order (a ticket with one item per cart item)
// through POST /public/orders; the customer then follows it on track.html.
const $ = id => document.getElementById(id);
const STEPS = 4;
const TITLES = ['ตะกร้าสินค้า', 'เลือกวันที่รับงาน', 'ข้อมูลผู้สั่งและการจัดส่ง', 'ตรวจสอบและยืนยัน'];
const NEXT_LABELS = ['เลือกวันรับงาน', 'ระบุข้อมูลจัดส่ง', 'ตรวจสอบออร์เดอร์', 'ยืนยันออร์เดอร์'];
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// After a timeout the first request may still be running in the Worker, so sending again right away could race it.
const RETRY_HOLD_MS = 15000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const state = { step: 1, entries: [], totals: cartTotals([]), availability: null, date: '', shipping: 'pickup', removeId: '', submitting: false, holdUntil: 0, widgetId: null, rush: false };

const formatDate = iso => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const setStatus = (message = '') => { $('status').textContent = message; };
const payment = () => document.querySelector('[name="payment"]:checked')?.value || 'transfer';
const customer = () => ({ name: $('customerName').value, phone: $('phone').value, email: $('email').value, lineId: $('lineId').value, address: $('address').value });

// The rush request of the chosen date: { days, multiplier } when the date is earlier than the normal completion date
// and the customer asked for a rush order, otherwise null. The multiplier is the one the Worker offered for that date.
function chosenRush() {
  const day = (state.availability?.days || []).find(item => item.date === state.date);
  return state.rush && isRushDay(day) ? { days: Number(day.boostDays), multiplier: Number(day.boostMultiplier) } : null;
}
const percent = multiplier => Math.round(multiplier * 100);

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
    <div><dt>ราคาสินค้า (${totals.count} รายการ)</dt><dd>฿${money(totals.itemsTotal)}</dd></div>
    ${totals.rushFee > 0 ? `<div class="rush"><dt>ค่าบริการงานด่วน (+${percent(chosenRush()?.multiplier || 0)}%)</dt><dd>+฿${money(totals.rushFee)}</dd></div>` : ''}
    ${totals.discount > 0 ? `<div class="discount"><dt>ส่วนลดที่หักในราคาแล้ว</dt><dd>−฿${money(totals.discount)}</dd></div>` : ''}
    <div><dt>VAT ${VAT_PERCENT}%</dt><dd>฿${money(totals.vat)}</dd></div>
    <div class="total"><dt>ยอดรวม</dt><dd>฿${money(totals.subtotal + totals.vat)}</dd></div>
  </dl><p class="points">ใช้กำลังผลิตรวมทั้งออร์เดอร์ ${money(totals.points)} แต้ม</p>`;
}

function renderCart() {
  state.totals = cartTotals(state.entries, { shipping: state.shipping, rush: chosenRush()?.multiplier || 0 });
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
  $('totalLabel').textContent = state.step === 4 ? 'ยอดชำระสุทธิ' : 'ยอดรวมในตะกร้า';
  $('next').textContent = state.submitting ? 'กำลังสร้างออร์เดอร์…' : NEXT_LABELS[state.step - 1] || '';
  $('next').disabled = state.submitting;
  $('back').disabled = state.submitting;
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
  if (step === 4) prepareReview();
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
    const email = $('email').value.trim();
    if (email && !EMAIL_PATTERN.test(email)) return 'รูปแบบอีเมลไม่ถูกต้อง';
  }
  if (state.step === 4) {
    if (!$('consent').checked) return 'กรุณาติ๊กยืนยันความถูกต้องของข้อมูลก่อนสั่งซื้อ';
    if (!LOCAL && !turnstileToken()) return 'กรุณาผ่านการตรวจสอบความปลอดภัยก่อนยืนยัน';
    if (Date.now() < state.holdUntil) return 'กรุณารอสักครู่ ระบบกำลังตรวจสอบว่าออร์เดอร์ก่อนหน้าถูกสร้างแล้วหรือยัง แล้วกดยืนยันอีกครั้ง';
  }
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
      const selectable = isSelectable(day, { rush: state.rush });
      const rush = selectable && isRushDay(day);
      const classes = [selectable ? 'available' : '', rush ? 'rush' : '', day.date === state.date ? 'selected' : ''].filter(Boolean).join(' ');
      const label = `${formatDate(day.date)} ${rush ? `งานด่วน เร็วขึ้น ${day.boostDays} วัน เพิ่ม ${percent(day.boostMultiplier)}%` : dayLabel(day)}`;
      return `<button type="button" class="${classes}" data-date="${day.date}" ${selectable ? '' : 'disabled'} aria-label="${esc(label)}"><b>${Number(day.date.slice(8))}</b>${rush ? `<small>+${percent(day.boostMultiplier)}%</small>` : ''}</button>`;
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
    if (state.date && !isSelectable((state.availability.days || []).find(day => day.date === state.date), { rush: state.rush })) state.date = '';
    renderDateChoice();
  } catch (error) {
    summary.className = 'capacity-summary error';
    summary.innerHTML = `${esc(error.message || 'โหลดกำลังผลิตไม่สำเร็จ')} <button type="button" id="retryDates">ลองอีกครั้ง</button>`;
  }
}

// Rush levels the customer can buy for this order, with the surcharge in baht (before VAT).
function renderRushLevels() {
  const levels = [...new Map((state.availability?.days || []).filter(isRushDay).map(day => [Number(day.boostDays), Number(day.boostMultiplier)])).entries()].sort((a, b) => a[0] - b[0]);
  const box = $('rushLevels');
  box.hidden = !state.rush;
  if (!state.rush) return;
  box.innerHTML = levels.length
    ? `<b>ราคางานด่วน (ก่อน VAT)</b><ul>${levels.map(([days, multiplier]) => `<li><span>รับเร็วขึ้น ${days} วัน (+${percent(multiplier)}%)</span><strong>+฿${money(cartTotals(state.entries, { rush: multiplier }).rushFee)}</strong></li>`).join('')}</ul>`
    : '<b>ตอนนี้ยังไม่มีวันที่เร่งได้สำหรับออร์เดอร์นี้</b> เลือกจากวันที่ว่างตามปกติได้เลย';
}

function renderDateChoice() {
  renderCart(); // totals first: the summary below shows the surcharge
  const rush = chosenRush();
  $('dateSummary').textContent = state.date ? formatDate(state.date) : 'กรุณาเลือกวันที่';
  $('rushSummary').hidden = !rush;
  $('rushSummary').textContent = rush ? `งานด่วน: รับเร็วขึ้น ${rush.days} วัน • ค่าบริการเพิ่ม +${percent(rush.multiplier)}% (+฿${money(state.totals.rushFee)} ก่อน VAT)` : '';
  renderRushLevels();
  renderCalendar();
}

// ---------- step 4: review, security check, create the order ----------
function turnstileToken() {
  return state.widgetId !== null ? window.turnstile?.getResponse(state.widgetId) || '' : '';
}

function loadTurnstileScript() {
  if (window.turnstile || document.querySelector(`script[src="${TURNSTILE_SRC}"]`)) return;
  const script = document.createElement('script');
  script.src = TURNSTILE_SRC;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

function renderTurnstile() {
  const box = $('turnstileBox');
  if (LOCAL) { box.textContent = 'Local Preview • การตรวจสอบความปลอดภัยทำงานเมื่อเปิดบน iprint.tchl.online'; return; }
  if (state.widgetId !== null) { window.turnstile?.reset(state.widgetId); return; }
  const siteKey = window.IPRINT_CONFIG?.turnstileSiteKey;
  if (!siteKey) { box.textContent = 'ระบบตรวจสอบความปลอดภัยยังไม่ได้ตั้งค่า กรุณาติดต่อทีมงาน'; return; }
  loadTurnstileScript();
  const mount = attempts => {
    if (window.turnstile) {
      state.widgetId = window.turnstile.render(box, { sitekey: siteKey, action: 'create_order', theme: 'light' });
    } else if (attempts > 0) {
      setTimeout(() => mount(attempts - 1), 250);
    } else {
      box.textContent = 'โหลดระบบตรวจสอบความปลอดภัยไม่สำเร็จ กรุณารีเฟรชหน้านี้';
    }
  };
  mount(40);
}

function prepareReview() {
  const info = customer();
  $('reviewList').innerHTML = state.entries.map(entry => `<article class="cart-item review-item"><div><b class="cart-title">${esc(entry.title)}</b>${entry.spec ? `<p>${esc(entry.spec)}</p>` : ''}${entry.promotion ? `<p class="cart-promo">โค้ด ${esc(entry.promoCode)} · ${esc(entry.promotion)}</p>` : ''}</div><strong class="cart-price">฿${money(entry.price)}</strong></article>`).join('');
  const rows = [
    ['วันรับงาน', `${formatDate(state.date)} (ยังไม่รวมระยะเวลาจัดส่ง)`],
    chosenRush() && ['งานด่วน', `รับเร็วขึ้น ${chosenRush().days} วัน (+${percent(chosenRush().multiplier)}%)`],
    ['ผู้สั่ง', info.name.trim()],
    ['เบอร์โทร', info.phone.trim()],
    info.email.trim() && ['อีเมล', info.email.trim()],
    info.lineId.trim() && ['LINE ID', info.lineId.trim()],
    ['การรับสินค้า', state.shipping === 'ems' ? `ส่ง EMS ไปที่ ${info.address.trim()}` : 'รับที่หน้าร้าน'],
    ['ชำระเงิน', 'โอนผ่านธนาคาร / Thai QR (ทีมงานส่งข้อมูลให้)']
  ].filter(Boolean);
  $('reviewInfo').innerHTML = rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
  $('reviewTotals').innerHTML = `<dl>
    <div><dt>ราคาสินค้า (${state.totals.count} รายการ)</dt><dd>฿${money(state.totals.itemsTotal)}</dd></div>
    ${state.totals.rushFee > 0 ? `<div class="rush"><dt>ค่าบริการงานด่วน (+${percent(chosenRush().multiplier)}%)</dt><dd>+฿${money(state.totals.rushFee)}</dd></div>` : ''}
    <div><dt>VAT ${VAT_PERCENT}%</dt><dd>฿${money(state.totals.vat)}</dd></div>
    ${state.totals.shippingFee ? `<div><dt>ค่าส่ง EMS (ชำระแยก)</dt><dd>฿${money(state.totals.shippingFee)}</dd></div>` : ''}
    <div class="total"><dt>ยอดชำระสุทธิ</dt><dd>฿${money(state.totals.grand)}</dd></div>
  </dl>`;
  renderTurnstile();
}

function showDone({ result, order }) {
  rememberOrder({ id: result.id, quoteNo: order.quoteNo, createdAt: new Date().toISOString(), itemCount: order.orderItems.length, total: order.grandTotal, date: state.date, testMode: result.testMode });
  clearCart();
  clearCheckoutIdentity();
  const trackUrl = `track.html?id=${encodeURIComponent(result.id)}`;
  $('doneSheet').innerHTML = `<span class="eyebrow">ORDER RECEIVED</span><h1>${result.duplicate ? 'พบออร์เดอร์นี้ในระบบแล้ว' : 'รับออร์เดอร์เรียบร้อย'}</h1>
    <p>ทีมงานจะติดต่อกลับเพื่อแจ้งวิธีชำระเงินและยืนยันยอดก่อนเริ่มผลิต</p>
    <div class="price-box"><span>เลขอ้างอิงออร์เดอร์</span><strong class="done-id">${esc(order.quoteNo)}</strong><span>${order.orderItems.length} รายการ • รับงาน ${esc(formatDate(state.date))} (ยังไม่รวมระยะเวลาจัดส่ง)</span>${order.orderItems[0]?.boost ? `<span>งานด่วน: เร็วขึ้น ${order.orderItems[0].boost.days} วัน (+${percent(order.orderItems[0].boost.multiplier)}%)</span>` : ''}<span>ยอดสุทธิ ฿${money(order.grandTotal)}${state.shipping === 'ems' ? ' (ยังไม่รวมค่าส่ง EMS ฿50)' : ''}</span></div>
    ${result.testMode ? '<p class="mock-note">โหมดทดลองบนเครื่องนี้: ออร์เดอร์ยังไม่ได้ถูกส่งเข้าระบบจริง</p>' : ''}
    <a class="add-more primary-link" href="${trackUrl}">ติดตามสถานะออร์เดอร์</a>
    <a class="add-more" href="../catalog/">กลับไป Catalog</a>`;
  goto(5);
}

// What to do after each kind of failure (see OrderError.action in shared/orders-client.js).
async function handleFailure(error) {
  const message = error.message || 'สร้างออร์เดอร์ไม่สำเร็จ';
  if (error.code === 'TIMEOUT') state.holdUntil = Date.now() + RETRY_HOLD_MS;
  if (state.widgetId !== null) window.turnstile?.reset(state.widgetId);
  if (error.action === 'reprice') {
    await loadCart();
    goto(1);
  } else if (error.action === 'redate') {
    state.date = '';
    goto(2);
  }
  setStatus(message);
}

async function confirmOrder() {
  if (state.submitting) return;
  const problem = validate();
  if (problem) { setStatus(problem); return; }
  state.submitting = true;
  renderFooter();
  setStatus('กำลังสร้างออร์เดอร์และจองคิวผลิต…');
  try {
    const rush = chosenRush();
    const identity = checkoutIdentity(state.entries, state.date, rush?.days || 0);
    const order = buildCartOrder({
      entries: state.entries, customer: customer(), deliveryDate: state.date, shipping: state.shipping, payment: payment(), rush,
      orderKey: identity.orderKey, quoteNo: identity.quoteNo
    });
    const result = await submitOrder({ order, turnstileToken: turnstileToken() });
    setStatus('');
    showDone({ result, order });
  } catch (error) {
    await handleFailure(error);
  } finally {
    state.submitting = false;
    renderFooter();
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
    renderDateChoice();
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

$('rushToggle').addEventListener('change', () => {
  state.rush = $('rushToggle').checked;
  // Turning rush off drops a rush date: only normal days stay selected.
  if (state.date && !isSelectable((state.availability?.days || []).find(day => day.date === state.date), { rush: state.rush })) state.date = '';
  renderDateChoice();
});

document.querySelectorAll('[name="shipping"]').forEach(radio => radio.addEventListener('change', () => {
  state.shipping = radio.value;
  $('addressHint').textContent = radio.value === 'ems' ? '(จำเป็นเมื่อส่ง EMS)' : '(ไม่ต้องกรอกถ้ารับที่หน้าร้าน)';
  renderCart();
}));

$('next').addEventListener('click', () => {
  if (state.step === STEPS) { confirmOrder(); return; }
  const problem = validate();
  if (problem) { setStatus(problem); return; }
  goto(state.step + 1);
});
$('back').addEventListener('click', () => { if (state.step > 1 && !state.submitting) goto(state.step - 1); });
addEventListener('storage', event => { if (event.key === CART_KEY && state.step === 1) loadCart(); });

await loadCart();
goto(1);
