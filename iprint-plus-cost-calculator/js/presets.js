function renderPresets() {
    const sel=$('sheet');
    sel.innerHTML='';
    const ids=Object.keys(presets);
    if(!ids.length) {
      sel.innerHTML='<option value="">ไม่พบ Preset</option>';
      return
    }
    ids.forEach(id=> {
      const p=presets[id],o=document.createElement('option');
      o.value=id;
      o.textContent=p.name+' ('+p.fullW+' × '+p.fullH+' cm)';
      sel.appendChild(o)
    }
    );
    if(!presets[selectedSheet])selectedSheet=ids[0];
    sel.value=selectedSheet
  }

async function syncPresets() {
    try {
      const d=await getJSON(API.presets);
      const next= {
      }
      ;
      (d.presets||[]).forEach(p=> {
        if(p&&p.name&&p.active!==false&&p.fullW>0&&p.fullH>0&&p.usableW>0&&p.usableH>0)next[String(p.id)]= {
          ...p,pageId:p.id
        }
      }
      );
      presets=next;
      cachePut(CACHE.presets,presets);
      renderPresets();
      setStatus('syncStatus','Notion • '+Object.keys(presets).length+' Preset','ok');
      calculate()
    } catch(e) {
      const c=cacheGet(CACHE.presets);
      if(c) {
        presets=c.data;
        renderPresets();
        setCachedStatus('syncStatus','ใช้ Preset จาก Cache',c.timestamp);
        calculate()
      } else {
        presets= {
        }
        ;
        renderPresets();
        setStatus('syncStatus','เชื่อมต่อ Notion ไม่สำเร็จ • ไม่มี Cache','warn')
      }
      console.error('GET /presets',e)
    }
  }

function openPreset() {
    const m=$('presetModal');
    m.classList.add('open');
    m.setAttribute('aria-hidden','false');
    $('pName').focus()
  }

function closePreset() {
    const m=$('presetModal');
    m.classList.remove('open');
    m.setAttribute('aria-hidden','true')
  }
