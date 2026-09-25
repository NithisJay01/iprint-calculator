import { loadMaterials, resolveMaterial } from './material-catalog.js';

export async function initMaterialCatalog({ panel, say, requestedId }) {
  const chips = document.querySelector('#paperChips');
  const box = document.createElement('div');
  box.className = 'material-catalog';
  const label = document.createElement('label');
  label.textContent = 'วัสดุจากฐานข้อมูล ';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'วัสดุจากฐานข้อมูล');
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'chip';
  refresh.textContent = 'โหลดข้อมูลล่าสุด';
  const note = document.createElement('p');
  note.setAttribute('role', 'status');
  label.append(select);
  box.append(label, refresh, note);
  chips.before(box);
  let records = [];
  let selectedId = requestedId || '';
  let revision = 0;
  async function choose() {
    const token = ++revision;
    selectedId = select.value;
    const record = records.find(item => item.id === selectedId);
    const resolved = resolveMaterial(record);
    await panel.selectPaper(resolved.key);
    if (token !== revision) return;
    panel.render();
    note.textContent = resolved.fallback
      ? 'วัสดุนี้ยังไม่มีตัวอย่าง 3D ที่รองรับ — แสดง Smooth เป็นตัวอย่างสำรอง'
      : record.name;
  }
  async function reload() {
    refresh.disabled = select.disabled = true;
    note.textContent = 'กำลังโหลดวัสดุ…';
    try {
      const next = await loadMaterials(window.IPRINT_CONFIG?.apiRoot);
      records = next;
      select.replaceChildren(...records.map(record => {
        const option = document.createElement('option');
        option.value = record.id;
        option.textContent = record.name;
        return option;
      }));
      const found = records.some(item => item.id === selectedId);
      if (found) select.value = selectedId;
      else if (selectedId || !records.length) {
        const missing = document.createElement('option');
        missing.value = '';
        missing.textContent = 'ไม่พบวัสดุที่เลือก';
        select.prepend(missing);
        select.value = '';
      }
      chips.hidden = true;
      await choose();
    } catch (error) {
      note.textContent = records.length
        ? 'โหลดข้อมูลล่าสุดไม่สำเร็จ — กำลังแสดงข้อมูลที่โหลดไว้ก่อนหน้า'
        : 'เชื่อมต่อฐานข้อมูลไม่ได้ — เลือกพื้นผิวตัวอย่างด้านล่างได้';
      chips.hidden = records.length > 0;
      say(error.message, true);
    } finally {
      refresh.disabled = false;
      select.disabled = records.length === 0;
    }
  }
  select.addEventListener('change', () => choose().catch(error => say(error.message, true)));
  refresh.addEventListener('click', reload);
  await reload();
}
