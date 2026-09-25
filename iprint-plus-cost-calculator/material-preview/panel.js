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
import { buildArtworkBundle, nameArtworkBundle } from './artwork-bundle.js';

const $ = (sel) => document.querySelector(sel);

export function initPanel({ card, layers, stage, setBusy, say, requestRender }) {
  // material: the catalog record the paper came from ({ id, name, fallback }), null when a sample chip was picked
  const state = { paper: DEFAULTS.paper, coating: DEFAULTS.coating, finish: DEFAULTS.finish, material: null, active: 'stepArt', side: 'front' };

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
  // "วัสดุที่ต้องการผลิต" follows the material picked on the preview, until the customer types their own.
  let autoMaterial = '';
  const fillMaterialField = (name) => {
    const field = $('#exportMaterialName');
    const typed = field.value.trim();
    if (document.activeElement !== field && (!typed || typed === autoMaterial)) field.value = name;
    autoMaterial = name;
  };
  /** "ArtworkNa…png": keeps the start and the extension of a long file name. */
  const shortName = (name = '', max = 16) => {
    if (name.length <= max) return name;
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot + 1) : '';
    return `${name.slice(0, max - ext.length - 1)}…${ext}`;
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

  buildChips($('#paperChips'), Object.entries(paperMaterials).map(([id, c]) => [id, c.label]), (id) => act(() => {
    state.material = null; // a sample look, not a catalog stock
    return selectPaper(id);
  }));
  buildChips($('#coatChips'), Object.entries(coatings).map(([id, c]) => [id, c.label]), (id) => act(() => selectCoating(id)));
  // The first time a special technique is picked on this visit, remind that not every technique suits every stock.
  // The finish is still applied behind the notice.
  let finishNoticeShown = false;
  const showFinishNotice = () => {
    const dialog = $('#finishNotice');
    if (finishNoticeShown || !dialog?.showModal) return;
    finishNoticeShown = true;
    dialog.showModal();
  };
  buildChips($('#finishChips'), FINISH_ORDER.map((id) => [id, finishes[id].label]), (id) => {
    if (id !== 'none') showFinishNotice();
    act(() => selectFinish(id));
  });

  /* ------------------------------------------------------------------ shape */

  buildChips($('#shapeChips'), SHAPE_KINDS.map((k) => [k.id, k.label]), (kind) => {
    if (kind === 'custom' && !layers.state.cut) {
      $('#stepArt').open = true;
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

  // "ภาพบน Preview": the iPrint sample card, or the customer's own card. The customer's files are kept while the
  // sample is shown, so switching back to "การ์ดของคุณ" needs no new upload.
  const mine = { front: null, back: null };
  const showingMine = () => Boolean(layers.state.art);

  async function useFront(file) {
    await layers.setArt(file);
    if (layers.state.art) mine.front = file; // only once it actually loaded (a bad file keeps the previous one)
    state.side = 'front';
  }
  async function useBack(file) {
    if (!showingMine() && mine.front) await layers.setArt(mine.front); // a back belongs to the customer's card
    await layers.setBackArt(file);
    if (layers.state.backArt) mine.back = file;
    state.side = 'back';
  }
  const pickFront = () => $('#artInput').click();

  $('#artDemo').addEventListener('click', () => act(async () => {
    await layers.setArt(null);
    await layers.setBackArt(null);
    state.side = 'front';
  }));
  $('#artUpload').addEventListener('click', () => {
    if (showingMine()) return; // already on the customer's card
    if (!mine.front) return pickFront();
    act(async () => {
      await layers.setArt(mine.front);
      if (mine.back) await layers.setBackArt(mine.back);
      state.side = 'front';
    });
  });
  $('#frontReplace').addEventListener('click', pickFront);
  $('#artInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be picked again
    if (file) act(() => useFront(file));
  });
  $('#backArtUpload').addEventListener('click', () => $('#backArtInput').click());
  $('#backArtInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) act(() => useBack(file));
  });
  $('#backArtClear').addEventListener('click', () => act(async () => {
    await layers.setBackArt(null);
    mine.back = null;
    state.side = 'front';
  }));
  // a side card: its title (or anywhere on the card but its buttons) shows that side
  for (const [side, cardId, titleId] of [['front', '#sideFront', '#viewFront'], ['back', '#sideBack', '#viewBack']]) {
    const show = () => act(() => { state.side = side; });
    $(titleId).addEventListener('click', show);
    $(cardId).addEventListener('click', (e) => {
      if (!e.target.closest('button')) show();
    });
  }

  $('#maskUpload').addEventListener('click', () => $('#maskInput').click());
  $('#maskClear').addEventListener('click', () => act(() => layers.setMask(null)));
  $('#maskInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) act(async () => { await layers.setMask(file); state.side = 'front'; });
  });
  $('#maskInvert').addEventListener('change', (e) => act(() => layers.setMaskInvert(e.target.checked)));

  /* ---------------------------------------------------------------- export */

  // The export code (plan, PDF / SVG writers, SVG converter) is only fetched when this step is opened or used,
  // so it costs the page nothing until then.
  let planner = null;
  let exportReport = [];
  const exportOptions = () => ({ colorMode: $('#exportColor').value, cropMarks: $('#exportMarks').checked, jobPage: $('#exportJob').checked });
  const exportSources = () => ({ ...layers.exportSources(), paperId: state.paper, material: state.material, coatingId: state.coating, finishId: state.finish });

  async function runExport(kind) {
    const { exportFile, downloadBlob } = await import('./exportFiles.js');
    setBusy(true, kind === 'pdf' ? 'กำลังสร้างไฟล์ PDF…' : 'กำลังสร้างไฟล์ SVG…');
    try {
      const metadata = { name: $('#exportCustomer').value.trim(), jobName: $('#exportJobName').value.trim(), materialName: $('#exportMaterialName').value.trim(), quantity: Number($('#exportQuantity').value), spec: { width: card.spec.bounds.w, height: card.spec.bounds.h, paper: state.paper } };
      if (!metadata.name || !metadata.jobName || !metadata.materialName || !Number.isInteger(metadata.quantity) || metadata.quantity < 1 || metadata.quantity > 100000) throw new Error('กรุณากรอกชื่อลูกค้า ชื่องาน วัสดุ และจำนวนผลิตก่อนดาวน์โหลด');
      const results = nameArtworkBundle(await buildArtworkBundle(exportFile, exportSources(), exportOptions(), [kind]), metadata);
      for (const result of results) downloadBlob(result.blob, result.filename);
      const result = results[0];
      exportReport = [
        `ดาวน์โหลดแล้ว: ${result.filename} (${result.bytes >= 1048576 ? `${(result.bytes / 1048576).toFixed(1)} MB` : `${Math.round(result.bytes / 1024)} KB`})`,
        ...(result.pdf ? [`PDF ${result.pdf.pages} หน้า · เลเยอร์: ${result.pdf.layers.join(', ')} · สีพิเศษ: ${result.pdf.spots.join(', ')}`] : []),
        ...results.flatMap(file => file.report),
        ...results.slice(1).map(file => `ดาวน์โหลดด้านหลัง: ${file.filename}`),
      ];
    } finally {
      setBusy(false);
    }
  }
  $('#exportPdf').addEventListener('click', () => act(() => runExport('pdf')));
  $('#exportSvg').addEventListener('click', () => act(() => runExport('svg')));
  for (const sel of ['#exportColor', '#exportMarks', '#exportJob']) $(sel).addEventListener('change', () => render());
  $('#stepExport').addEventListener('toggle', () => {
    if ($('#stepExport').open) render();
  });

  function renderExport(d) {
    if (!$('#stepExport').open) return;
    if (!planner) {
      import('./productionSpec.js').then((m) => {
        planner = m;
        render();
      });
      return;
    }
    const src = exportSources();
    const plan = planner.buildProductionPlan({ ...src, options: exportOptions() });
    const ul = $('#exportChecks');
    ul.replaceChildren(
      ...plan.checks.map((c) => {
        const li = document.createElement('li');
        li.className = c.level;
        li.textContent = c.text;
        return li;
      }),
    );
    $('#exportPdf').disabled = $('#exportSvg').disabled = plan.blocking;
    $('#exportSum').textContent = plan.blocking ? 'ต้องมีไฟล์ Layer 1' : 'PDF · SVG';
    setNotes($('#exportNotes'), exportReport.map((text) => ({ text, warn: false })));
    return d;
  }

  // drag & drop a file onto the card: it goes to the step that is open
  for (const step of document.querySelectorAll('.step')) {
    step.addEventListener('toggle', () => {
      if (step.open) state.active = step.id;
    });
  }
  const DROP = { art: 'แบบของคุณ', mask: 'รูปทรงเทคนิคพิเศษ' };
  const dropTarget = () => ({ stepFinish: 'mask' })[state.active] ?? 'art';
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  stage.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const target = dropTarget();
    stage.dataset.drop = `วางไฟล์เพื่อใช้เป็น ${DROP[target]}${target === 'art' ? (showingMine() && state.side === 'back' ? ' ด้านหลัง' : ' ด้านหน้า') : ''}`;
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
    // (a die-cut file is picked with its own button in step 1: a drop there is artwork, which is what people drag in)
    // on the sample card a dropped file becomes the customer's front; on their own card it goes to the side shown
    if (target === 'art') act(() => (showingMine() && state.side === 'back' ? useBack(file) : useFront(file)));
    else act(() => layers.setMask(file));
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

    // step 1 — artwork: front, back, card shape and size
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
      ? `${d.cutKind === 'svg' ? 'อ่านเส้นจากไฟล์ SVG' : 'สกัดเส้นจากภาพ PNG'} — ตั้งความกว้างของบัตรจริงเป็น mm ด้านบน (ความสูงคำนวณให้) กรอบงานเท่ากับกรอบของไฟล์นี้ ไฟล์แบบและรูปทรงเทคนิคพิเศษที่ใช้ Artboard เดียวกันจะตรงกันเอง`
      : 'อัปโหลดไฟล์เส้นตัดไดคัท (SVG หรือ PNG พื้นโปร่งใส) ระบบใช้เฉพาะรูปทรงและรูเจาะ จะใช้ชิ้นที่ใหญ่ที่สุดในไฟล์';
    setNotes($('#shapeNotes'), d.shapeNotes);

    const own = Boolean(d.artName);
    $('#artSum').textContent = `${own ? 'การ์ดของคุณ' : 'การ์ด iPrint'}${d.backArtName ? ' · 2 ด้าน' : ''} · ${bounds}`;
    // ภาพบน Preview: the chosen source is outlined; "upload" is a solid call to action until there is a file
    $('#artDemo').setAttribute('aria-pressed', String(!own));
    $('#artUpload').setAttribute('aria-pressed', String(own));
    $('#artUpload').textContent = mine.front ? 'การ์ดของคุณ' : 'อัปโหลดการ์ดของคุณ';
    $('#artUpload').classList.toggle('is-cta', !mine.front);
    // side cards: compact side switches on the sample card; with the customer's card each one holds its file
    $('#sideCards').classList.toggle('is-compact', !own);
    for (const [side, cardId, titleId, label, name] of [
      ['front', '#sideFront', '#viewFront', 'ด้านหน้า', d.artName],
      ['back', '#sideBack', '#viewBack', 'ด้านหลัง', d.backArtName],
    ]) {
      const shown = state.side === side;
      $(cardId).classList.toggle('is-shown', shown);
      $(titleId).setAttribute('aria-pressed', String(shown));
      const small = side === 'back' && !name ? Object.assign(document.createElement('small'), { textContent: ' (ถ้ามี)' }) : '';
      $(titleId).replaceChildren(own && !shown && name ? `กดดู${label}` : label, small);
    }
    $('#frontFile').textContent = shortName(d.artName);
    $('#frontFile').title = d.artName;
    $('#backArtUpload').textContent = d.backArtName ? 'เปลี่ยนภาพ' : 'อัปโหลด';
    $('#backFile').textContent = d.backArtName ? shortName(d.backArtName) : 'ว่างเปล่า';
    $('#backFile').title = d.backArtName ?? '';
    $('#backArtClear').hidden = !d.backArtName;
    $('#flipBtn').setAttribute('aria-label', `พลิกด้าน — ตอนนี้แสดง${state.side === 'back' ? 'ด้านหลัง' : 'ด้านหน้า'}`);
    setNotes($('#artNotes'), own ? [...d.artNotes, { text: 'ด้านหลังใช้ขนาดและวัสดุเดียวกับด้านหน้า พิมพ์สีได้ ส่วนเทคนิคพิเศษใช้กับด้านหน้าเท่านั้น ไฟล์ส่งออกแยกด้านหน้า (-front) และด้านหลัง (-back)' }] : d.artNotes);

    // step 2 — material
    pressed($('#paperChips'), state.paper);
    $('#paperDesc').textContent = paper.description;
    const materialName = state.material?.name ?? paper.label;
    $('#materialSum').textContent = materialName;
    fillMaterialField(materialName);

    // step 3 — lamination
    pressed($('#coatChips'), state.coating);
    $('#coatSum').textContent = coat.label;
    $('#coatDesc').textContent = coat.description;

    // step 4 — finish + its shape file
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
          : 'ตอนนี้ใช้รูปทรงโลโก้ของตัวอย่างการ์ด — อัปโหลดไฟล์ของคุณเพื่อใช้แทน';
    setNotes($('#maskNotes'), d.maskNotes);

    $('#caption').textContent = [state.material?.name ?? paper.label, state.coating === 'none' ? '' : coat.label, state.finish === 'none' ? '' : finish.label].filter(Boolean).join(' · ');
    renderExport(d);
  }
  render();

  return { render, state, selectPaper, selectCoating, selectFinish };
}
