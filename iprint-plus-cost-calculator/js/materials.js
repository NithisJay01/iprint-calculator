function renderMaterials() {
    const sel=$('materialSelect');
    const visibleMaterials=typeof flowMaterialsForJobType==='function'?flowMaterialsForJobType(materials,selectedJobType):materials;
    if(selectedMaterialId&&!visibleMaterials.some(m=>String(m.id)===String(selectedMaterialId)))selectedMaterialId='';
    sel.innerHTML='';
    const ph=document.createElement('option');
    ph.value='';
    ph.textContent='เลือกวัสดุ';
    sel.appendChild(ph);
    visibleMaterials.forEach(m=> {
      const o=document.createElement('option');
      o.value=String(m.id);
      o.textContent=m.name+' • ฿'+money(m.price)+' / '+unit(m.unit);
      o.selected=String(m.id)===String(selectedMaterialId);
      sel.appendChild(o)
    }
    );
    if(selectedMaterialId)sel.value=selectedMaterialId;
    const quickSel=$('quickMaterialSelect');
    if(quickSel) {
      quickSel.innerHTML=sel.innerHTML;
      quickSel.value=selectedMaterialId
    }
    setStatus('materialStatus',dataSourceLabel()+' • '+visibleMaterials.length+' วัสดุ','ok');
    const m=visibleMaterials.find(x=>String(x.id)===String(selectedMaterialId));
    const s=$('selectedMaterialSummary');
    if(m) {
      s.hidden=false;
      s.textContent='เลือก: '+m.name+' • ฿'+money(m.price)+' / '+unit(m.unit)
    } else s.hidden=true
  }

async function syncMaterials() {
    try {
      const d=await getJSON(API.materials);
      materials=(d.materials||[]).filter(m=>m&&m.name&&m.active!==false);
      cachePut(CACHE.materials,materials);
      renderMaterials()
    } catch(e) {
      const c=cacheGet(CACHE.materials);
      if(c) {
        materials=c.data;
        renderMaterials();
        setCachedStatus('materialStatus','Cache Materials',c.timestamp)
      } else {
        materials=[];
        renderMaterials();
        setStatus('materialStatus','เชื่อมต่อ Materials ไม่สำเร็จ','warn')
      }
      console.error('GET /materials',e)
    }
  }

function selectedMaterialCost(sheetCount,pieceCount) {
    const m=materials.find(x=>String(x.id)===String(selectedMaterialId));
    if(!m)return 0;
    const p=Number(m.price)||0,u=normalizeUnit(m.unit);
    return u==='sheet'?p*sheetCount:u==='piece'?p*pieceCount:p
  }
