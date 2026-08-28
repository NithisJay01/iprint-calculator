function formatCreatedAt(value) {
    if (!value) return '-';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

function formatNotionDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

function buildQuote() {
    if (!lastCalc) return null;

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

    const contact = String($('quoteContact')?.value || '').trim() || '-';
    const taxId = String($('quoteTaxId')?.value || '').trim();
    const address = String($('quoteAddress')?.value || '').trim() || '-';
    if(!currentQuoteMeta) {
      const now = new Date();
      currentQuoteMeta= {
        quoteNo:quoteSeq(),
        date:now.toLocaleDateString('th-TH', {
          year:'numeric',month:'2-digit',day:'2-digit'
        }),
        notionDate:formatNotionDate(now)
      }
      ;
    }
    const items=quoteItems();
    let rows='';
    items.forEach((it,i)=>rows+='<tr><td>'+(i+1)+'</td><td><b>'+escapeHtml(it.name)+'</b><br><span>'+escapeHtml(it.size)+'</span></td><td>'+Number(it.qty).toLocaleString('th-TH')+' '+escapeHtml(it.unit)+'</td><td>฿'+money(it.price)+'</td></tr>');
    $('quotePreview').innerHTML='<div class="quote-top"><div><div class="quote-brand">iPrint</div><div class="quote-meta">Design & Production</div></div><div class="quote-title">ใบเสนอราคา<div class="quote-meta">เลขที่ '+currentQuoteMeta.quoteNo+'<br>'+currentQuoteMeta.date+'<br>สร้างเมื่อ '+formatCreatedAt(currentQuoteMeta.createdAt)+'</div></div></div><div class="quote-customer"><b>ลูกค้า:</b> '+escapeHtml(customer)+'<br><b>เลขประจำตัวผู้เสียภาษี:</b> '+escapeHtml(taxId || '-')+'<br><b>ติดต่อ:</b> '+escapeHtml(contact)+'<br><b>ที่อยู่:</b> '+escapeHtml(address)+'</div><table class="quote-table"><thead><tr><th>#</th><th>รายการ</th><th>จำนวน</th><th>ราคา</th></tr></thead><tbody>'+rows+'</tbody></table><div class="quote-total"><span>จำนวนแผ่นผลิต</span><span>'+lastCalc.sheets.toLocaleString('th-TH')+' แผ่น</span></div><div class="quote-total"><span>ราคาก่อน VAT</span><span>฿'+money(quotePriceSummary().subtotal)+'</span></div><div class="quote-total"><span>VAT 7%</span><span>฿'+money(quotePriceSummary().vat)+'</span></div><div class="quote-total" style="font-size:14px;border-top:2px solid #111;padding-top:8px"><span>ยอดรวมสุทธิ</span><span>฿'+money(quotePriceSummary().grandTotal)+'</span></div>';
    return {
      quoteNo:currentQuoteMeta.quoteNo,
      date:currentQuoteMeta.notionDate,
      displayDate:currentQuoteMeta.date,
      createdAt:currentQuoteMeta.createdAt || new Date().toISOString(),
      customer,
      customerPageId,
      contact,
      taxId,
      address,
      items,
      total:lastCalc.sale,
      sheets:lastCalc.sheets,
      pieceCount:lastCalc.Q,
      size:lastCalc.W.toFixed(2)+' × '+lastCalc.H.toFixed(2)+' cm',
      paper:lastCalc.paper?.name || ''
    }
    ;
  }

function escapeHtml(s) {
    return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')
  }

function openQuote() {
    if(!lastCalc) {
      alert('กรุณากรอกข้อมูลให้คำนวณก่อน');
      return
    }
    currentQuoteMeta=null;
    $('quoteModal').classList.add('open');
    $('quoteModal').setAttribute('aria-hidden','false');
    buildQuote()
  }

function closeQuote() {
    $('quoteModal').classList.remove('open');
    $('quoteModal').setAttribute('aria-hidden','true');
    currentQuoteMeta=null
  }

async function printQuote() {
    let q = buildQuote();

    if (!q) return;

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
    const remote = hasApiKey
      ? await saveQuoteRemote(q)
      : false;

    if (!remote) {
      await saveQuoteLocal(q);

      $('quoteSaveStatus').textContent = hasApiKey
        ? 'บันทึก Notion ไม่สำเร็จ • เก็บประวัติไว้ในเครื่องแล้ว'
        : 'ยังไม่ได้ตั้ง API Key • เก็บประวัติไว้ในเครื่องแล้ว';
    } else {
      $('quoteSaveStatus').textContent =
        'บันทึกประวัติใบเสนอราคาใน Notion แล้ว';
    }

    setTimeout(() => window.print(), 80);
  }
