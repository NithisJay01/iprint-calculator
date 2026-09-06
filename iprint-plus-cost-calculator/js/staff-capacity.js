'use strict';

const IPRINT_TEST_CAPACITY_KEY = 'iprint_test_daily_capacity_v1';
const IPRINT_TEST_QUEUE_KEY = 'iprint_test_capacity_queue_v1';
let staffCapacityDays = [];
let staffQueueJobs = [];
let staffCapacityMonth = firstCapacityMonth(localCapacityDate(new Date()));
let draggedQueueJobId = '';
let queueDragEndedAt = 0;

function localCapacityDate(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addCapacityDays(date, amount) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + amount);
  return localCapacityDate(value);
}

function firstCapacityMonth(date) {
  return `${String(date).slice(0, 7)}-01`;
}

function addCapacityMonths(date, amount) {
  const value = new Date(`${firstCapacityMonth(date)}T00:00:00`);
  value.setMonth(value.getMonth() + amount);
  return localCapacityDate(value);
}

function capacityCalendarRange(month = staffCapacityMonth) {
  const first = new Date(`${firstCapacityMonth(month)}T00:00:00`);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const mondayOffset = (first.getDay() + 6) % 7;
  const sundayOffset = 6 - ((last.getDay() + 6) % 7);
  return {
    monthKey: localCapacityDate(first).slice(0, 7),
    from: addCapacityDays(localCapacityDate(first), -mondayOffset),
    to: addCapacityDays(localCapacityDate(last), sundayOffset)
  };
}

function defaultCapacityDay(date) {
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const closed = weekday === 0;
  return { id: '', date, dailyCapacity: 20, reservedPoints: 0, availablePoints: closed ? 0 : 20, closed, cutoffTime: '15:00', note: closed ? 'วันหยุดประจำสัปดาห์' : '', status: closed ? 'CLOSED' : 'OPEN', updatedAt: '' };
}

function normalizedCapacityDay(input) {
  const dailyCapacity = Math.max(0, Number(input.dailyCapacity) || 0);
  const reservedPoints = Math.max(0, Number(input.reservedPoints) || 0);
  const closed = input.closed === true;
  const availablePoints = closed ? 0 : Math.max(0, dailyCapacity - reservedPoints);
  return { ...input, dailyCapacity, reservedPoints, availablePoints, closed, cutoffTime: input.cutoffTime || '15:00', note: input.note || '', status: closed ? 'CLOSED' : availablePoints <= 0 ? 'FULL' : 'OPEN' };
}

function testCapacityDays() {
  try { return JSON.parse(localStorage.getItem(IPRINT_TEST_CAPACITY_KEY) || '[]'); } catch { return []; }
}

function capacityText(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function defaultTestQueueJobs() {
  const today = localCapacityDate(new Date());
  let largeJobDate = addCapacityDays(today, 7);
  let largeJobRemaining = 46;
  const largeJobDailyLimit = 10;
  const largeJobSegments = [];
  let allocationIndex = 1;
  while (largeJobRemaining > 0) {
    if (new Date(`${largeJobDate}T00:00:00`).getDay() === 0) {
      largeJobDate = addCapacityDays(largeJobDate, 1);
      continue;
    }
    const points = Math.min(largeJobDailyLimit, largeJobRemaining);
    largeJobSegments.push({
      id: `queue-demo-large-${allocationIndex}`,
      jobId: 'queue-demo-large',
      orderNo: 'IP-260904-BIG',
      customer: 'บริษัท แพ็กเกจจิ้งไทย',
      title: 'กล่องสินค้า Lot ใหญ่',
      points,
      totalPoints: 46,
      allocationIndex,
      allocationCount: Math.ceil(46 / largeJobDailyLimit),
      date: largeJobDate,
      priority: 'NORMAL',
      taskStatus: 'QUEUED',
      brief: 'ผลิตกล่องทั้งหมดใน Lot เดียวกัน คุมสีให้ตรงกันทุกช่วง และรวมส่งเมื่อครบทุกส่วน',
      specs: 'กล่อง Art Card 350 แกรม • 8,000 ชิ้น • เคลือบด้าน • ไดคัทและปะกาว',
      ticketUrl: ''
    });
    largeJobRemaining -= points;
    allocationIndex += 1;
    largeJobDate = addCapacityDays(largeJobDate, 1);
  }
  return [
    { id: 'queue-demo-1', orderNo: 'IP-260904-01', customer: 'บริษัท เอ บี ซี', title: 'สติกเกอร์ PP ไดคัท', points: 6, date: today, priority: 'NORMAL', taskStatus: 'IN_PROGRESS', brief: 'พิมพ์สีตามไฟล์ ตัดไดคัทตามเส้นสีชมพู และแพ็กถุงละ 100 ชิ้น', specs: 'PP ขาวเงา • 1,000 ชิ้น • เคลือบด้าน • ไดคัท', ticketUrl: '' },
    { id: 'queue-demo-2', orderNo: 'IP-260904-02', customer: 'คุณพิมพ์ชนก', title: 'นามบัตรเคลือบด้าน', points: 4, date: today, priority: 'URGENT', taskStatus: 'QUEUED', brief: 'ตรวจชื่อและเบอร์โทรก่อนผลิต ลูกค้าขอรับช่วงเย็น', specs: 'Art Card 300 แกรม • 500 ใบ • พิมพ์สองหน้า • เคลือบด้าน', ticketUrl: '' },
    { id: 'queue-demo-3', orderNo: 'IP-260904-03', customer: 'ร้านบ้านกาแฟ', title: 'เมนูอาหาร A4', points: 8, date: addCapacityDays(today, 1), priority: 'NORMAL', taskStatus: 'QUEUED', brief: 'ปรับสีภาพอาหารให้อุ่นขึ้นและเว้นขอบเย็บเล่มด้านซ้าย', specs: 'กระดาษอาร์ต 160 แกรม • 40 ชุด • เคลือบด้าน', ticketUrl: '' },
    { id: 'queue-demo-4', orderNo: 'IP-260904-04', customer: 'บริษัท เมโทร', title: 'โบรชัวร์พับสามตอน', points: 12, date: addCapacityDays(today, 3), priority: 'NORMAL', taskStatus: 'QUEUED', brief: 'พับสามตอนตาม Mockup และตรวจตำแหน่ง QR Code ก่อนผลิต', specs: 'A4 • 2,000 แผ่น • พิมพ์สองหน้า • พับสามตอน', ticketUrl: '' },
    ...largeJobSegments
  ];
}

function testQueueJobs() {
  try {
    const saved = localStorage.getItem(IPRINT_TEST_QUEUE_KEY);
    if (saved) return JSON.parse(saved);
    const jobs = defaultTestQueueJobs();
    localStorage.setItem(IPRINT_TEST_QUEUE_KEY, JSON.stringify(jobs));
    return jobs;
  } catch { return defaultTestQueueJobs(); }
}

function queueJobsForDate(date) {
  return staffQueueJobs.filter(job => job.date === date);
}

function queueTaskStatus(value) {
  return ['QUEUED', 'IN_PROGRESS', 'COMPLETED'].includes(value) ? value : 'QUEUED';
}

function queueTaskStatusLabel(value) {
  const status = queueTaskStatus(value);
  return status === 'IN_PROGRESS' ? 'กำลังผลิต' : status === 'COMPLETED' ? 'เสร็จแล้ว' : 'รอผลิต';
}

function queuePointsForDate(date) {
  return queueJobsForDate(date).reduce((sum, job) => sum + Math.max(0, Number(job.points) || 0), 0);
}

function capacityDayForDate(date) {
  const stored = staffCapacityDays.find(day => day.date === date);
  const source = stored || defaultCapacityDay(date);
  return normalizedCapacityDay({
    ...source,
    ...(IPRINT_TEST_MODE ? { reservedPoints: queuePointsForDate(date) } : {})
  });
}

function capacityWindow(existing = []) {
  const range = capacityCalendarRange();
  const byDate = new Map(existing.map(day => [day.date, day]));
  const length = Math.round((new Date(`${range.to}T00:00:00`) - new Date(`${range.from}T00:00:00`)) / 86400000) + 1;
  return Array.from({ length }, (_, index) => {
    const date = addCapacityDays(range.from, index);
    const source = byDate.get(date) || defaultCapacityDay(date);
    return normalizedCapacityDay({
      ...source,
      ...(IPRINT_TEST_MODE ? { reservedPoints: queuePointsForDate(date) } : {})
    });
  });
}

function capacityStatusLabel(status) {
  return status === 'CLOSED' ? 'ปิดรับงาน' : status === 'FULL' ? 'เต็ม' : 'เปิดรับงาน';
}

function capacityRemainingPercent(day) {
  if (day.closed || day.dailyCapacity <= 0) return 0;
  return Math.max(0, Math.min(100, day.availablePoints / day.dailyCapacity * 100));
}

function formatCapacityDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('th-TH-u-ca-gregory', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCapacityMonth(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('th-TH-u-ca-gregory', { month: 'long', year: 'numeric' });
}

function setStaffCapacityNotice(message, kind = '') {
  const notice = $('staffCapacityNotice');
  notice.textContent = message;
  notice.className = `staff-catalog-notice${kind ? ` ${kind}` : ''}`;
}

function renderStaffCapacity() {
  const days = capacityWindow(staffCapacityDays);
  const monthKey = staffCapacityMonth.slice(0, 7);
  const monthDays = days.filter(day => day.date.startsWith(monthKey));
  const total = monthDays.reduce((sum, day) => sum + day.dailyCapacity, 0);
  const reserved = monthDays.reduce((sum, day) => sum + day.reservedPoints, 0);
  const available = monthDays.reduce((sum, day) => sum + day.availablePoints, 0);
  const today = localCapacityDate(new Date());
  $('capacityTotalPoints').textContent = money(total);
  $('capacityReservedPoints').textContent = money(reserved);
  $('capacityAvailablePoints').textContent = money(available);
  $('staffCapacityRange').textContent = formatCapacityMonth(staffCapacityMonth);
  $('staffCapacityList').innerHTML = days.map(day => {
    const jobs = queueJobsForDate(day.date);
    const visibleJobs = jobs.slice(0, 3);
    return `
      <article class="capacity-day is-${day.status.toLowerCase()}${capacityRemainingPercent(day) > 0 && capacityRemainingPercent(day) < 25 ? ' is-low' : ''}${day.date.startsWith(monthKey) ? '' : ' is-outside'}${day.date < today ? ' is-past' : ''}${day.date === today ? ' is-today' : ''}" data-capacity-drop-date="${day.date}">
        <button class="capacity-day-select" type="button" data-capacity-open data-capacity-date="${day.date}" aria-label="${formatCapacityDate(day.date)} ${capacityStatusLabel(day.status)} คงเหลือ ${money(day.availablePoints)} จาก ${money(day.dailyCapacity)} แต้ม">
          <span class="capacity-day-top"><strong>${Number(day.date.slice(-2))}</strong><small>${day.date === today ? 'วันนี้' : day.cutoffTime}</small></span>
          <span class="capacity-day-status">${capacityStatusLabel(day.status)}</span>
          <span class="capacity-day-numbers"><strong>${money(day.availablePoints)}</strong><small>เหลือ / ${money(day.dailyCapacity)}</small></span>
          <span class="capacity-day-meter"><i style="width:${capacityRemainingPercent(day)}%"></i></span>
          ${day.note ? '<span class="capacity-day-note" aria-hidden="true">•</span>' : ''}
        </button>
        <div class="capacity-day-queue" aria-label="${jobs.length ? `คิวงาน ${jobs.length} รายการ` : 'ยังไม่มีงาน'}">
          ${visibleJobs.map((job, index) => {
            const totalPoints = Math.max(Number(job.totalPoints) || 0, Number(job.points) || 0);
            const allocationDays = Math.max(1, Number(job.allocationCount) || 1);
            const taskStatus = queueTaskStatus(job.taskStatus);
            return `
              <div class="capacity-queue-job${job.priority === 'URGENT' ? ' is-urgent' : ''}${allocationDays > 1 ? ' is-split' : ''} is-status-${taskStatus.toLowerCase().replace('_', '-')}">
                <button class="capacity-queue-job-main" type="button" draggable="true" data-queue-drag-job-id="${capacityText(job.id)}" data-queue-job-id="${capacityText(job.id)}" aria-label="เปิด Brief หรือลากเพื่อย้าย คิวที่ ${index + 1} ${capacityText(job.orderNo)} ${capacityText(job.title)}${allocationDays > 1 ? ` ช่วง ${job.allocationIndex} จาก ${allocationDays}` : ''} วันนี้ใช้ ${money(job.points)} แต้ม รวม ${money(totalPoints)} แต้ม แบ่ง ${allocationDays} วัน" title="ลากไปวางในวันอื่นเพื่อย้ายงาน">
                  <span class="capacity-queue-index">${index + 1}</span>
                  <span class="capacity-queue-copy"><strong>${capacityText(job.orderNo)}${allocationDays > 1 ? ` <em>${job.allocationIndex}/${allocationDays}</em>` : ''}</strong><small>${capacityText(job.title)}</small></span>
                  <b><span>วันนี้ ${money(job.points)}</span><small>รวม ${money(totalPoints)} • ${allocationDays} วัน</small></b>
                </button>
                <div class="capacity-queue-actions">
                  <select data-queue-status-job-id="${capacityText(job.id)}" aria-label="สถานะ ${capacityText(job.orderNo)}">
                    <option value="QUEUED"${taskStatus === 'QUEUED' ? ' selected' : ''}>รอผลิต</option>
                    <option value="IN_PROGRESS"${taskStatus === 'IN_PROGRESS' ? ' selected' : ''}>กำลังผลิต</option>
                    <option value="COMPLETED"${taskStatus === 'COMPLETED' ? ' selected' : ''}>เสร็จแล้ว</option>
                  </select>
                  <button type="button" data-queue-move-job-id="${capacityText(job.id)}" aria-label="ย้าย ${capacityText(job.orderNo)}">ย้าย</button>
                </div>
              </div>`;
          }).join('')}
          ${jobs.length > visibleJobs.length ? `<span class="capacity-queue-more">อีก ${jobs.length - visibleJobs.length} งาน</span>` : ''}
        </div>
      </article>`;
  }).join('');
}

function showStaffCapacityList() {
  $('staffCapacityEditor').hidden = true;
  $('staffQueueJobMover').hidden = true;
  $('staffCapacityListPanel').hidden = false;
  $('staffCapacityBack').hidden = true;
  renderStaffCapacity();
}

function showStaffCapacityEditor(date) {
  const day = capacityWindow(staffCapacityDays).find(item => item.date === date);
  if (!day) return;
  $('staffCapacityListPanel').hidden = true;
  $('staffQueueJobMover').hidden = true;
  $('staffCapacityEditor').hidden = false;
  $('staffCapacityBack').hidden = false;
  $('staffCapacityDate').value = day.date;
  $('staffCapacityUpdatedAt').value = day.updatedAt || '';
  $('staffDailyCapacity').value = day.dailyCapacity;
  $('staffReservedPoints').value = day.reservedPoints;
  $('staffCutoffTime').value = day.cutoffTime;
  $('staffCapacityClosed').checked = day.closed;
  $('staffCapacityNote').value = day.note || '';
  $('staffCapacityEditorTitle').textContent = formatCapacityDate(day.date);
  updateCapacityEditorPreview();
}

function firstQueueMoveCandidate(job) {
  const today = localCapacityDate(new Date());
  let date = addCapacityDays(job.date, 1);
  if (date < today) date = today;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const day = capacityDayForDate(date);
    if (!day.closed && day.availablePoints >= job.points) return date;
    date = addCapacityDays(date, 1);
  }
  return date;
}

function showQueueJobMover(jobId) {
  const job = staffQueueJobs.find(item => item.id === jobId);
  if (!job) return;
  $('staffCapacityListPanel').hidden = true;
  $('staffCapacityEditor').hidden = true;
  $('staffQueueJobMover').hidden = false;
  $('staffCapacityBack').hidden = false;
  $('staffQueueMoveJobId').value = job.id;
  $('staffQueueMoveTitle').textContent = job.orderNo;
  $('staffQueueMoveCustomer').textContent = job.customer || 'ไม่ระบุลูกค้า';
  $('staffQueueMoveDescription').textContent = job.allocationCount > 1
    ? `${job.title || 'ไม่ระบุรายละเอียดงาน'} • ช่วง ${job.allocationIndex}/${job.allocationCount}`
    : job.title || 'ไม่ระบุรายละเอียดงาน';
  $('staffQueueMovePoints').textContent = job.allocationCount > 1
    ? `${money(job.points)} แต้มในวันนี้ • รวมทั้งงาน ${money(job.totalPoints)} แต้ม`
    : `${money(job.points)} แต้ม`;
  $('staffQueueMoveCurrentDate').textContent = formatCapacityDate(job.date);
  $('staffQueueBrief').textContent = job.brief || 'ยังไม่มีรายละเอียด Brief';
  $('staffQueueSpecs').textContent = job.specs || 'ยังไม่มีรายละเอียดการผลิต';
  const ticketLink = $('staffQueueTicketLink');
  ticketLink.hidden = !job.ticketUrl;
  if (job.ticketUrl) ticketLink.href = job.ticketUrl;
  $('staffQueueMoveDate').min = localCapacityDate(new Date());
  $('staffQueueMoveDate').value = firstQueueMoveCandidate(job);
  updateQueueMovePreview();
}

function assessQueueMove(job, targetDate) {
  if (!job || !targetDate) return { success: false, message: 'กรุณาเลือกวันปลายทาง' };
  if (targetDate === job.date) return { success: false, message: 'งานอยู่ในวันนี้แล้ว กรุณาเลือกวันอื่น' };
  if (targetDate < localCapacityDate(new Date())) return { success: false, message: 'ไม่สามารถย้ายงานไปวันที่ผ่านมาแล้ว' };
  const target = capacityDayForDate(targetDate);
  if (target.closed) return { success: false, message: 'วันปลายทางปิดรับงาน กรุณาเลือกวันอื่น', target };
  if (target.availablePoints < job.points) {
    return { success: false, message: `Capacity ไม่พอ • งานใช้ ${money(job.points)} แต้ม แต่เหลือ ${money(target.availablePoints)} แต้ม`, target };
  }
  return { success: true, message: `ย้ายได้ • หลังย้ายจะเหลือ ${money(target.availablePoints - job.points)} จาก ${money(target.dailyCapacity)} แต้ม`, target };
}

function updateQueueMovePreview() {
  const job = staffQueueJobs.find(item => item.id === $('staffQueueMoveJobId').value);
  const assessment = assessQueueMove(job, $('staffQueueMoveDate').value);
  const preview = $('staffQueueMovePreview');
  preview.textContent = assessment.message;
  preview.className = `staff-capacity-preview ${assessment.success ? 'ok' : 'warn'}`;
  $('confirmQueueMove').disabled = !assessment.success;
}

function moveQueueJob(job, targetDate) {
  const assessment = assessQueueMove(job, targetDate);
  if (!assessment.success) {
    setStaffCapacityNotice(assessment.message, 'warn');
    return false;
  }
  if (!IPRINT_TEST_MODE) {
    setStaffCapacityNotice('การย้ายคิวจริงจะเปิดใช้หลังเพิ่ม Queue API', 'warn');
    return false;
  }
  const sourceDate = job.date;
  job.date = targetDate;
  localStorage.setItem(IPRINT_TEST_QUEUE_KEY, JSON.stringify(staffQueueJobs));
  setStaffCapacityNotice(`ย้าย ${job.orderNo}${job.allocationCount > 1 ? ` ช่วง ${job.allocationIndex}/${job.allocationCount}` : ''} จาก ${formatCapacityDate(sourceDate)} ไป ${formatCapacityDate(targetDate)} แล้ว • Mock data เท่านั้น`, 'ok');
  return true;
}

function clearQueueDropTargets(calendar = $('staffCapacityList')) {
  calendar?.querySelectorAll('.capacity-day.is-drop-target, .capacity-day.is-drop-invalid').forEach(day => {
    day.classList.remove('is-drop-target', 'is-drop-invalid');
  });
  calendar?.querySelectorAll('.capacity-queue-job.is-dragging').forEach(job => job.classList.remove('is-dragging'));
}

function submitQueueMove(event) {
  event.preventDefault();
  const job = staffQueueJobs.find(item => item.id === $('staffQueueMoveJobId').value);
  const targetDate = $('staffQueueMoveDate').value;
  if (!job || !targetDate) return;
  updateQueueMovePreview();
  if ($('confirmQueueMove').disabled) return;
  if (moveQueueJob(job, targetDate)) {
    staffCapacityMonth = firstCapacityMonth(targetDate);
    showStaffCapacityList();
  }
}

function updateQueueTaskStatus(jobId, nextStatus) {
  const job = staffQueueJobs.find(item => item.id === jobId);
  if (!job) return;
  if (!IPRINT_TEST_MODE) {
    setStaffCapacityNotice('การเปลี่ยนสถานะจริงจะเปิดใช้หลังเพิ่ม Queue API', 'warn');
    renderStaffCapacity();
    return;
  }
  job.taskStatus = queueTaskStatus(nextStatus);
  localStorage.setItem(IPRINT_TEST_QUEUE_KEY, JSON.stringify(staffQueueJobs));
  setStaffCapacityNotice(`${job.orderNo} เปลี่ยนเป็น “${queueTaskStatusLabel(job.taskStatus)}” แล้ว • Mock data เท่านั้น`, 'ok');
  renderStaffCapacity();
}

function updateCapacityEditorPreview() {
  const day = normalizedCapacityDay({
    dailyCapacity: $('staffDailyCapacity').value,
    reservedPoints: $('staffReservedPoints').value,
    closed: $('staffCapacityClosed').checked
  });
  $('staffCapacityEditorPreview').textContent = day.closed
    ? 'วันนี้ปิดรับงาน • ระบบจะข้ามไปวันทำงานถัดไป'
    : `ใช้แล้ว ${money(day.reservedPoints)} • คงเหลือ ${money(day.availablePoints)} จาก ${money(day.dailyCapacity)} แต้ม`;
}

async function submitStaffCapacity(event) {
  event.preventDefault();
  const day = normalizedCapacityDay({
    date: $('staffCapacityDate').value,
    dailyCapacity: Number($('staffDailyCapacity').value),
    reservedPoints: Number($('staffReservedPoints').value),
    cutoffTime: $('staffCutoffTime').value,
    closed: $('staffCapacityClosed').checked,
    note: $('staffCapacityNote').value.trim(),
    updatedAt: $('staffCapacityUpdatedAt').value
  });
  if (!day.date || day.dailyCapacity < 0 || day.reservedPoints < 0 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.cutoffTime)) {
    setStaffCapacityNotice('กรุณาตรวจสอบ Capacity และเวลาตัดรอบ', 'warn'); return;
  }
  if (IPRINT_TEST_MODE) {
    const stored = testCapacityDays();
    const index = stored.findIndex(item => item.date === day.date);
    day.updatedAt = new Date().toISOString();
    if (index >= 0) stored[index] = day; else stored.push(day);
    localStorage.setItem(IPRINT_TEST_CAPACITY_KEY, JSON.stringify(stored));
    staffCapacityDays = stored;
    setStaffCapacityNotice('บันทึก Mock Capacity แล้ว • Notion ยังไม่ถูกเปลี่ยน', 'ok');
    showStaffCapacityList(); return;
  }
  const result = await saveStaffCapacityRemote(day);
  if (!result.success) { setStaffCapacityNotice(result.error || 'บันทึกไม่สำเร็จ', 'warn'); return; }
  const index = staffCapacityDays.findIndex(item => item.date === day.date);
  if (index >= 0) staffCapacityDays[index] = result.day; else staffCapacityDays.push(result.day);
  setStaffCapacityNotice('บันทึก Daily Capacity ใน Notion แล้ว', 'ok');
  showStaffCapacityList();
}

async function loadStaffCapacity() {
  const range = capacityCalendarRange();
  if (IPRINT_TEST_MODE) {
    staffQueueJobs = testQueueJobs();
    staffCapacityDays = testCapacityDays();
  } else {
    staffCapacityDays = await fetchStaffCapacityRemote(range.from, range.to);
    staffQueueJobs = staffCapacityDays.flatMap(day => Array.isArray(day.jobs) ? day.jobs : []);
  }
  renderStaffCapacity();
}

async function openStaffCapacity() {
  if (activeAccessRole !== 'staff') return;
  if (IPRINT_TEST_MODE && IPRINT_RESET_TEST_DATA) {
    localStorage.removeItem(IPRINT_TEST_CAPACITY_KEY);
    localStorage.removeItem(IPRINT_TEST_QUEUE_KEY);
  }
  showAppView('staff-capacity');
  showStaffCapacityList();
  try { await loadStaffCapacity(); setStaffCapacityNotice(IPRINT_TEST_MODE ? 'Test Mode • ปรับเฉพาะปฏิทินจำลองในเบราว์เซอร์' : 'เชื่อมต่อ Iprint Daily Capacity แล้ว', 'ok'); }
  catch (error) { setStaffCapacityNotice(error.message || String(error), 'warn'); }
}

function bindStaffCapacity() {
  $('openStaffCapacity')?.addEventListener('click', openStaffCapacity);
  const calendar = $('staffCapacityList');
  calendar?.addEventListener('click', event => {
    if (Date.now() - queueDragEndedAt < 300) return;
    const move = event.target.closest('[data-queue-move-job-id]');
    if (move) {
      showQueueJobMover(move.dataset.queueMoveJobId);
      setTimeout(() => $('staffQueueMoveDate')?.focus(), 0);
      return;
    }
    const job = event.target.closest('[data-queue-job-id]');
    if (job) { showQueueJobMover(job.dataset.queueJobId); return; }
    const day = event.target.closest('[data-capacity-open]');
    if (day) showStaffCapacityEditor(day.dataset.capacityDate);
  });
  calendar?.addEventListener('change', event => {
    const control = event.target.closest('[data-queue-status-job-id]');
    if (control) updateQueueTaskStatus(control.dataset.queueStatusJobId, control.value);
  });
  calendar?.addEventListener('dragstart', event => {
    const handle = event.target.closest('[data-queue-drag-job-id]');
    if (!handle || !event.dataTransfer) return;
    draggedQueueJobId = handle.dataset.queueDragJobId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedQueueJobId);
    handle.closest('.capacity-queue-job')?.classList.add('is-dragging');
  });
  calendar?.addEventListener('dragover', event => {
    const day = event.target.closest('[data-capacity-drop-date]');
    const job = staffQueueJobs.find(item => item.id === draggedQueueJobId);
    if (!day || !job || !event.dataTransfer) return;
    event.preventDefault();
    clearQueueDropTargets(calendar);
    const assessment = assessQueueMove(job, day.dataset.capacityDropDate);
    day.classList.add(assessment.success ? 'is-drop-target' : 'is-drop-invalid');
    event.dataTransfer.dropEffect = assessment.success ? 'move' : 'none';
  });
  calendar?.addEventListener('drop', event => {
    const day = event.target.closest('[data-capacity-drop-date]');
    const job = staffQueueJobs.find(item => item.id === draggedQueueJobId);
    if (!day || !job) return;
    event.preventDefault();
    const targetDate = day.dataset.capacityDropDate;
    const moved = moveQueueJob(job, targetDate);
    clearQueueDropTargets(calendar);
    draggedQueueJobId = '';
    queueDragEndedAt = Date.now();
    if (moved) renderStaffCapacity();
  });
  calendar?.addEventListener('dragend', () => {
    clearQueueDropTargets(calendar);
    draggedQueueJobId = '';
    queueDragEndedAt = Date.now();
  });
  $('staffCapacityForm')?.addEventListener('submit', submitStaffCapacity);
  $('cancelStaffCapacityEdit')?.addEventListener('click', showStaffCapacityList);
  $('closeStaffCapacityEditor')?.addEventListener('click', showStaffCapacityList);
  $('staffQueueMoveForm')?.addEventListener('submit', submitQueueMove);
  $('staffQueueMoveDate')?.addEventListener('input', updateQueueMovePreview);
  $('cancelQueueMove')?.addEventListener('click', showStaffCapacityList);
  $('closeQueueJobMover')?.addEventListener('click', showStaffCapacityList);
  $('staffCapacityBack')?.addEventListener('click', showStaffCapacityList);
  if ($('staffReservedPoints')) {
    $('staffReservedPoints').readOnly = true;
    document.querySelector('label[for="staffReservedPoints"]')?.replaceChildren('แต้มที่ระบบจองแล้ว');
  }
  ['staffDailyCapacity', 'staffReservedPoints', 'staffCapacityClosed'].forEach(id => $(id)?.addEventListener('input', updateCapacityEditorPreview));
  $('previousCapacityRange')?.addEventListener('click', async () => { staffCapacityMonth = firstCapacityMonth(addCapacityMonths(staffCapacityMonth, -1)); await loadStaffCapacity(); });
  $('nextCapacityRange')?.addEventListener('click', async () => { staffCapacityMonth = firstCapacityMonth(addCapacityMonths(staffCapacityMonth, 1)); await loadStaffCapacity(); });
  $('todayCapacityMonth')?.addEventListener('click', async () => { staffCapacityMonth = firstCapacityMonth(localCapacityDate(new Date())); await loadStaffCapacity(); });
}
