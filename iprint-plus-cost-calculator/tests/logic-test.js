(() => {
  const frame = document.getElementById('app');
  const runButton = document.getElementById('runTests');
  const summary = document.getElementById('summary');
  const results = document.getElementById('results');
  const generatedPreview = document.getElementById('generatedPreview');
  const generatedPreviewImage = generatedPreview.querySelector('img');

  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const numberFromText = value => Number(String(value).replace(/[^0-9.-]/g, ''));

  function addResult(name, passed, detail = '') {
    const row = document.createElement('li');
    row.className = passed ? 'pass' : 'fail';
    row.textContent = `${passed ? 'ผ่าน' : 'ไม่ผ่าน'} — ${name}${!passed && detail ? `: ${detail}` : ''}`;
    results.appendChild(row);
  }

  function assert(condition, name, detail) {
    addResult(name, Boolean(condition), detail);
    if (!condition) throw new Error(detail || name);
  }

  function setValue(window, element, value) {
    element.value = String(value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  function samplePngFile(window, name) {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9JwAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(window.atob(base64), character => character.charCodeAt(0));
    return new window.File([bytes], name, { type: 'image/png' });
  }

  function setFiles(window, element, files) {
    const transfer = new window.DataTransfer();
    files.forEach(file => transfer.items.add(file));
    Object.defineProperty(element, 'files', {
      configurable: true,
      value: transfer.files
    });
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  function dropFiles(window, element, files) {
    const transfer = new window.DataTransfer();
    files.forEach(file => transfer.items.add(file));
    const event = new window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      configurable: true,
      value: transfer
    });
    element.dispatchEvent(event);
  }

  async function waitForApp() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const appWindow = frame.contentWindow;
      const appDocument = frame.contentDocument;
      const sheet = appDocument?.getElementById('sheet');

      if (appWindow?.Iprint && sheet?.options.length && sheet.value) {
        return { window: appWindow, document: appDocument };
      }

      await wait(150);
    }

    throw new Error('แอปไม่พร้อมภายในเวลาที่กำหนด');
  }

  async function run() {
    results.innerHTML = '';
    runButton.disabled = true;
    summary.textContent = 'กำลังทดสอบ…';
    let passed = 0;
    let failed = 0;

    const check = async (name, callback) => {
      try {
        await callback();
        passed += 1;
      } catch (error) {
        failed += 1;
        if (!results.lastElementChild || !results.lastElementChild.textContent.includes(name)) {
          addResult(name, false, error.message);
        }
      }
    };

    try {
      const app = await waitForApp();
      const { window, document } = app;
      const qty = document.getElementById('qty');
      const cost = document.getElementById('cost');
      const pieceGap = document.getElementById('pieceGap');
      const bleed = document.getElementById('bleed');
      const artwork = document.getElementById('artworkImage');
      const references = document.getElementById('referenceImages');
      const graphicBriefDescription = document.getElementById('graphicBriefDescription');
      const material = document.getElementById('materialSelect');
      const services = [...document.querySelectorAll('#servicesContainer input[type="checkbox"]')];
      const original = {
        qty: qty.value,
        pieceGap: pieceGap.value,
        bleed: bleed.value,
        material: material.value,
        graphicBriefDescription: graphicBriefDescription.value,
        services: services.map(service => service.checked)
      };
      const now = new Date();
      const quoteSequenceKey = 'lastQuoteSeq:' + now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0');
      const originalQuoteSequence = window.localStorage.getItem(quoteSequenceKey);

      await check('เริ่มต้นแอปและโหลด Preset', () => {
        assert(window.Iprint && typeof window.Iprint.calculate === 'function', 'เริ่มต้นแอปและโหลด Preset', 'ไม่พบ API ของแอป');
        assert(document.getElementById('sheet').options.length > 0, 'เริ่มต้นแอปและโหลด Preset', 'ไม่พบ Preset');
        assert(document.getElementById('paperPreviewSheet').contains(document.getElementById('sheet')), 'เริ่มต้นแอปและโหลด Preset', 'ส่วนไซส์ / พื้นที่ใช้งานต้องอยู่ใน Side Sheet ตั้งค่า Preview');
        assert(Number(cost.value) === 2.5, 'เริ่มต้นแอปและโหลด Preset', 'ต้นทุนต่อแผ่นเริ่มต้นต้องเป็น 2.5 บาท');
        assert(Number(pieceGap.value) === 3, 'เริ่มต้นแอปและโหลด Preset', 'Gap เริ่มต้นต้องเป็น 3 mm');
        assert(pieceGap.type === 'range' && pieceGap.min === '1' && pieceGap.max === '15' && pieceGap.step === '0.5', 'เริ่มต้นแอปและโหลด Preset', 'Slider ระยะห่างต้องเป็น 1–15 mm ทีละ 0.5 mm');
        assert(bleed.type === 'range' && bleed.min === '1' && bleed.max === '15' && bleed.step === '0.5', 'เริ่มต้นแอปและโหลด Preset', 'Slider Bleed ต้องเป็น 1–15 mm ทีละ 0.5 mm');
        assert(document.getElementById('pieceGapKnob') && document.getElementById('bleedKnob'), 'เริ่มต้นแอปและโหลด Preset', 'ไม่พบ Virtual Knob สำหรับ Gap และ Bleed');
        const quickActions = document.querySelector('.preview-quick-actions');
        assert(quickActions?.contains(document.getElementById('openPaperPreviewSettings')) && quickActions?.contains(document.getElementById('openBriefAssets')) && quickActions?.contains(document.getElementById('openMaterialsServices')), 'เริ่มต้นแอปและโหลด Preset', 'ไม่พบปุ่มด่วนด้านขวาของ Preview');
        document.getElementById('openPaperPreviewSettings').click();
        assert(document.getElementById('paperPreviewSheet').classList.contains('open'), 'เริ่มต้นแอปและโหลด Preset', 'ปุ่มตั้งค่า Preview ไม่เปิด Side Sheet');
        document.getElementById('closePaperPreviewSettings').click();
      });

      await check('Preview แสดง Preset และจัดชิ้นงานกึ่งกลาง', () => {
        const usable = document.querySelector('.preview-usable');
        const grid = document.querySelector('.preview-grid');
        const preset = document.getElementById('previewPaperName').textContent;
        const usableWidth = parseFloat(usable?.style.width || 0);
        const usableHeight = parseFloat(usable?.style.height || 0);
        const gridWidth = grid?.getBoundingClientRect().width || 0;
        const gridHeight = grid?.getBoundingClientRect().height || 0;
        const left = parseFloat(grid?.style.left || 0);
        const top = parseFloat(grid?.style.top || 0);

        assert(usable && grid, 'Preview แสดง Preset และจัดชิ้นงานกึ่งกลาง', 'ไม่พบ Preview layout');
        assert(preset.startsWith('Preset: ') && preset !== 'Preset: —', 'Preview แสดง Preset และจัดชิ้นงานกึ่งกลาง', 'ไม่แสดงชื่อ Preset');
        assert(Math.abs(left - (usableWidth - gridWidth) / 2) < 1.5, 'Preview แสดง Preset และจัดชิ้นงานกึ่งกลาง', 'ชิ้นงานไม่ได้อยู่กึ่งกลางแนวนอน');
        assert(Math.abs(top - (usableHeight - gridHeight) / 2) < 1.5, 'Preview แสดง Preset และจัดชิ้นงานกึ่งกลาง', 'ชิ้นงานไม่ได้อยู่กึ่งกลางแนวตั้ง');
      });

      await check('ดับเบิลคลิก Preview เพื่อเลือกภาพได้', () => {
        const preview = document.getElementById('previewDropZone');
        const originalClick = artwork.click;
        let pickerOpened = false;
        artwork.click = () => { pickerOpened = true; };
        try {
          preview.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
          assert(pickerOpened, 'ดับเบิลคลิก Preview เพื่อเลือกภาพได้', 'ดับเบิลคลิกแล้วไม่เปิดตัวเลือกภาพ');
        } finally {
          artwork.click = originalClick;
        }
      });

      await check('ปรับ Bleed ใน Preview ได้โดยไม่เปลี่ยนสูตร', async () => {
        const yieldBefore = numberFromText(document.getElementById('yield').textContent);
        setValue(window, bleed, 5);
        await wait(50);
        const yieldAfter = numberFromText(document.getElementById('yield').textContent);
        const bleedBox = document.querySelector('.piece .bleed');
        assert(document.getElementById('bleedSummary').textContent === '5', 'ปรับ Bleed ใน Preview ได้โดยไม่เปลี่ยนสูตร', 'ค่า Bleed ในสรุปไม่อัปเดต');
        assert(document.getElementById('bleedValue').textContent === '5 mm/ด้าน', 'ปรับ Bleed ใน Preview ได้โดยไม่เปลี่ยนสูตร', 'ค่า Bleed บน Slider ไม่อัปเดต');
        assert(document.getElementById('previewInfo').textContent.includes('Bleed 5 mm/ด้าน'), 'ปรับ Bleed ใน Preview ได้โดยไม่เปลี่ยนสูตร', 'Preview ไม่อัปเดต Bleed');
        assert(parseFloat(bleedBox?.style.left || 0) > 0, 'ปรับ Bleed ใน Preview ได้โดยไม่เปลี่ยนสูตร', 'ไม่พบกรอบ Bleed ที่อัปเดต');
        assert(yieldAfter === yieldBefore, 'ปรับ Bleed ใน Preview ได้โดยไม่เปลี่ยนสูตร', 'Bleed ไม่ควรเปลี่ยนจำนวนชิ้นต่อแผ่น');
      });

      await check('ควบคุม Gap และใช้ในสูตรการวางชิ้นงาน', async () => {
        const withoutGap = window.Iprint.findBest({ usableW: 8.1, usableH: 8.1 }, 4, 4, 0);
        const withGap = window.Iprint.findBest({ usableW: 8.1, usableH: 8.1 }, 4, 4, 3);

        assert(withoutGap?.yield === 4, 'ควบคุม Gap และใช้ในสูตรการวางชิ้นงาน', 'สูตรไม่คำนวณกรณีไม่มี Gap ถูกต้อง');
        assert(withGap?.yield === 1, 'ควบคุม Gap และใช้ในสูตรการวางชิ้นงาน', 'Gap ต้องลดจำนวนที่วางได้ตามพื้นที่จริง');

        setValue(window, pieceGap, 3);
        await wait(50);
        const grid = document.querySelector('.preview-grid');
        assert(document.getElementById('gap').textContent === '3', 'ควบคุม Gap และใช้ในสูตรการวางชิ้นงาน', 'ค่า Gap ในสรุปไม่อัปเดต');
        assert(document.getElementById('pieceGapValue').textContent === '3 mm', 'ควบคุม Gap และใช้ในสูตรการวางชิ้นงาน', 'ค่า Gap บน Slider ไม่อัปเดต');
        assert(document.getElementById('previewInfo').textContent.includes('Gap 3 mm'), 'ควบคุม Gap และใช้ในสูตรการวางชิ้นงาน', 'Preview ไม่อัปเดต Gap');
        assert(parseFloat(grid?.style.gap || 0) > 0, 'ควบคุม Gap และใช้ในสูตรการวางชิ้นงาน', 'Preview ไม่แสดงช่องว่างระหว่างชิ้นงาน');
      });

      await check('ภาพงานใน Preview เป็นข้อมูลชั่วคราว', async () => {
        setFiles(window, artwork, [samplePngFile(window, 'artwork.png')]);
        setFiles(window, references, [
          samplePngFile(window, 'ref-1.png'),
          samplePngFile(window, 'ref-2.png'),
          samplePngFile(window, 'ref-3.png'),
          samplePngFile(window, 'ref-4.png')
        ]);
        await wait(50);
        dropFiles(window, document.getElementById('previewDropZone'), [samplePngFile(window, 'dragged-artwork.png')]);
        await wait(50);
        const yieldPerSheet = numberFromText(document.getElementById('yield').textContent);
        const artworkPreviews = document.querySelectorAll('.piece-artwork');

        assert(artworkPreviews.length === yieldPerSheet, 'ภาพงานใน Preview เป็นข้อมูลชั่วคราว', 'ภาพงานหลักไม่แสดงในทุกชิ้นของ Preview');
        assert(document.getElementById('artworkCurrent').hidden === false, 'ภาพงานใน Preview เป็นข้อมูลชั่วคราว', 'ไม่แสดงรายการภาพงานหลัก');
        assert(document.getElementById('artworkName').textContent === 'dragged-artwork.png', 'ภาพงานใน Preview เป็นข้อมูลชั่วคราว', 'ไม่สามารถลากภาพลง Preview ได้');
        assert(document.querySelectorAll('.reference-item').length === 3, 'ภาพงานใน Preview เป็นข้อมูลชั่วคราว', 'Ref ต้องแนบได้สูงสุด 3 ภาพ');
        assert(window.Iprint.captureBriefImage, 'ภาพงานใน Preview เป็นข้อมูลชั่วคราว', 'ไม่สามารถสร้างภาพสรุปจากภาพงานหลัก');
      });

      await check('สูตรจำนวนแผ่นและราคาขาย', () => {
        const yieldPerSheet = numberFromText(document.getElementById('yield').textContent);
        const quantity = Number(qty.value);
        const sheets = numberFromText(document.getElementById('sheets').textContent);
        const total = numberFromText(document.getElementById('total').textContent);
        const sale = numberFromText(document.getElementById('sale').textContent);

        assert(yieldPerSheet > 0, 'สูตรจำนวนแผ่นและราคาขาย', 'ผลผลิตต่อแผ่นต้องมากกว่า 0');
        assert(sheets === Math.ceil(quantity / yieldPerSheet), 'สูตรจำนวนแผ่นและราคาขาย', 'จำนวนแผ่นไม่ตรงกับสูตรปัดขึ้น');
        assert(Math.abs(sale - total * 1.3) < 0.01, 'สูตรจำนวนแผ่นและราคาขาย', 'ราคาขายไม่ตรงกับกำไร 30%');
      });

      await check('คำนวณใหม่เมื่อเปลี่ยนจำนวน', async () => {
        const yieldPerSheet = numberFromText(document.getElementById('yield').textContent);
        const sheetsBefore = numberFromText(document.getElementById('sheets').textContent);
        setValue(window, qty, sheetsBefore * yieldPerSheet + 1);
        await wait(50);
        const sheetsAfter = numberFromText(document.getElementById('sheets').textContent);
        assert(sheetsAfter === sheetsBefore + 1, 'คำนวณใหม่เมื่อเปลี่ยนจำนวน', 'จำนวนแผ่นไม่ได้อัปเดต');
      });

      await check('เลือกวัสดุและคำนวณยอดใหม่', async () => {
        const alternative = [...material.options].find(option => {
          const price = Number(option.textContent.match(/฿([0-9.]+)/)?.[1] || 0);

          return option.value && option.value !== original.material && price > 0;
        });
        if (!alternative) return addResult('เลือกวัสดุและคำนวณยอดใหม่', true, 'ข้าม: ไม่มีวัสดุทางเลือก');
        setValue(window, material, alternative.value);
        await wait(50);
        const totalAfter = numberFromText(document.getElementById('total').textContent);
        assert(material.value === alternative.value, 'เลือกวัสดุและคำนวณยอดใหม่', 'ระบบไม่ได้เก็บวัสดุที่เลือก');
        assert(Number.isFinite(totalAfter), 'เลือกวัสดุและคำนวณยอดใหม่', 'ยอดต้นทุนหลังเลือกวัสดุไม่ถูกต้อง');
      });

      await check('บริการมีผลต่อยอดต้นทุน', async () => {
        const service = services.find(item => !item.checked);
        if (!service) return addResult('บริการมีผลต่อยอดต้นทุน', true, 'ข้าม: ไม่มีบริการทางเลือก');
        const totalBefore = numberFromText(document.getElementById('total').textContent);
        service.checked = true;
        service.dispatchEvent(new window.Event('change', { bubbles: true }));
        await wait(50);
        const totalAfter = numberFromText(document.getElementById('total').textContent);
        assert(totalAfter >= totalBefore, 'บริการมีผลต่อยอดต้นทุน', 'เลือกบริการแล้วต้นทุนไม่อัปเดต');
      });

      await check('สร้าง Preview ใบเสนอราคาและ VAT', async () => {
        document.getElementById('openQuote').click();
        await wait(30);
        const preview = document.getElementById('quotePreview').textContent;
        const sale = numberFromText(document.getElementById('sale').textContent);
        const vatRow = [...document.querySelectorAll('.quote-total')].find(row => row.textContent.includes('VAT 7%'));
        const vat = numberFromText(vatRow?.querySelector('span:last-child')?.textContent);
        const quote = window.Iprint.buildQuote();
        const previewImage = await window.Iprint.captureQuotePreview(quote);
        generatedPreviewImage.src = URL.createObjectURL(previewImage);
        generatedPreview.style.display = 'block';
        assert(preview.includes('ใบเสนอราคา'), 'สร้าง Preview ใบเสนอราคาและ VAT', 'ไม่พบ Preview ใบเสนอราคา');
        assert(Math.abs(vat - sale * 0.07) < 0.01, 'สร้าง Preview ใบเสนอราคาและ VAT', 'VAT ไม่ตรงกับ 7%');
        assert(/^\d{4}-\d{2}-\d{2}$/.test(quote.date), 'สร้าง Preview ใบเสนอราคาและ VAT', 'วันที่สำหรับ Notion ต้องเป็น YYYY-MM-DD');
        assert(previewImage.type === 'image/png' && previewImage.size > 0, 'สร้าง Preview ใบเสนอราคาและ VAT', 'สร้างภาพ Preview สำหรับ Notion ไม่สำเร็จ');
        document.getElementById('closeQuote').click();
      });

      await check('สร้างภาพสรุปบรีฟงาน', async () => {
        graphicBriefDescription.value = 'ใช้โทนสีน้ำเงิน และเว้นพื้นที่โลโก้ด้านบน';
        const briefImage = await window.Iprint.captureBriefImage();
        const imageBitmap = await window.createImageBitmap(briefImage);
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 1;
        sampleCanvas.height = 1;
        sampleCanvas.getContext('2d').drawImage(imageBitmap, 20, 20, 1, 1, 0, 0, 1, 1);
        const headerPixel = sampleCanvas.getContext('2d').getImageData(0, 0, 1, 1).data;
        generatedPreviewImage.src = URL.createObjectURL(briefImage);
        generatedPreview.style.display = 'block';
        assert(briefImage.type === 'image/png' && briefImage.size > 0, 'สร้างภาพสรุปบรีฟงาน', 'สร้าง PNG สรุปบรีฟงานไม่สำเร็จ');
        assert(imageBitmap.width === 2160, 'สร้างภาพสรุปบรีฟงาน', 'ภาพสรุปต้องสร้างที่ความละเอียด 2160 px เพื่อให้ Preview ชัดเจน');
        assert(headerPixel[2] > 200 && headerPixel[0] < 30, 'สร้างภาพสรุปบรีฟงาน', 'ส่วนหัวของภาพสรุปแสดงผลผิดปกติ');
        imageBitmap.close();
      });

      await check('เตรียมข้อมูล Ticket จากบรีฟงาน', () => {
        const ticket = window.Iprint.buildBriefTicket();
        assert(ticket && ticket.title.startsWith('BRIEF-'), 'เตรียมข้อมูล Ticket จากบรีฟงาน', 'ไม่พบชื่อ Ticket');
        assert(ticket.size === document.getElementById('resultSize').textContent, 'เตรียมข้อมูล Ticket จากบรีฟงาน', 'ขนาดใน Ticket ไม่ตรงกับผลคำนวณ');
        assert(ticket.sheets === numberFromText(document.getElementById('sheets').textContent), 'เตรียมข้อมูล Ticket จากบรีฟงาน', 'จำนวนแผ่นใน Ticket ไม่ตรงกับผลคำนวณ');
        assert(!('gap' in ticket) && !('bleed' in ticket), 'เตรียมข้อมูล Ticket จากบรีฟงาน', 'Ticket ไม่ควรส่ง Gap หรือ Bleed ไป Notion');
        assert(!('costPerSheet' in ticket) && !('profitPercent' in ticket), 'เตรียมข้อมูล Ticket จากบรีฟงาน', 'Ticket ไม่ควรส่งต้นทุนต่อแผ่นหรือกำไรไป Notion');
        assert(ticket.graphicBriefDescription === graphicBriefDescription.value, 'เตรียมข้อมูล Ticket จากบรีฟงาน', 'คำอธิบายสำหรับกราฟิกไม่อยู่ใน Ticket');
        assert(ticket.extras.length > 0 && ticket.extras.every(item => item.pageId), 'เตรียมข้อมูล Ticket จากบรีฟงาน', 'Ticket ต้องเก็บ Page ID สำหรับ Relation วัสดุและบริการ');
      });

      setValue(window, qty, original.qty);
      setValue(window, pieceGap, original.pieceGap);
      setValue(window, bleed, original.bleed);
      graphicBriefDescription.value = original.graphicBriefDescription;
      window.Iprint.clearTemporaryImages();
      assert(document.getElementById('artworkCurrent').hidden === true, 'ล้างภาพงานชั่วคราว', 'ล้างภาพงานหลักไม่สำเร็จ');
      assert(document.querySelectorAll('.reference-item').length === 0, 'ล้างภาพงานชั่วคราว', 'ล้าง Ref ชั่วคราวไม่สำเร็จ');
      setValue(window, material, original.material);
      services.forEach((service, index) => {
        if (service.checked !== original.services[index]) {
          service.checked = original.services[index];
          service.dispatchEvent(new window.Event('change', { bubbles: true }));
        }
      });

      if (originalQuoteSequence === null) {
        window.localStorage.removeItem(quoteSequenceKey);
      } else {
        window.localStorage.setItem(quoteSequenceKey, originalQuoteSequence);
      }
    } catch (error) {
      failed += 1;
      addResult('เตรียมสภาพแวดล้อมทดสอบ', false, error.message);
    } finally {
      summary.className = failed ? 'fail' : 'pass';
      summary.textContent = `ผลทดสอบ: ผ่าน ${passed} รายการ, ไม่ผ่าน ${failed} รายการ`;
      runButton.disabled = false;
    }
  }

  runButton.addEventListener('click', run);
})();
