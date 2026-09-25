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
import { artworkFit, compareAspect, placeArtwork } from './shape.js';
import { placeOnTrim } from './bleed.js';
import { drawArtCheck, artCheckMessage, finishCheckMessage, artCheckSize, renderArtCheckSource, EXTEND_BG_ASK } from './artCheck.js';

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
  $('#bleedSel').append(...BLEED_OPTIONS.map((b) => new Option(`${b} mm`, String(b))));

  let sizeTimer = 0;
  const applySizeInputs = () => {
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => {
      const patch = { bleed: Number($('#bleedSel').value) || 0 };
      // width / height are typed in cm, the corner radius in mm; the card model is always mm
      for (const [key, sel, toMm] of [['width', '#sizeW', 10], ['height', '#sizeH', 10], ['radius', '#sizeR', 1]]) {
        const v = parseFloat($(sel).value);
        if (Number.isFinite(v)) patch[key] = v * toMm;
      }
      act(() => layers.setShape(patch));
    }, 250); // typing "5", "5.5" must not rebuild the card twice
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

  // "check the cut": before a front / back file is used, show it as it will be printed and what gets trimmed off; the
  // customer can change its size / position here. The answer is { placement } (null = automatic), or null = not used.
  const artCheck = $('#artCheck');
  const view = $('#artCheckCanvas');
  const zoomInput = $('#artCheckZoom');
  let answerCheck = null;
  let check = null; // the open check: { side, edit, src, aspect, spec, placement, follow, underlay, size }
  const CHECK_SLOT = { front: 'art', back: 'backArt', mask: 'mask' };
  const SIDE_LABEL = { front: 'ด้านหน้า', back: 'ด้านหลัง', mask: 'รูปทรงเทคนิคพิเศษ' };
  const finishCheck = (use) => {
    const resolve = answerCheck;
    const placement = check?.placement ?? null;
    // the paper size can be changed inside the pop-up: leaving without using the file puts the size back
    const original = resolve && !use && check?.size;
    answerCheck = null;
    clearTimeout(checkSizeTimer);
    if (artCheck.open) artCheck.close();
    if (resolve && check) check.closed = true; // a size change still being applied must not touch the pop-up any more
    resolve?.(use ? { placement } : null);
    if (original && (layers.state.shape.width !== original.width || layers.state.shape.height !== original.height)) {
      act(() => layers.setShape({ width: original.width, height: original.height }));
    }
  };
  function redrawCheck() {
    const c = check;
    // a finish shape with no placement of its own follows the artwork's (c.follow), as it will in print
    const placement = c.placement ?? c.follow;
    const { rect } = drawArtCheck(view, c.src, c.aspect, c.spec, layers.state.shape, placement, { underlay: c.underlay });
    const msg = c.underlay ? finishCheckMessage(c.spec, rect, finishes[state.finish]?.label) : artCheckMessage(c.aspect, c.spec, c.placement, rect);
    $('#artCheckAsk').hidden = !msg.ask;
    $('#artCheckText').textContent = msg.text;
    const mode = c.placement?.base === 'fill' ? 'fill' : c.placement ? 'fit' : 'auto';
    for (const b of document.querySelectorAll('.art-check-fit .chip')) b.setAttribute('aria-pressed', String(b.dataset.fit === mode));
    const zoom = Math.round((c.placement?.zoom ?? 1) * 100);
    zoomInput.value = String(zoom);
    $('#artCheckZoomOut').textContent = `${zoom}%`;
    syncCheckSize();
  }

  // Paper size, chosen right where the picture is placed: a preset, or width x height in cm (the die-cut file decides its own).
  const cmOf = (mm) => +(mm / 10).toFixed(2);
  $('#artCheckPreset').append(...[...SIZE_PRESETS.map((p) => new Option(p.label, p.id)), new Option('กำหนดเอง', 'x')]);
  function syncCheckSize() {
    const custom = layers.state.shape.kind === 'custom';
    $('#artCheckSize').hidden = custom;
    if (custom) return;
    const b = check.spec.bounds;
    setValue($('#artCheckW'), cmOf(b.w));
    setValue($('#artCheckH'), cmOf(b.h));
    $('#artCheckPreset').value = SIZE_PRESETS.find((p) => p.w === b.w && p.h === b.h)?.id ?? 'x';
  }
  let checkSizeTimer = 0;
  function applyCheckSize(now = false) {
    clearTimeout(checkSizeTimer);
    const run = async () => {
      const open = check;
      if (!open || open.closed) return;
      const w = parseFloat($('#artCheckW').value);
      const h = parseFloat($('#artCheckH').value);
      if (!(w > 0) || !(h > 0)) return; // half-typed: wait for a number
      const token = (open.sizeToken = (open.sizeToken ?? 0) + 1);
      $('#artCheckSizeNote').textContent = '';
      try {
        await layers.setShape({ width: w * 10, height: h * 10 });
        if (check !== open || open.closed || token !== open.sizeToken) return; // closed, or a newer size took over
        open.spec = card.spec;
        if (open.underlay) open.underlay = await renderUnderlay(layers.state.art, open.spec); // the printed front is drawn for this size
        if (check !== open || open.closed || token !== open.sizeToken) return;
        redrawCheck();
      } catch (err) {
        console.warn(err);
        if (check === open) $('#artCheckSizeNote').textContent = err?.message || 'เปลี่ยนขนาดไม่สำเร็จ';
      }
      render();
      requestRender();
    };
    if (now) run();
    else checkSizeTimer = setTimeout(run, 250); // typing "5", "5.5" must not rebuild the card twice
  }
  for (const sel of ['#artCheckW', '#artCheckH']) $(sel).addEventListener('input', () => applyCheckSize());
  $('#artCheckPreset').addEventListener('change', (e) => {
    const p = SIZE_PRESETS.find((x) => x.id === e.target.value);
    if (!p || !check) return;
    $('#artCheckW').value = String(cmOf(p.w));
    $('#artCheckH').value = String(cmOf(p.h));
    applyCheckSize(true);
  });
  // the customer's own placement starts from what automatic shows (on the trim for a trim-sized file, else fitted)
  const manual = () =>
    (check.placement ??= check.follow ? { ...check.follow } : { base: artworkFit(check.aspect, check.spec) === 'trim' ? 'trim' : 'fit', zoom: 1, dx: 0, dy: 0 });
  for (const b of document.querySelectorAll('.art-check-fit .chip')) {
    b.addEventListener('click', () => {
      if (!check) return;
      check.placement = b.dataset.fit === 'auto' ? null : { base: b.dataset.fit, zoom: 1, dx: 0, dy: 0 };
      redrawCheck();
    });
  }
  zoomInput.addEventListener('input', () => {
    if (!check) return;
    manual().zoom = Number(zoomInput.value) / 100;
    redrawCheck();
  });
  $('#artCheckReset').addEventListener('click', () => {
    if (!check) return;
    check.placement = null;
    redrawCheck();
  });
  // drag the picture to move it (mm follow the canvas as it is shown, whatever its on-screen size)
  let drag = null;
  view.addEventListener('pointerdown', (e) => {
    if (!check) return;
    view.setPointerCapture?.(e.pointerId);
    const p = manual();
    drag = { x: e.clientX, y: e.clientY, dx: p.dx, dy: p.dy, mmPerPx: check.spec.frame.w / view.getBoundingClientRect().width };
    view.classList.add('is-dragging');
  });
  view.addEventListener('pointermove', (e) => {
    if (!drag || !check) return;
    check.placement.dx = drag.dx + (e.clientX - drag.x) * drag.mmPerPx;
    check.placement.dy = drag.dy + (e.clientY - drag.y) * drag.mmPerPx;
    redrawCheck();
  });
  const endDrag = () => {
    drag = null;
    view.classList.remove('is-dragging');
  };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);
  $('#artCheckUse').addEventListener('click', () => finishCheck(true));
  $('#artCheckAgain').addEventListener('click', () => {
    if (check?.edit) return; // (hidden in edit mode: the side card has its own "change picture")
    const side = check?.side;
    finishCheck(false);
    $({ back: '#backArtInput', mask: '#maskInput' }[side] ?? '#artInput').click(); // still inside the click: the picker may open
  });
  artCheck.addEventListener('close', () => finishCheck(false)); // Esc / closed any other way = not used

  /** The printed front at the check-picture size: the customer's artwork where it is placed, or the sample card. */
  async function renderUnderlay(art, spec) {
    const { W, H } = artCheckSize(spec);
    if (!art) {
      const out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      out.getContext('2d').drawImage(card.artwork.demo().print, 0, 0, W, H);
      return out;
    }
    const { rect, extend } = placeArtwork(art.aspect, spec, art.placement ?? null);
    const px = { x: rect.x * W, y: rect.y * H, w: rect.w * W, h: rect.h * H };
    return placeOnTrim(await art.render(Math.max(1, Math.round(px.w)), Math.max(1, Math.round(px.h))), W, H, px, { extend });
  }

  async function checkArt(file, side) {
    const layer = await layers.inspectFile(file, side === 'mask'); // an unreadable file throws here, like before
    try {
      return await openCheck({ side, layer, name: file.name });
    } finally {
      layer.dispose?.(); // read only for this pop-up
    }
  }

  // "edit position": the same pop-up on the file that is already in use (nothing is read or uploaded again)
  async function editPosition(side) {
    const slot = CHECK_SLOT[side];
    const layer = layers.state[slot];
    if (!layer) return;
    const ok = await openCheck({ side, layer, name: layer.name, placement: layer.placement ?? null, edit: true });
    if (!ok) return;
    await layers.setPlacement(slot, ok.placement);
    if (side === 'front') mine.frontPlacement = ok.placement; // "การ์ดของคุณ" brings the file back where it was put
    if (side === 'back') mine.backPlacement = ok.placement;
  }

  /** Open the pop-up on `layer`; resolves with { placement } when used, null when not. Does not dispose the layer. */
  async function openCheck({ side, layer, name, placement = null, edit = false }) {
    const isShape = side === 'mask';
    {
      finishCheck(false); // a pop-up left open by an earlier file loses
      const spec = card.spec;
      check = { side, edit, src: await renderArtCheckSource(layer), aspect: layer.aspect, spec, placement: placement ? { ...placement } : null, follow: null, underlay: null, size: { width: layers.state.shape.width, height: layers.state.shape.height }, closed: false };
      if (isShape) {
        // the shape is lined up against the printed front as it is now (the customer's artwork, or the sample card)
        const art = layers.state.art;
        check.follow = art?.placement && compareAspect(layer.aspect, art.aspect) ? art.placement : null;
        check.underlay = await renderUnderlay(art, spec);
      }
      $('#artCheckTitle').textContent = edit ? `แก้ไขตำแหน่ง${SIDE_LABEL[side]}` : isShape ? 'ตรวจตำแหน่งเทคนิคพิเศษ' : 'ตรวจตำแหน่งตัดก่อนใช้ภาพ';
      $('#artCheckFile').textContent = `${SIDE_LABEL[side]} · ${name}`;
      $('#artCheckAsk').textContent = EXTEND_BG_ASK;
      $('#artCheckSafeLegend').hidden = check.spec.kind === 'custom';
      $('#artCheckAgain').hidden = edit;
      $('#artCheckUse').textContent = edit ? 'บันทึกตำแหน่ง' : 'ใช้ภาพนี้';
      $('#artCheckSizeNote').textContent = '';
      redrawCheck();
      const answer = new Promise((resolve) => (answerCheck = resolve));
      artCheck.showModal();
      return await answer;
    }
  }

  async function useFront(file) {
    const ok = await checkArt(file, 'front');
    if (!ok) return;
    await layers.setArt(file, ok.placement);
    if (layers.state.art) Object.assign(mine, { front: file, frontPlacement: ok.placement }); // only once it loaded
    state.side = 'front';
  }
  async function useBack(file) {
    const ok = await checkArt(file, 'back');
    if (!ok) return;
    if (!showingMine() && mine.front) await layers.setArt(mine.front, mine.frontPlacement); // a back belongs to the customer's card
    await layers.setBackArt(file, ok.placement);
    if (layers.state.backArt) Object.assign(mine, { back: file, backPlacement: ok.placement });
    state.side = 'back';
  }
  /** A finish shape: lined up against the printed front in the same pop-up, then used with the chosen placement. */
  async function useMask(file) {
    const ok = await checkArt(file, 'mask');
    if (!ok) return;
    await layers.setMask(file, ok.placement);
    state.side = 'front';
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
      await layers.setArt(mine.front, mine.frontPlacement);
      if (mine.back) await layers.setBackArt(mine.back, mine.backPlacement);
      state.side = 'front';
    });
  });
  $('#frontReplace').addEventListener('click', pickFront);
  $('#frontEdit').addEventListener('click', () => act(() => editPosition('front')));
  $('#backEdit').addEventListener('click', () => act(() => editPosition('back')));
  $('#maskEdit').addEventListener('click', () => act(() => editPosition('mask')));
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
    if (file) act(() => useMask(file));
  });
  $('#maskInvert').addEventListener('change', (e) => act(() => layers.setMaskInvert(e.target.checked)));

  /* ---------------------------------------------------------------- export */

  // The export code (plan, PDF / SVG writers, SVG converter) is only fetched when this step is opened or used,
  // so it costs the page nothing until then.
  let planner = null;
  let exportReport = [];
  const exportOptions = () => ({ colorMode: $('#exportColor').value, jobPage: $('#exportJob').checked });
  const exportSources = () => ({ ...layers.exportSources(), paperId: state.paper, material: state.material, coatingId: state.coating, finishId: state.finish });

  async function runExport(kind) {
    const { exportFile, exportDielineFile, downloadBlob } = await import('./exportFiles.js');
    setBusy(true, { pdf: 'กำลังสร้างไฟล์ PDF…', svg: 'กำลังสร้างไฟล์ SVG…', dieline: 'กำลังสร้างไฟล์เส้นตัด…' }[kind]);
    try {
      const metadata = { name: $('#exportCustomer').value.trim(), jobName: $('#exportJobName').value.trim(), materialName: $('#exportMaterialName').value.trim(), quantity: Number($('#exportQuantity').value), spec: { width: card.spec.bounds.w, height: card.spec.bounds.h, paper: state.paper } };
      if (!metadata.name || !metadata.jobName || !metadata.materialName || !Number.isInteger(metadata.quantity) || metadata.quantity < 1 || metadata.quantity > 100000) throw new Error('กรุณากรอกชื่อลูกค้า ชื่องาน วัสดุ และจำนวนผลิตก่อนดาวน์โหลด');
      // the cutting file is one PDF with only the die-line (no artwork needed); the others are the artwork bundle
      const built = kind === 'dieline'
        ? [{ ...(await exportDielineFile(exportSources(), exportOptions())), kind: 'pdf', side: 'dieline' }]
        : await buildArtworkBundle(exportFile, exportSources(), exportOptions(), [kind]);
      const results = nameArtworkBundle(built, metadata);
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
  $('#exportDieline').addEventListener('click', () => act(() => runExport('dieline')));
  for (const sel of ['#exportColor', '#exportJob']) $(sel).addEventListener('change', () => render());
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
    else act(() => useMask(file));
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
    const cm = (mm) => +(mm / 10).toFixed(2); // sizes are shown to customers in cm
    const bounds = `${cm(spec.bounds.w)}×${cm(spec.bounds.h)} cm`;

    // step 1 — artwork: front, back, card shape and size
    pressed($('#shapeChips'), d.shape.kind);
    const scaleText = d.previewScale > 1 ? `สเกล 1:${d.previewScale}` : ''; // the 3D model is a scale model of a big job
    $('#shapeSum').textContent = [kind?.label ?? '', bounds, scaleText].filter(Boolean).join(' · ');
    $('#presetField').hidden = custom;
    $('#radiusField').hidden = d.shape.kind !== 'rounded';
    $('#bleedField').hidden = custom;
    $('#cutBox').hidden = !custom;
    setValue($('#sizeW'), cm(spec.bounds.w));
    setValue($('#sizeH'), cm(spec.bounds.h));
    $('#sizeH').readOnly = custom; // the height follows the die-cut shape
    setValue($('#sizeR'), d.shape.radius);
    $('#bleedSel').value = String(d.shape.bleed || 0);
    const preset = SIZE_PRESETS.find((p) => p.w === spec.bounds.w && p.h === spec.bounds.h);
    $('#sizePreset').value = preset?.id ?? 'x';
    $('#cutInvertWrap').hidden = !(custom && d.cutKind === 'png');
    $('#cutUpload').textContent = d.cutName ? `เปลี่ยนไฟล์ไดคัท (${shortName(d.cutName, 24)})` : 'เลือกไฟล์ไดคัท (SVG / PNG)…';
    $('#cutUpload').title = d.cutName ?? '';
    $('#cutDesc').textContent = d.cutName
      ? `${d.cutKind === 'svg' ? 'อ่านเส้นจากไฟล์ SVG' : 'สกัดเส้นจากภาพ PNG'} — ตั้งความกว้างของบัตรจริงเป็น cm ด้านล่าง (ความสูงคำนวณให้) กรอบงานเท่ากับกรอบของไฟล์นี้ ไฟล์แบบและรูปทรงเทคนิคพิเศษที่ใช้ Artboard เดียวกันจะตรงกันเอง`
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
    $('#frontEdit').hidden = !d.artName;
    $('#backEdit').hidden = !d.backArtName;
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
    $('#maskEdit').hidden = !d.maskName;
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

    $('#caption').textContent = [state.material?.name ?? paper.label, state.coating === 'none' ? '' : coat.label, state.finish === 'none' ? '' : finish.label, scaleText].filter(Boolean).join(' · ');
    renderExport(d);
  }
  render();

  return { render, state, selectPaper, selectCoating, selectFinish };
}
