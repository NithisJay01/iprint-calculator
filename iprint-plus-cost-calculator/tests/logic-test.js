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
      const material = document.getElementById('materialSelect');
      const services = [...document.querySelectorAll('#servicesContainer input[type="checkbox"]')];
      const original = {
        qty: qty.value,
        material: material.value,
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

      setValue(window, qty, original.qty);
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
