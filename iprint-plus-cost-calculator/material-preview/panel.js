/**
 * panel.js — the control panel: four steps, each one uploads / chooses one thing and shows the result at once.
 *
 *   0  shape and size of the card (presets, or a die-cut file)
 *   1  Layer 1  Material (paper) + the printed artwork
 *   2  Layer 2  lamination
 *   3  Layer 3  finish (Spot UV / foil / emboss / deboss) + the file that says where it goes
 *
 * Papers, laminations, finishes and shapes are all built from materials.js, so a new entry there needs no change here.
 */
import { paperMaterials, coatings, finishes, FINISH_ORDER, SHAPE_KINDS, SIZE_PRESETS, BLEED_OPTIONS, DEFAULTS } from './materials.js';

const $ = (sel) => document.querySelector(sel);

export function initPanel({ card, layers, stage, setBusy, say, requestRender }) {
  const state = { paper: DEFAULTS.paper, coating: DEFAULTS.coating, finish: DEFAULTS.finish, active: 'stepArt' };

  /* --------------------------------------------------------------- helpers */

  /** Run a user action; anything that throws becomes a message under the panel instead of a silent failure. */
  async function act(fn) {
    try {
      say('');
      await fn();
    } catch (err) {
      console.warn(err);
      say(err?.message || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง', true);
    }
    render();
    requestRender();
  }

  function buildChips(container, entries, onPick) {
    for (const [id, label] of entries) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.id = id;
      b.textContent = label;
      b.addEventListener('click', () => onPick(id));
      container.append(b);
    }
  }
  const pressed = (container, id) => {
    for (const b of container.children) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  };
  const setValue = (el, value) => {
    if (document.activeElement !== el) el.value = value; // never fight the user's typing
  };
  const setNotes = (ul, notes) => {
    ul.replaceChildren(
      ...notes.map((n) => {
        const li = document.createElement('li');
        li.textContent = n.text;
        if (n.warn) li.className = 'is-warn';
        return li;
      }),
    );
  };

  /* ---------------------------------------------- material / lamination / finish */

  let paperToken = 0;
  async function selectPaper(id) {
    if (id === state.paper && card.paper === id) return;
    const token = ++paperToken;
    state.paper = id;
    render();
    const timer = setTimeout(() => setBusy(true), 160); // only show the spinner if it isn't instant
    try {
      await card.setPaper(id);
    } finally {
      clearTimeout(timer);
      if (token === paperToken) setBusy(false);
    }
    requestRender();
  }

  let coatToken = 0;
  async function selectCoating(id) {
    const token = ++coatToken;
    state.coating = id;
    render();
    const timer = setTimeout(() => setBusy(true, 'กำลังเตรียมชั้นเคลือบ…'), 160);
    try {
      await card.setCoating(id);
    } finally {
      clearTimeout(timer);
      if (token === coatToken) setBusy(false);
    }
    requestRender();
  }

  let finishToken = 0;
  async function selectFinish(id) {
    const token = ++finishToken;
    state.finish = id;
    render();
    const timer = setTimeout(() => setBusy(true, 'กำลังเตรียมชั้นเทคนิคพิเศษ…'), 160);
    try {
      await card.setFinish(id);
    } finally {
      clearTimeout(timer);
      if (token === finishToken) setBusy(false);
    }
    requestRender();
  }

  buildChips($('#paperChips'), Object.entries(paperMaterials).map(([id, c]) => [id, c.label]), (id) => act(() => selectPaper(id)));
  buildChips($('#coatChips'), Object.entries(coatings).map(([id, c]) => [id, c.label]), (id) => act(() => selectCoating(id)));
  buildChips($('#finishChips'), FINISH_ORDER.map((id) => [id, finishes[id].label]), (id) => act(() => selectFinish(id)));

  /* ------------------------------------------------------------------ shape */

  buildChips($('#shapeChips'), SHAPE_KINDS.map((k) => [k.id, k.label]), (kind) => {
    if (kind === 'custom' && !layers.state.cut) {
      $('#stepShape').open = true;
      $('#cutInput').click(); // nothing to switch to yet: ask for the file
      return;
    }
    act(() => layers.setShape({ kind }));
  });
  $('#sizePreset').append(...[...SIZE_PRESETS.map((p) => new Option(p.label, p.id)), new Option('กำหนดเอง', 'x')]);
  $('#bleedSel').append(...BLEED_OPTIONS.map((b) => new Option(b ? `${b} mm` : 'ไม่มี Bleed', String(b))));

  let sizeTimer = 0;
  const applySizeInputs = () => {
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => {
      const patch = { bleed: Number($('#bleedSel').value) || 0 };
      for (const [key, sel] of [['width', '#sizeW'], ['height', '#sizeH'], ['radius', '#sizeR']]) {
        const v = parseFloat($(sel).value);
        if (Number.isFinite(v)) patch[key] = v;
      }
      act(() => layers.setShape(patch));
    }, 250); // typing "9", "90" must not rebuild the card twice
  };
  for (const sel of ['#sizeW', '#sizeH', '#sizeR']) {
    $(sel).addEventListener('input', applySizeInputs);
    $(sel).addEventListener('change', render); // on blur: show the clamped value
  }
  $('#bleedSel').addEventListener('change', applySizeInputs);
  $('#sizePreset').addEventListener('change', (e) => {
    const p = SIZE_PRESETS.find((x) => x.id === e.target.value);
    if (p) act(() => layers.setShape({ width: p.w, height: p.h }));
  });

  $('#cutUpload').addEventListener('click', () => $('#cutInput').click());
  $('#cutInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be picked again
    if (file) act(() => layers.loadCut(file, { invert: $('#cutInvert').checked }));
  });
  $('#cutInvert').addEventListener('change', (e) => act(() => layers.setCutInvert(e.target.checked)));

  /* --------------------------------------------------------------- layers */

  $('#artDemo').addEventListener('click', () => act(() => layers.setArt(null)));
  $('#artUpload').addEventListener('click', () => $('#artInput').click());
  $('#artInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) act(() => layers.setArt(file));
  });

  $('#maskUpload').addEventListener('click', () => $('#maskInput').click());
  $('#maskClear').addEventListener('click', () => act(() => layers.setMask(null)));
  $('#maskInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) act(() => layers.setMask(file));
  });
  $('#maskInvert').addEventListener('change', (e) => act(() => layers.setMaskInvert(e.target.checked)));

  // drag & drop a file onto the card: it goes to the step that is open
  for (const step of document.querySelectorAll('.step')) {
    step.addEventListener('toggle', () => {
      if (step.open) state.active = step.id;
    });
  }
  const DROP = { art: 'Layer 1 (งานพิมพ์)', mask: 'Layer 3 (รูปทรงเทคนิคพิเศษ)', cut: 'รูปร่างบัตร (ไดคัท)' };
  const dropTarget = () => ({ stepFinish: 'mask', stepShape: 'cut' })[state.active] ?? 'art';
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  stage.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    stage.dataset.drop = `วางไฟล์เพื่อใช้เป็น ${DROP[dropTarget()]}`;
    stage.classList.add('is-drop');
  });
  stage.addEventListener('dragleave', () => stage.classList.remove('is-drop'));
  stage.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    stage.classList.remove('is-drop');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const target = dropTarget();
    if (target === 'art') act(() => layers.setArt(file));
    else if (target === 'mask') act(() => layers.setMask(file));
    else act(() => layers.loadCut(file, { invert: $('#cutInvert').checked }));
  });

  /* ---------------------------------------------------------------- render */

  function render() {
    const d = layers.describe();
    const spec = d.spec;
    const paper = paperMaterials[state.paper];
    const coat = coatings[state.coating];
    const finish = finishes[state.finish];
    const kind = SHAPE_KINDS.find((k) => k.id === d.shape.kind);
    const custom = d.shape.kind === 'custom';
    const bounds = `${+spec.bounds.w.toFixed(1)}×${+spec.bounds.h.toFixed(1)} mm`;

    // step 0 — shape
    pressed($('#shapeChips'), d.shape.kind);
    $('#shapeSum').textContent = `${kind?.label ?? ''} · ${bounds}`;
    $('#presetField').hidden = custom;
    $('#radiusField').hidden = d.shape.kind !== 'rounded';
    $('#bleedField').hidden = custom;
    $('#cutBox').hidden = !custom;
    setValue($('#sizeW'), +spec.bounds.w.toFixed(1));
    setValue($('#sizeH'), +spec.bounds.h.toFixed(1));
    $('#sizeH').readOnly = custom; // the height follows the die-cut shape
    setValue($('#sizeR'), d.shape.radius);
    $('#bleedSel').value = String(d.shape.bleed || 0);
    const preset = SIZE_PRESETS.find((p) => p.w === spec.bounds.w && p.h === spec.bounds.h);
    $('#sizePreset').value = preset?.id ?? 'x';
    $('#cutInvertWrap').hidden = !(custom && d.cutKind === 'png');
    $('#cutUpload').textContent = d.cutName ? `เปลี่ยนไฟล์ Shape (${d.cutName})` : 'เลือกไฟล์ Shape (SVG / PNG)…';
    $('#cutDesc').textContent = d.cutName
      ? `${d.cutKind === 'svg' ? 'อ่านเส้นจากไฟล์ SVG' : 'สกัดเส้นจากภาพ PNG'} — ตั้งความกว้างของบัตรจริงเป็น mm ด้านบน (ความสูงคำนวณให้) กรอบงานเท่ากับกรอบของไฟล์นี้ ไฟล์ Layer 1 / 3 ที่ใช้ Artboard เดียวกันจะตรงกันเอง`
      : 'อัปโหลดไฟล์เส้นตัดไดคัท (SVG หรือ PNG พื้นโปร่งใส) ระบบใช้เฉพาะรูปทรงและรูเจาะ จะใช้ชิ้นที่ใหญ่ที่สุดในไฟล์';
    setNotes($('#shapeNotes'), d.shapeNotes);

    // step 1 — material + artwork
    pressed($('#paperChips'), state.paper);
    $('#paperDesc').textContent = paper.description;
    $('#artSum').textContent = `${paper.label} · ${d.artName || 'การ์ดเดโม'}`;
    $('#artDemo').setAttribute('aria-pressed', String(!d.artName));
    $('#artUpload').setAttribute('aria-pressed', String(!!d.artName));
    $('#artUpload').textContent = d.artName ? `เปลี่ยนไฟล์งาน (${d.artName})` : 'อัปโหลดไฟล์งาน…';
    setNotes($('#artNotes'), d.artNotes);

    // step 2 — lamination
    pressed($('#coatChips'), state.coating);
    $('#coatSum').textContent = coat.label;
    $('#coatDesc').textContent = coat.description;

    // step 3 — finish + its shape file
    pressed($('#finishChips'), state.finish);
    $('#finishDesc').textContent = finish.description;
    const wantsShape = state.finish !== 'none';
    const hasShape = card.finishHasShape(state.finish);
    $('#finishSum').textContent = wantsShape && !hasShape ? `${finish.label} · รอไฟล์รูปทรง` : finish.label;
    $('#maskUpload').classList.toggle('is-attn', wantsShape && !hasShape);
    $('#maskUpload').textContent = d.maskName ? `เปลี่ยนไฟล์รูปทรง (${d.maskName})` : 'อัปโหลดรูปทรง…';
    $('#maskClear').hidden = !d.maskName;
    $('#maskInvertWrap').hidden = !(d.maskIsRaster && d.maskUsedBrightness);
    $('#maskInvert').checked = d.maskInvert;
    $('#maskDesc').textContent = !wantsShape
      ? 'เลือกเทคนิคพิเศษด้านบน แล้วอัปโหลดไฟล์รูปทรงของ Layer 3 (SVG หรือ PNG) ที่มีเฉพาะพื้นที่ที่จะปั๊ม/เคลือบ สีอะไรก็ได้ ระบบใช้แค่รูปทรง'
      : !hasShape
        ? `${finish.label}: ยังไม่มีรูปทรง — อัปโหลดไฟล์รูปทรง (SVG หรือ PNG โปร่งใส) เพื่อดูผล`
        : d.maskName
          ? `รูปทรงจากไฟล์ ${d.maskName}`
          : 'ตอนนี้ใช้รูปทรงโลโก้ของการ์ดเดโม — อัปโหลดไฟล์ของคุณเพื่อใช้แทน';
    setNotes($('#maskNotes'), d.maskNotes);

    $('#caption').textContent = [paper.label, state.coating === 'none' ? '' : coat.label, state.finish === 'none' ? '' : finish.label].filter(Boolean).join(' · ');
  }
  render();

  return { render, state, selectPaper, selectCoating, selectFinish };
}
