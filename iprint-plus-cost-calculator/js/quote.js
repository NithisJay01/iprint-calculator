function formatCreatedAt(value) {
    if (!value) return '-';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString('th-TH-u-ca-gregory', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

let isPrintingQuote = false;

function setPrintQuoteLoading(isLoading) {
    const button = $('printQuote');

    if (!button) return;

    if (isLoading) {
      button.dataset.defaultLabel = button.textContent;
      button.textContent = 'กำลังบันทึกใบเสนอราคา…';
      button.classList.add('is-loading');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      return;
    }

    button.textContent = button.dataset.defaultLabel || 'ยืนยัน';
    button.classList.remove('is-loading');
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }

function formatNotionDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

function buildQuote() {
    if (!Array.isArray(cartItems) || !cartItems.length) return null;

    const customerInput = $('quoteCustomer');
    const customerPageIdInput = $('quoteCustomerPageId');

    const customerPageId = customerPageIdInput
      ? String(customerPageIdInput.value || '').trim()
      : '';

    const inputName = customerInput
      ? String(customerInput.value || '').trim()
      : '';

    const selectedCustomer = customerPageId
      ? customers.find(customer =>
          String(customer.id) === customerPageId
        )
      : null;

    const customer = selectedCustomer?.name || inputName || '-';

    const recipient = String($('quoteRecipient')?.value || '').trim();
    const phone = String($('quotePhone')?.value || '').trim();
    const email = String($('quoteContact')?.value || '').trim();
    const lineId = String($('quoteLine')?.value || '').trim();
    const contact = [phone && `โทร ${phone}`, email && `อีเมล ${email}`, lineId && `Line ${lineId}`].filter(Boolean).join(' • ') || '-';
    const taxId = String($('quoteTaxId')?.value || '').trim();
    const address = String($('quoteAddress')?.value || '').trim() || '-';
    if(!currentQuoteMeta) {
      const now = new Date();
      currentQuoteMeta= {
        quoteNo:quoteSeq(),
        date:now.toLocaleDateString('th-TH-u-ca-gregory', {
          year:'numeric',month:'2-digit',day:'2-digit'
        }),
        notionDate:formatNotionDate(now),
        createdAt:now.toISOString(),
        requestKey:cartId('order')
      }
      ;
    }
    const items=quoteItems();
    let rows='';
    items.forEach((it,i)=>rows+='<tr><td>'+(i+1)+'</td><td><b>'+escapeHtml(it.name)+'</b><br><span>'+escapeHtml(it.size)+'</span></td><td>'+Number(it.qty).toLocaleString('th-TH')+' '+escapeHtml(it.unit)+'</td><td>฿'+money(it.price)+'</td></tr>');
    const totalSheets=cartItems.reduce((sum,item)=>sum+(Number(item.sheets)||0),0);
    const summary=quotePriceSummary();
    $('quotePreview').innerHTML='<div class="quote-top"><div><div class="quote-brand">iPrint</div><div class="quote-meta">Design & Production</div></div><div class="quote-title">ใบเสนอราคา<div class="quote-meta">เลขที่ '+currentQuoteMeta.quoteNo+'<br>'+currentQuoteMeta.date+'<br>สร้างเมื่อ '+formatCreatedAt(currentQuoteMeta.createdAt)+'</div></div></div><div class="quote-customer"><b>ลูกค้า:</b> '+escapeHtml(customer)+'<br><b>เลขประจำตัวผู้เสียภาษี:</b> '+escapeHtml(taxId || '-')+'<br><b>ติดต่อ:</b> '+escapeHtml(contact)+'<br><b>ที่อยู่:</b> '+escapeHtml(address)+'</div><table class="quote-table"><thead><tr><th>#</th><th>รายการ</th><th>จำนวน</th><th>ราคา</th></tr></thead><tbody>'+rows+'</tbody></table><div class="quote-total"><span>จำนวนรายการ</span><span>'+cartItems.length.toLocaleString('th-TH')+' รายการ • '+totalSheets.toLocaleString('th-TH')+' แผ่น</span></div><div class="quote-total"><span>ราคาก่อน VAT</span><span>฿'+money(summary.subtotal)+'</span></div><div class="quote-total"><span>VAT 7%</span><span>฿'+money(summary.vat)+'</span></div><div class="quote-total" style="font-size:14px;border-top:2px solid #111;padding-top:8px"><span>ยอดรวมสุทธิ</span><span>฿'+money(summary.grandTotal)+'</span></div>';
    return {
      orderKey:currentQuoteMeta.requestKey,
      quoteNo:currentQuoteMeta.quoteNo,
      date:currentQuoteMeta.notionDate,
      displayDate:currentQuoteMeta.date,
      createdAt:currentQuoteMeta.createdAt || new Date().toISOString(),
      customer,
      customerPageId,
      recipient,
      phone,
      email,
      lineId,
      contact,
      taxId,
      address,
      priceReviewRequested: !!$('priceReviewRequest')?.checked,
      items,
      orderItems:publicOrderItems(),
      total:summary.subtotal,
      vat:summary.vat,
      grandTotal:summary.grandTotal,
      sheets:totalSheets,
      pieceCount:cartItems.reduce((sum,item)=>sum+(Number(item.quantity)||0),0),
      size:cartItems.length+' รายการ',
      paper:''
    }
    ;
  }

function escapeHtml(s) {
    return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')
  }

function escapeSvg(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

function shortenPreviewText(value, maximum = 48) {
    const text = String(value || '-').replace(/\s+/g, ' ').trim();

    return text.length > maximum ? text.slice(0, maximum - 1) + '…' : text;
  }

function quotePreviewSvg(quote) {
    const width = 900;
    const rowHeight = 58;
    const items = Array.isArray(quote.items) ? quote.items : [];
    const tableTop = 270;
    const totalTop = tableTop + 42 + Math.max(1, items.length) * rowHeight + 22;
    const height = totalTop + 180;
    const rows = items.map((item, index) => {
      const top = tableTop + 42 + index * rowHeight;
      const size = shortenPreviewText(item.size, 36);

      return `
        <line x1="45" y1="${top + rowHeight}" x2="855" y2="${top + rowHeight}" stroke="#d9dde2"/>
        <text x="55" y="${top + 25}" class="body">${index + 1}</text>
        <text x="90" y="${top + 21}" class="strong">${escapeSvg(shortenPreviewText(item.name, 36))}</text>
        <text x="90" y="${top + 42}" class="muted">${escapeSvg(size)}</text>
        <text x="615" y="${top + 30}" class="body">${escapeSvg(Number(item.qty || 0).toLocaleString('th-TH'))} ${escapeSvg(item.unit)}</text>
        <text x="840" y="${top + 30}" text-anchor="end" class="body">฿${escapeSvg(money(item.price))}</text>`;
    }).join('');
    const subtotal = Number(quote.total) || 0;
    const vat = subtotal * 0.07;
    const grandTotal = subtotal + vat;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <style>
        text { font-family: Arial, Tahoma, sans-serif; fill: #111315; }
        .brand { font-size: 34px; font-weight: 800; }
        .title { font-size: 25px; font-weight: 700; }
        .meta { font-size: 15px; fill: #687078; }
        .body { font-size: 16px; }
        .strong { font-size: 16px; font-weight: 700; }
        .muted { font-size: 13px; fill: #687078; }
        .head { font-size: 14px; font-weight: 700; fill: #687078; }
        .total { font-size: 18px; font-weight: 700; }
      </style>
      <rect width="100%" height="100%" fill="#ffffff"/>
      <text x="45" y="62" class="brand">iPrint</text>
      <text x="45" y="87" class="meta">Design &amp; Production</text>
      <text x="855" y="56" text-anchor="end" class="title">ใบเสนอราคา</text>
      <text x="855" y="82" text-anchor="end" class="meta">เลขที่ ${escapeSvg(quote.quoteNo)}</text>
      <text x="855" y="105" text-anchor="end" class="meta">${escapeSvg(quote.displayDate || quote.date)}</text>
      <line x1="45" y1="125" x2="855" y2="125" stroke="#111315" stroke-width="2"/>
      <text x="45" y="157" class="strong">ลูกค้า: ${escapeSvg(shortenPreviewText(quote.customer, 55))}</text>
      <text x="45" y="183" class="body">ติดต่อ: ${escapeSvg(shortenPreviewText(quote.contact, 65))}</text>
      <text x="45" y="209" class="body">เลขประจำตัวผู้เสียภาษี: ${escapeSvg(shortenPreviewText(quote.taxId || '-', 45))}</text>
      <text x="45" y="235" class="body">ที่อยู่: ${escapeSvg(shortenPreviewText(quote.address, 92))}</text>
      <rect x="45" y="${tableTop}" width="810" height="42" fill="#f3f5f7"/>
      <text x="55" y="${tableTop + 27}" class="head">#</text>
      <text x="90" y="${tableTop + 27}" class="head">รายการ</text>
      <text x="615" y="${tableTop + 27}" class="head">จำนวน</text>
      <text x="840" y="${tableTop + 27}" text-anchor="end" class="head">ราคา</text>
      ${rows}
      <text x="620" y="${totalTop}" class="body">ราคาก่อน VAT</text>
      <text x="840" y="${totalTop}" text-anchor="end" class="body">฿${escapeSvg(money(subtotal))}</text>
      <text x="620" y="${totalTop + 31}" class="body">VAT 7%</text>
      <text x="840" y="${totalTop + 31}" text-anchor="end" class="body">฿${escapeSvg(money(vat))}</text>
      <line x1="615" y1="${totalTop + 48}" x2="855" y2="${totalTop + 48}" stroke="#111315" stroke-width="2"/>
      <text x="620" y="${totalTop + 80}" class="total">ยอดรวมสุทธิ</text>
      <text x="840" y="${totalTop + 80}" text-anchor="end" class="total">฿${escapeSvg(money(grandTotal))}</text>
    </svg>`;
  }

async function captureQuotePreview(quote) {
    const svg = quotePreviewSvg(quote);
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const imageUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await new Promise((resolve, reject) => {
        const preview = new Image();
        preview.onload = () => resolve(preview);
        preview.onerror = () => reject(new Error('สร้างภาพ Preview ไม่สำเร็จ'));
        preview.src = imageUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext('2d').drawImage(image, 0, 0);

      return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('แปลงภาพ Preview เป็น PNG ไม่สำเร็จ'));
        }, 'image/png');
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

async function attachQuotePreview(quoteId, quote) {
    const image = await captureQuotePreview(quote);
    const safeQuoteNo = String(quote.quoteNo || 'quote').replace(/[^a-zA-Z0-9_-]/g, '-');

    return attachQuotePreviewRemote(
      quoteId,
      image,
      safeQuoteNo + '-preview.png'
    );
  }

function openQuote() {
    if(!Array.isArray(cartItems)||!cartItems.length) {
      alert('กรุณาเพิ่มชิ้นงานลงตะกร้าก่อน');
      return
    }
    closeCart();
    currentQuoteMeta=null;
    $('quoteModal').classList.add('open');
    $('quoteModal').setAttribute('aria-hidden','false');
    buildQuote()
  }

function closeQuote(returnToCart = true) {
    $('quoteModal').classList.remove('open');
    $('quoteModal').setAttribute('aria-hidden','true');
    currentQuoteMeta=null;
    if (returnToCart && cartItems.length && typeof showAppView === 'function') showAppView('cart');
  }

async function printQuote() {
    if (isPrintingQuote) return;

    const startedAt = Date.now();
    isPrintingQuote = true;
    setPrintQuoteLoading(true);

    try {
      let q = buildQuote();

      if (!q) return;

      if (!String(q.customer || '').trim() || q.customer === '-') {
        $('quoteCustomer')?.focus();
        $('quoteSaveStatus').textContent = 'กรุณาระบุชื่อลูกค้าหรือบริษัท';
        return;
      }

      if (!String(q.phone || q.email || q.lineId || '').trim()) {
        $('quotePhone')?.focus();
        $('quoteSaveStatus').textContent = 'กรุณาระบุช่องทางติดต่ออย่างน้อย 1 ช่องทาง';
        return;
      }

      q = await ensureQuoteCustomer(q);

      const customerName =
        String($('quoteCustomer')?.value || '').trim();

      if (customerName && !q.customerPageId) {
        setStatus(
          'customerStatus',
          'ไม่สามารถสร้าง/เชื่อม Customer ได้ • ตรวจ API Key และ Notion Database',
          'warn'
        );

        alert(
          'ยังไม่สามารถเชื่อม Customer กับ Notion ได้\n\n' +
          'กรุณาตรวจ API Key และลองใหม่อีกครั้ง'
        );

        return;
      }

      const hasApiKey = !!getWriteApiKey();
      const quotePreviewImage = await captureQuotePreview(q);
      const remote = hasApiKey
        ? await createOrderRemote(q, quotePreviewImage, [])
        : false;

      if (!remote?.success) {
        await saveQuoteLocal(q);

        $('quoteSaveStatus').textContent = hasApiKey
          ? `สร้างออเดอร์ใน Notion ไม่สำเร็จ: ${remote?.error || 'ไม่ทราบสาเหตุ'} • เก็บประวัติไว้ในเครื่องแล้ว`
          : 'ยังไม่ได้ตั้ง API Key • เก็บประวัติไว้ในเครื่องแล้ว';
        return;
      } else {
        if (typeof rememberOrder === 'function') rememberOrder(remote, q);
        await clearCartAfterOrder();
        $('quoteSaveStatus').textContent = remote.duplicate
          ? 'ออเดอร์นี้มีอยู่ใน Notion แล้ว • ไม่สร้างข้อมูลซ้ำ'
          : IPRINT_TEST_MODE
            ? `Test Mode • สร้าง Mock Ticket และ Order Items ${remote.itemIds?.length || q.orderItems.length} รายการแล้ว (ไม่เรียก API)`
            : `สร้าง Ticket และ Order Items ${remote.itemIds?.length || q.orderItems.length} รายการใน Notion แล้ว`;
        closeQuote(false);
        if (typeof showAppView === 'function') showAppView('home');
        if (typeof showOrderSuccess === 'function') showOrderSuccess(remote, q);
      }
    } finally {
      const remaining = Math.max(0, 2500 - (Date.now() - startedAt));

      setTimeout(() => {
        isPrintingQuote = false;
        setPrintQuoteLoading(false);
      }, remaining);
    }
  }
