function renderPresets() {
    const sel=$('sheet');
    sel.innerHTML='';
    const entries=typeof flowPresetsForJobType==='function'?flowPresetsForJobType(selectedJobType):Object.entries(presets);
    const ids=entries.map(([id])=>id);
    if(!ids.length) {
      sel.innerHTML='<option value="">ไม่พบ Preset</option>';
      if($('quickSheet'))$('quickSheet').innerHTML=sel.innerHTML;
      return
    }
    entries.forEach(([id,p])=> {
      const o=document.createElement('option');
      o.value=id;
      o.textContent=p.name+' ('+p.fullW+' × '+p.fullH+' cm)';
      sel.appendChild(o)
    }
    );
    const configuredDefault=typeof flowDefaultPresetId==='function'?flowDefaultPresetId(selectedJobType):'';
    if(configuredDefault&&ids.includes(configuredDefault))selectedSheet=configuredDefault;
    else if(!ids.includes(selectedSheet))selectedSheet=ids[0];
    sel.value=selectedSheet;
    const locked=Boolean(selectedJobType)&&typeof isFlowPresetLocked==='function'&&isFlowPresetLocked(selectedJobType);
    sel.disabled=locked;
    const lockStatus=$('presetLockStatus');
    if(lockStatus){lockStatus.hidden=!locked;lockStatus.textContent=locked?'Preset กระดาษกำหนดไว้ตามประเภทงานที่เลือก':''}
    const quickSel=$('quickSheet');
    if(quickSel) {
      quickSel.innerHTML=sel.innerHTML;
      quickSel.value=selectedSheet;
      quickSel.disabled=locked
    }
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
      setStatus('syncStatus',dataSourceLabel()+' • '+Object.keys(presets).length+' Preset','ok');
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
