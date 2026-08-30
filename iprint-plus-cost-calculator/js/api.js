async function getJSON(url) {
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
      const key='iprint_quote_history_v1';
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

async function createCustomerRemote(customerData) {
    try {
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
