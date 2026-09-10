'use strict';

let availabilityTargetId = '';
let availabilityMonth = '';
let availabilityData = null;
let availabilityRefreshTimer = null;
let pendingAvailabilityBoost = null;
let selectedAvailabilityBoost = null;

function availabilityIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function availabilityAddMonths(month, amount) {
  const date = new Date(`${month}-01T00:00:00`);
  date.setMonth(date.getMonth() + amount);
  return availabilityIso(date).slice(0, 7);
}

function availabilityMonthEnd(month) {
  const date = new Date(`${month}-01T00:00:00`);
  date.setMonth(date.getMonth() + 1, 0);
  return availabilityIso(date);
}

function availabilityCapacityComponent(component, calc) {
  const points = Math.max(0, Number(component?.capacityPoints) || 0);
  if (!points) return 0;
  const basis = String(component?.capacityBasis || 'job').toLowerCase();
  const step = Math.max(1, Number(component?.capacityStep) || 1);
  const workload = basis === 'piece' ? Math.max(0, Number(calc?.Q) || 0)
    : basis === 'sheet' ? Math.max(0, Number(calc?.sheets) || 0) : 1;
  return Math.ceil(workload / step) * points;
}

function currentAvailabilityPoints(calc = typeof lastCalc === 'object' ? lastCalc : null) {
  if (!calc) return 1;
  const explicit = Number(calc.capacityPoints);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit * 100) / 100;
  const material = availabilityCapacityComponent(calc.material, calc);
  const servicePoints = (Array.isArray(calc.services) ? calc.services : [])
    .reduce((sum, service) => sum + availabilityCapacityComponent(service, calc), 0);
  return Math.max(0.25, Math.round((1 + material + servicePoints) * 100) / 100);
}

function availabilityLabel(status) {
  return status === 'AVAILABLE' ? 'รับงานได้'
    : status === 'LIMITED' ? 'คิวใกล้เต็ม'
      : status === 'BOOST' ? 'Boost ได้'
        : status === 'TOO_SOON' ? 'เร็วเกินไป'
        : status === 'FULL' ? 'คิวเต็ม' : 'ปิดรับงาน';
}

function renderAvailability() {
  const grid = $('availabilityGrid');
  if (!grid) return;
  const month = availabilityMonth;
  const first = new Date(`${month}-01T00:00:00`);
  const offset = (first.getDay() + 6) % 7;
  const days = availabilityData?.days || [];
  const byDate = new Map(days.map(day => [day.date, day]));
  const cells = Array.from({ length: offset }, () => '<span class="availability-spacer"></span>');
  const end = Number(availabilityMonthEnd(month).slice(-2));
  for (let day = 1; day <= end; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const info = byDate.get(date);
    const status = info?.availability || 'CLOSED';
    const selectable = info?.bookable === true || Number(info?.boostDays) > 0;
    cells.push(`<button type="button" class="availability-day is-${status.toLowerCase().replace('_', '-')}" data-availability-date="${date}" ${info?.boostDays ? `data-boost-days="${info.boostDays}" data-boost-multiplier="${info.boostMultiplier}"` : ''} ${selectable ? '' : 'disabled'} aria-label="${date} ${availabilityLabel(status)}"><strong>${day}</strong><span>${availabilityLabel(status)}</span></button>`);
  }
  grid.innerHTML = cells.join('');
  const points = Number(availabilityData?.requiredPoints || currentAvailabilityPoints());
  const recommended = availabilityData?.recommendedDate;
  $('availabilitySummary').innerHTML = recommended
    ? `<strong>งานนี้ใช้ประมาณ ${points.toLocaleString('th-TH')} แต้ม</strong><span>วันที่แนะนำเร็วที่สุด ${typeof formatGregorianDate === 'function' ? formatGregorianDate(recommended) : recommended}</span>`
    : `<strong>งานนี้ใช้ประมาณ ${points.toLocaleString('th-TH')} แต้ม</strong><span>ยังไม่พบคิวที่รองรับ กรุณาติดต่อร้าน</span>`;
  $('availabilityMonth').textContent = first.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const currentMonth = availabilityIso().slice(0, 7);
  $('availabilityPrevious').disabled = month <= currentMonth;
  $('availabilityNext').disabled = availabilityAddMonths(month, 1) > availabilityAddMonths(currentMonth, 2);
}

async function loadAvailability() {
  const today = availabilityIso();
  const to = availabilityMonthEnd(availabilityMonth);
  $('availabilityGrid').innerHTML = '<div class="availability-loading">กำลังตรวจสอบคิวล่าสุด…</div>';
  try {
    availabilityData = await fetchPublicCapacityRemote({ from: today, to, points: currentAvailabilityPoints() });
    renderAvailability();
  } catch (error) {
    $('availabilityGrid').innerHTML = `<div class="availability-loading is-error">${workflowEscape(error.message || String(error))}</div>`;
    $('availabilitySummary').textContent = 'โหลดข้อมูลกำลังผลิตไม่สำเร็จ กรุณาลองอีกครั้ง';
  }
}

function closeAvailability() {
  const modal = $('availabilityModal');
  modal?.classList.remove('open');
  modal?.setAttribute('aria-hidden', 'true');
  clearInterval(availabilityRefreshTimer);
  availabilityRefreshTimer = null;
}

function openCapacityCalendar(targetId) {
  availabilityTargetId = String(targetId || 'deliveryDeadline');
  const current = typeof normalizeFlowDateValue === 'function' ? normalizeFlowDateValue($(availabilityTargetId)?.value) : '';
  availabilityMonth = (current || availabilityIso()).slice(0, 7);
  const minimumMonth = availabilityIso().slice(0, 7);
  if (availabilityMonth < minimumMonth) availabilityMonth = minimumMonth;
  $('availabilityModal')?.classList.add('open');
  $('availabilityModal')?.setAttribute('aria-hidden', 'false');
  $('availabilityBoostOffer').hidden = true;
  pendingAvailabilityBoost = null;
  loadAvailability();
  clearInterval(availabilityRefreshTimer);
  availabilityRefreshTimer = setInterval(() => {
    if ($('availabilityModal')?.classList.contains('open')) loadAvailability();
  }, 30000);
}

function selectAvailabilityDate(date, boost = null) {
  const display = $(availabilityTargetId);
  if (!display) return;
  display.value = typeof formatFlowDateInput === 'function' ? formatFlowDateInput(date) : date;
  const native = document.querySelector(`[data-date-for="${availabilityTargetId}"], [data-quiz-date-for="${availabilityTargetId}"]`);
  if (native) native.value = date;
  display.classList.remove('is-invalid');
  display.dispatchEvent(new Event('change', { bubbles: true }));
  selectedAvailabilityBoost = boost ? {
    days: Number(boost.days), multiplier: Number(boost.multiplier), date,
    surcharge: Math.round(((Number(lastCalc?.sale) || 0) * Number(boost.multiplier)) * 100) / 100
  } : null;
  closeAvailability();
}

function showAvailabilityBoost(date, days, multiplier) {
  pendingAvailabilityBoost = { date, days, multiplier };
  const basePrice = Number(lastCalc?.sale) || 0;
  $('availabilityBoostTitle').textContent = `เร่งเร็วขึ้น ${days} วัน`;
  $('availabilityBoostPrice').textContent = `เพิ่ม ${(multiplier * 100).toLocaleString('th-TH')}% • ฿${(basePrice * multiplier).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  $('confirmAvailabilityBoost').textContent = `Boost -${days} วัน`;
  $('availabilityBoostOffer').hidden = false;
  $('availabilityBoostOffer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function verifySelectedCapacityDate(targetId = 'deliveryDeadline') {
  const selected = typeof normalizeFlowDateValue === 'function' ? normalizeFlowDateValue($(targetId)?.value) : '';
  if (!selected) return { success: false, message: 'กรุณาเลือกวันที่รับงาน' };
  try {
    const data = await fetchPublicCapacityRemote({ from: availabilityIso(), to: selected, points: currentAvailabilityPoints() });
    const day = (data.days || []).find(item => item.date === selected);
    if (day?.bookable) return { success: true, day, recommendedDate: data.recommendedDate };
    if (day?.boostDays && selectedAvailabilityBoost?.date === selected && Number(selectedAvailabilityBoost.days) === Number(day.boostDays)) {
      return { success: true, day, recommendedDate: data.recommendedDate, boost: selectedAvailabilityBoost };
    }
    const recommended = data.recommendedDate
      ? ` วันที่เร็วที่สุดที่แนะนำคือ ${typeof formatGregorianDate === 'function' ? formatGregorianDate(data.recommendedDate) : data.recommendedDate}` : '';
    return { success: false, message: `วันที่เลือกไม่สามารถรองรับคิวงานนี้ได้${recommended}` };
  } catch (error) {
    return { success: false, message: `ตรวจสอบคิวล่าสุดไม่สำเร็จ: ${error.message || error}` };
  }
}

function bindAvailability() {
  document.querySelectorAll('[data-date-for="quickDeliveryDeadline"], [data-date-for="deliveryDeadline"], [data-quiz-date-for="quizDeliveryDeadline"]').forEach(input => {
    input.style.pointerEvents = 'none';
    input.tabIndex = -1;
  });
  $('closeAvailability')?.addEventListener('click', closeAvailability);
  $('availabilityModal')?.addEventListener('click', event => { if (event.target === $('availabilityModal')) closeAvailability(); });
  $('availabilityPrevious')?.addEventListener('click', () => { availabilityMonth = availabilityAddMonths(availabilityMonth, -1); loadAvailability(); });
  $('availabilityNext')?.addEventListener('click', () => { availabilityMonth = availabilityAddMonths(availabilityMonth, 1); loadAvailability(); });
  $('availabilityGrid')?.addEventListener('click', event => {
    const button = event.target.closest('[data-availability-date]:not(:disabled)');
    if (!button) return;
    const days = Number(button.dataset.boostDays) || 0;
    if (days) showAvailabilityBoost(button.dataset.availabilityDate, days, Number(button.dataset.boostMultiplier) || days * 0.5);
    else selectAvailabilityDate(button.dataset.availabilityDate);
  });
  $('confirmAvailabilityBoost')?.addEventListener('click', () => {
    if (pendingAvailabilityBoost) selectAvailabilityDate(pendingAvailabilityBoost.date, pendingAvailabilityBoost);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindAvailability, { once: true });
else bindAvailability();

window.openCapacityCalendar = openCapacityCalendar;
window.currentAvailabilityPoints = currentAvailabilityPoints;
window.availabilityCapacityComponent = availabilityCapacityComponent;
window.verifySelectedCapacityDate = verifySelectedCapacityDate;
window.getSelectedAvailabilityBoost = () => selectedAvailabilityBoost ? { ...selectedAvailabilityBoost } : null;
window.setSelectedAvailabilityBoost = value => { selectedAvailabilityBoost = value?.days ? { ...value } : null; };
