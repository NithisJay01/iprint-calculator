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
    // Set before the (slow) paper swap, so an export started meanwhile never pairs the new look with the old record.
    panel.state.material = record ? { id: record.id, name: record.name, fallback: resolved.fallback } : null;
    await panel.selectPaper(resolved.key);
    if (token !== revision) return;
    panel.render();
    if (!record) note.textContent = 'ไม่พบวัสดุที่เลือก — แสดง Smooth เป็นตัวอย่างสำรอง';
    else if (resolved.fallback) note.textContent = `"${record.name}" ยังไม่มีตัวอย่าง 3D — แสดงผิว Smooth เป็นตัวอย่างสำรอง`;
    else note.textContent = record.name;
  }
  // Shows a failed paper swap as that, not as a database error.
  const chooseSafely = () =>
    choose().catch(error => {
      console.warn(error);
      note.textContent = 'แสดงวัสดุนี้ไม่สำเร็จ — ลองเลือกใหม่อีกครั้ง';
      say(error.message, true);
    });
  async function reload() {
    refresh.disabled = select.disabled = true;
    note.textContent = 'กำลังโหลดวัสดุ…';
    let next;
    try {
      next = await loadMaterials(window.IPRINT_CONFIG?.apiRoot);
    } catch (error) {
      note.textContent = records.length
        ? 'โหลดข้อมูลล่าสุดไม่สำเร็จ — กำลังแสดงข้อมูลที่โหลดไว้ก่อนหน้า'
        : 'เชื่อมต่อฐานข้อมูลไม่ได้ — เลือกพื้นผิวตัวอย่างด้านล่างได้';
      chips.hidden = records.length > 0;
      say(error.message, true);
      return;
    } finally {
      refresh.disabled = false;
      select.disabled = (next ?? records).length === 0;
    }
    records = next;
    say(''); // an earlier failed load must not leave its error on screen
    select.replaceChildren(...records.map(record => {
      const option = document.createElement('option');
      option.value = record.id;
      option.textContent = resolveMaterial(record).fallback ? `${record.name} (ยังไม่มีตัวอย่าง 3D)` : record.name;
      return option;
    }));
    // An empty catalog leaves nothing to pick from the list: keep the sample chips so the page stays usable.
    chips.hidden = records.length > 0;
    if (!records.length) {
      ++revision; // a slower choose() from the old list must not bring its record back
      panel.state.material = null;
      panel.render();
      note.textContent = 'ฐานข้อมูลยังไม่มีวัสดุ — เลือกพื้นผิวตัวอย่างด้านล่างได้';
      return;
    }
    if (records.some(item => item.id === selectedId)) select.value = selectedId;
    else if (selectedId) {
      const missing = document.createElement('option');
      missing.value = '';
      missing.textContent = 'ไม่พบวัสดุที่เลือก';
      select.prepend(missing);
      select.value = '';
    }
    await chooseSafely();
  }
  select.addEventListener('change', chooseSafely);
  refresh.addEventListener('click', reload);
  await reload();
}
