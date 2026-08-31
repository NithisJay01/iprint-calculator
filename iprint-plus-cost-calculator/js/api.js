const IPRINT_TEST_FIXTURES = {
  presets: {
    presets: [
      { id: 'test-sra3', name: 'SRA3', fullW: 32.9, fullH: 48.3, usableW: 31.5, usableH: 46.9, type: 'เผื่อมาร์คมาตรฐาน', active: true }
    ]
  },
  materials: {
    materials: [
      { id: 'test-art-card', name: 'Art Card 300 แกรม', price: 3.87, unit: 'sheet', active: true },
      { id: 'test-pp', name: 'PP Sticker ขาวเงา', price: 6.5, unit: 'sheet', active: true, previewRenderer: 'css', previewEffect: 'gloss' }
    ]
  },
  services: {
    services: [
      { id: 'test-print-single', category: 'รูปแบบการพิมพ์', name: 'พิมพ์หน้าเดียว', material: 'All Paper', price: 0.5, unit: 'sheet', sortOrder: 10, active: true },
      { id: 'test-print-double', category: 'รูปแบบการพิมพ์', name: 'พิมพ์ 2 หน้า', material: 'All Paper', price: 0.5, unit: 'sheet', sortOrder: 20, active: true },
      { id: 'test-lam-matte', category: 'การเคลือบ', name: 'เคลือบด้าน', material: 'Matt Film', price: 0.25, unit: 'piece', sortOrder: 30, active: true, previewRenderer: 'css', previewEffect: 'matte' },
      { id: 'test-lam-gloss', category: 'การเคลือบ', name: 'เคลือบเงา', material: 'Glossy Film', price: 0.25, unit: 'piece', sortOrder: 40, active: true, previewRenderer: 'css', previewEffect: 'gloss' },
      { id: 'test-lam-hologram', category: 'การเคลือบ', name: 'เคลือบโฮโลแกรม', material: 'Hologram Film', price: 0.75, unit: 'piece', sortOrder: 50, active: true, previewRenderer: 'webgl', previewEffect: 'hologram' },
      { id: 'test-cut-sticker', category: 'การตัด', name: 'ไดคัท', material: 'All Sticker', price: 1, unit: 'piece', sortOrder: 60, active: true },
      { id: 'test-cut-acrylic', category: 'การตัด', name: 'ติดแผ่นอคลีลิก Die-cut', material: 'Acrylic', price: 50, unit: 'piece', sortOrder: 70, active: true },
      { id: 'test-cut-plastwood', category: 'การตัด', name: 'ติดแผ่นพลาสวูด Die-cut', material: 'Plastwood', price: 20, unit: 'sheet', sortOrder: 80, active: true },
      { id: 'test-diy', category: 'DIY Solution', name: 'DIY ส่วนเสริม', material: 'Plastwood', price: 0.5, unit: 'piece', sortOrder: 90, active: true }
    ]
  },
  customers: {
    customers: [
      { id: 'test-customer-001', name: 'ลูกค้าทดสอบ iPrint', company: 'Mock Studio', phone: '0812345678', email: 'test@example.com', address: '123 ถนนทดสอบ กรุงเทพฯ', active: true }
    ]
  }
};

const IPRINT_TEST_ORDER_KEY = 'iprint_test_workflow_order_v1';

function cloneTestData(value) {
  return JSON.parse(JSON.stringify(value));
}

function getTestApiFixture(url) {
  const path = new URL(url, window.location.href).pathname;
  if (path.endsWith('/presets')) return cloneTestData(IPRINT_TEST_FIXTURES.presets);
  if (path.endsWith('/materials')) return cloneTestData(IPRINT_TEST_FIXTURES.materials);
  if (path.endsWith('/services')) return cloneTestData(IPRINT_TEST_FIXTURES.services);
  if (path.endsWith('/customers')) return cloneTestData(IPRINT_TEST_FIXTURES.customers);
  throw new Error(`Test Mode ไม่มี fixture สำหรับ ${path}`);
}

function readTestWorkflowOrder() {
  try {
    return JSON.parse(sessionStorage.getItem(IPRINT_TEST_ORDER_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

async function getJSON(url) {
    if (IPRINT_TEST_MODE) return getTestApiFixture(url);
    const r=await fetch(url, {
      method:'GET',cache:'no-store'
    }
    );
    const t=await r.text();
    let d= {
    }
    ;
    try {
      d=JSON.parse(t)
    } catch(e) {
    }
    if(!r.ok)throw new Error(d.detail||d.error||('HTTP '+r.status));
    return d
  }

async function savePreset() {
    const err=$('presetError');
    err.textContent='';
    const name=$('pName').value.trim(),fw=Number($('pW').value),fh=Number($('pH').value),mode=$('pMode').value;
    let uw,uh;
    if(mode==='full') {
      uw=fw;
      uh=fh
    } else if(mode==='margin') {
      uw=fw-3;
      uh=fh-3
    } else {
      uw=Number($('pUW').value);
      uh=Number($('pUH').value)
    }
    if(!name||!(fw>0&&fh>0&&uw>0&&uh>0&&uw<=fw&&uh<=fh)) {
      err.textContent='กรุณากรอกข้อมูลให้ถูกต้อง';
      return
    }
    if(!getWriteApiKey()) {
      err.textContent='ยังไม่ได้ตั้งค่า Write API Key — อ่านข้อมูลได้ตามปกติ แต่การเพิ่ม/ลบ Preset ต้องตั้งค่า authentication ก่อน';
      return
    }
    try {
      const r=await fetch(API.presets, {
        method:'POST',headers:writeHeaders(),body:JSON.stringify( {
          name,fullW:fw,fullH:fh,usableW:uw,usableH:uh,type:mode==='full'?'เต็มพื้นที่':mode==='margin'?'เผื่อมาร์คมาตรฐาน':'กำหนดเอง',active:true
        }
        )
      }
      );
      const t=await r.text();
      let d= {
      }
      ;
      try {
        d=JSON.parse(t)
      } catch(e) {
      }
      if(!r.ok)throw new Error(d.detail||d.error||('HTTP '+r.status));
      closePreset();
      await syncPresets()
    } catch(e) {
      err.textContent='เพิ่ม Preset ไม่สำเร็จ: '+e.message;
      console.error(e)
    }
  }

async function deletePreset() {
    const p=presets[selectedSheet];
    if(!p) {
      alert('กรุณาเลือก Preset ก่อน');
      return
    }
    if(!getWriteApiKey()) {
      alert('ยังไม่ได้ตั้งค่า Write API Key');
      return
    }
    if(!confirm('ลบขนาดกระดาษ "'+p.name+'" จาก Notion Database ใช่หรือไม่?'))return;
    try {
      const r=await fetch(API.presets+'?id='+encodeURIComponent(p.pageId||selectedSheet), {
        method:'DELETE',headers: {
          'X-API-Key':getWriteApiKey()
        }
      }
      );
      const t=await r.text();
      let d= {
      }
      ;
      try {
        d=JSON.parse(t)
      } catch(e) {
      }
      if(!r.ok)throw new Error(d.detail||d.error||('HTTP '+r.status));
      selectedSheet='';
      await syncPresets()
    } catch(e) {
      alert('ลบ Preset ไม่สำเร็จ: '+e.message);
      console.error(e)
    }
  }

async function saveQuoteLocal(q) {
    try {
      const key=IPRINT_TEST_MODE?'iprint_test_quote_history_v1':'iprint_quote_history_v1';
      const arr=JSON.parse(localStorage.getItem(key)||'[]');
      arr.push( {
        ...q,savedAt:new Date().toISOString()
      }
      );
      localStorage.setItem(key,JSON.stringify(arr.slice(-500)))
    } catch(e) {
    }
  }

async function saveQuoteRemote(q) {
    try {
      if (IPRINT_TEST_MODE) return { success: true, id: 'test-quote-001' };
      const apiKey = getWriteApiKey();
      const date = String(q.date || '').trim();

      if (!apiKey) {
        throw new Error('ยังไม่ได้ตั้งค่า API Key');
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('วันที่ใบเสนอราคาไม่อยู่ในรูปแบบ YYYY-MM-DD');
      }

      const response = await fetch(API.quotes, {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify(q)
      });

      const text = await response.text();

      let data = {};

      try {
        data = JSON.parse(text);
      } catch (error) {
        // Keep raw response text for diagnostics.
      }

      if (!response.ok) {
        const detail =
          data.detail ||
          data.error ||
          text ||
          `HTTP ${response.status}`;

        throw new Error(
          `POST /quotes HTTP ${response.status}: ${detail}`
        );
      }

      if (data.success !== true) {
        throw new Error(
          data.error ||
          data.detail ||
          'Worker did not return success:true'
        );
      }

      return {
        success: true,
        id: data.id || null
      };
    } catch (error) {
      console.error('POST /quotes', error);
      return false;
    }
  }

async function attachQuotePreviewRemote(pageId, image, filename) {
    try {
      if (IPRINT_TEST_MODE) return { success: true, id: pageId, filename };
      const apiKey = getWriteApiKey();

      if (!apiKey) {
        throw new Error('ยังไม่ได้ตั้งค่า API Key');
      }

      if (!pageId || !image) {
        throw new Error('ไม่พบข้อมูลภาพหรือใบเสนอราคา');
      }

      const form = new FormData();
      form.append('image', image, filename);

      const response = await fetch(
        API.quotes + '/' + encodeURIComponent(pageId) + '/preview',
        {
          method: 'POST',
          headers: { 'X-API-Key': apiKey },
          body: form
        }
      );

      const text = await response.text();
      let data = {};

      try {
        data = JSON.parse(text);
      } catch (error) {
        // Keep raw text for the user-facing error below.
      }

      if (!response.ok || data.success !== true) {
        throw new Error(
          data.detail ||
          data.error ||
          text ||
          'ไม่สามารถแนบภาพ Preview ใน Notion ได้'
        );
      }

      return data;
    } catch (error) {
      console.error('POST /quotes/:id/preview', error);
      return false;
    }
  }

async function createTicketRemote(ticket, image, filename) {
    try {
      if (IPRINT_TEST_MODE) return { success: true, id: 'test-ticket-brief-001', itemIds: [] };
      const apiKey=getWriteApiKey();

      if(!apiKey) {
        throw new Error('ยังไม่ได้ตั้งค่า API Key');
      }

      if(!ticket || !image) {
        throw new Error('ไม่พบข้อมูล Ticket หรือภาพสรุป');
      }

      const form=new FormData();
      form.append('ticket',JSON.stringify(ticket));
      form.append('image',image,filename||'iprint-brief.png');

      const response=await fetch(API.tickets,{
        method:'POST',
        headers:{'X-API-Key':apiKey},
        body:form
      });
      const text=await response.text();
      let data={};

      try {
        data=JSON.parse(text);
      } catch(error) {
        // Keep raw text as a useful diagnostic below.
      }

      if(!response.ok || data.success!==true) {
        throw new Error(
          data.detail ||
          data.error ||
          text ||
          'ไม่สามารถสร้าง Ticket ใน Notion ได้'
        );
      }

      return data;
    } catch(error) {
      console.error('POST /tickets',error);
      return {
        success:false,
        error:error.message||String(error)
      };
    }
  }

async function createOrderRemote(order, quotePreview, briefImages) {
  try {
    if (IPRINT_TEST_MODE) {
      const id = 'test-ticket-order-001';
      const now = new Date().toISOString();
      const items = order.orderItems.map((item, index) => ({
        ...cloneTestData(item),
        id: `test-order-item-${index + 1}`,
        title: item.name || item.title || `รายการที่ ${index + 1}`,
        status: 'NEW',
        phase: 'GRAPHIC',
        allowedTransitions: ['GRAPHIC_ACCEPTED']
      }));
      const workflow = {
        success: true,
        ticket: { id, title: order.quoteNo || 'iPrint Test Order', status: 'NEW', updatedAt: now },
        items
      };
      sessionStorage.setItem(IPRINT_TEST_ORDER_KEY, JSON.stringify(workflow));
      return { success: true, id, url: '#test-mode', itemIds: items.map(item => item.id), testMode: true };
    }
    const apiKey = getWriteApiKey();

    if (!apiKey) throw new Error('ยังไม่ได้ตั้งค่า API Key');
    if (!order || !Array.isArray(order.orderItems) || !order.orderItems.length) {
      throw new Error('ไม่พบรายการชิ้นงานในออเดอร์');
    }

    const form = new FormData();
    form.append('order', JSON.stringify(order));
    if (quotePreview) {
      form.append('quotePreview', quotePreview, `${order.quoteNo || 'order'}-quote.png`);
    }
    (Array.isArray(briefImages) ? briefImages : []).forEach((image, index) => {
      if (image instanceof Blob) {
        form.append(`brief_${index}`, image, `${order.quoteNo || 'order'}-item-${index + 1}.png`);
      }
    });

    const response = await fetch(API.orders, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
      body: form
    });
    const text = await response.text();
    let data = {};

    try {
      data = JSON.parse(text);
    } catch (error) {
      // Preserve the raw response in the error below.
    }

    if (!response.ok || data.success !== true) {
      throw new Error(
        data.detail || data.error || text || `POST /orders HTTP ${response.status}`
      );
    }

    return data;
  } catch (error) {
    console.error('POST /orders', error);
    return {
      success: false,
      error: error.message || String(error)
    };
  }
}

async function fetchOrderWorkflowRemote(ticketId) {
  try {
    if (IPRINT_TEST_MODE) {
      const workflow = readTestWorkflowOrder();
      return workflow || { success: false, error: `ไม่พบ Mock order ${ticketId}` };
    }
    const apiKey = getWriteApiKey();
    if (!apiKey) throw new Error('กรุณาตั้ง API Key ก่อนติดตามงาน');

    const response = await fetch(`${API.orders}/${encodeURIComponent(ticketId)}`, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey }
    });
    const text = await response.text();
    let data = {};

    try {
      data = JSON.parse(text);
    } catch (error) {
      // Preserve the raw response in the error below.
    }

    if (!response.ok || data.success !== true) {
      throw new Error(data.detail || data.error || text || `GET /orders/:id HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('GET /orders/:id', error);
    return { success: false, error: error.message || String(error) };
  }
}

async function updateOrderItemStatusRemote(itemId, status, note = '') {
  try {
    if (IPRINT_TEST_MODE) {
      const workflow = readTestWorkflowOrder();
      const item = workflow?.items?.find(entry => String(entry.id) === String(itemId));
      if (!workflow || !item) return { success: false, error: 'ไม่พบ Mock order item' };
      item.status = status;
      item.note = note;
      item.allowedTransitions = typeof WORKFLOW_TRANSITIONS === 'object'
        ? (WORKFLOW_TRANSITIONS[status] || [])
        : [];
      workflow.ticket.status = status;
      workflow.ticket.updatedAt = new Date().toISOString();
      sessionStorage.setItem(IPRINT_TEST_ORDER_KEY, JSON.stringify(workflow));
      return { success: true, item: cloneTestData(item), testMode: true };
    }
    const apiKey = getWriteApiKey();
    if (!apiKey) throw new Error('กรุณาตั้ง API Key ก่อนอัปเดตงาน');

    const response = await fetch(`${API.orderItems}/${encodeURIComponent(itemId)}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({ status, note })
    });
    const text = await response.text();
    let data = {};

    try {
      data = JSON.parse(text);
    } catch (error) {
      // Preserve the raw response in the error below.
    }

    if (!response.ok || data.success !== true) {
      throw new Error(data.detail || data.error || text || `PATCH /order-items/:id/status HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('PATCH /order-items/:id/status', error);
    return { success: false, error: error.message || String(error) };
  }
}

async function createCustomerRemote(customerData) {
    try {
      if (IPRINT_TEST_MODE) {
        return { id: `test-customer-${Date.now()}`, ...cloneTestData(customerData), testMode: true };
      }
      const response = await fetch(API.customers, {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify(customerData)
      });

      const text = await response.text();
      let data = {};

      try {
        data = JSON.parse(text);
      } catch (error) {
        // Keep the original response text for diagnostics.
      }

      if (!response.ok) {
        throw new Error(
          data.detail || data.error || 'HTTP ' + response.status
        );
      }

      if (!data.id) {
        throw new Error('POST /customers did not return id');
      }

      return data;
    } catch (error) {
      console.error('POST /customers', error);
      return null;
    }
  }
