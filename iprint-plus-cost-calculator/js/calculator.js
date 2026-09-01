function normalizeUnit(u) {
    const x=String(u||'').toLowerCase();
    return x==='sheet'||x==='sheets'||x==='แผ่น'?'sheet':x==='piece'||x==='pieces'||x==='ชิ้น'||x==='ดวง'?'piece':x==='job'||x==='งาน'?'job':x
  }

function findBest(p,Wcm,Hcm,gapMm=0) {
    const uw=Number(p.usableW)*10,uh=Number(p.usableH)*10;
    const W=Number(Wcm)*10,H=Number(Hcm)*10;
    const gap=Math.max(0,Number(gapMm)||0);
    let best=null;
    [[W,H,false],[H,W,true]].forEach(([pw,ph,rotate])=> {
      // For n pieces, only the (n - 1) inner gaps consume space.
      const nx=Math.floor((uw+gap)/(pw+gap)),ny=Math.floor((uh+gap)/(ph+gap)),n=nx*ny;
      if(n>0&&(!best||n>best.yield))best= {
        yield:n,nx,ny,pieceW:pw,pieceH:ph,rotate
      }
    }
    );
    return best
  }

function resetPreview() {
    $('previewSheets').textContent='—';
    $('sheetPreview').innerHTML='';
    $('previewInfo').textContent='—';
    $('previewPaperName').textContent='Preset: —';
    $('sheets').textContent='—';
    $('yield').textContent='—';
    $('resultSize').textContent='—';
    $('gap').textContent='—';
    $('bleedSummary').textContent='—';
    $('total').textContent='—';
    $('sale').textContent='—';
    lastCalc=null;
    if(typeof syncMaterialPreviewEffect==='function')syncMaterialPreviewEffect(null)
  }

function previewBleed() {
    const value=Number($('bleed')?.value);
    return Number.isFinite(value)&&value>=0?value:0
  }

function previewGap() {
    const value=Number($('pieceGap')?.value);
    return Number.isFinite(value)&&value>=0?value:0
  }

function formatMillimeters(value) {
    return Number(value||0).toLocaleString('th-TH',{maximumFractionDigits:1})
  }

function syncPreviewSliderValues() {
    const gap=previewGap();
    const bleed=previewBleed();
    $('pieceGapValue').textContent=formatMillimeters(gap)+' mm';
    $('bleedValue').textContent=formatMillimeters(bleed)+' mm/ด้าน';
    syncVirtualKnob('pieceGap',gap);
    syncVirtualKnob('bleed',bleed);
  }

function syncVirtualKnob(inputId,value) {
    const input=$(inputId),knob=$(inputId+'Knob');
    if(!input||!knob)return;
    const min=Number(input.min),max=Number(input.max);
    const progress=max>min?Math.max(0,Math.min(1,(Number(value)-min)/(max-min))):0;
    knob.style.setProperty('--knob-fill',(progress*270)+'deg');
    knob.style.setProperty('--knob-angle',(-135+progress*270)+'deg');
  }

function bindVirtualKnobs() {
    ['pieceGap','bleed'].forEach(inputId=> {
      const input=$(inputId);
      if(!input||input.dataset.virtualKnobBound)return;
      input.dataset.virtualKnobBound='true';
      if(input.type==='range')return;
      let activePointerId=null;

      const setValueFromPointer=event=> {
        const rect=input.getBoundingClientRect();
        const centerX=rect.left+rect.width/2;
        const centerY=rect.top+rect.height/2;
        let angle=Math.atan2(event.clientX-centerX,centerY-event.clientY)*180/Math.PI;
        if(angle<0)angle+=360;
        if(angle<225)angle+=360;
        const progress=Math.max(0,Math.min(1,(angle-225)/270));
        const min=Number(input.min),max=Number(input.max),step=Number(input.step)||1;
        const raw=min+(max-min)*progress;
        const value=min+Math.round((raw-min)/step)*step;
        const normalized=Math.round(value*1000)/1000;

        if(Number(input.value)===normalized)return;
        input.value=String(normalized);
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
      };

      input.addEventListener('pointerdown',event=> {
        if(event.pointerType==='mouse'&&event.button!==0)return;
        activePointerId=event.pointerId;
        input.setPointerCapture?.(activePointerId);
        setValueFromPointer(event);
        event.preventDefault();
      });
      input.addEventListener('pointermove',event=> {
        if(event.pointerId!==activePointerId)return;
        setValueFromPointer(event);
        event.preventDefault();
      });
      input.addEventListener('pointerup',event=> {
        if(event.pointerId!==activePointerId)return;
        activePointerId=null;
        input.releasePointerCapture?.(event.pointerId);
      });
      input.addEventListener('pointercancel',()=> {
        activePointerId=null;
      });
    });
  }

function drawPreview(p,b,bleedMm,gapMm) {
    const el=$('sheetPreview');
    el.innerHTML='';
    const fw=Number(p.fullW)*10,fh=Number(p.fullH)*10,uw=Number(p.usableW)*10,uh=Number(p.usableH)*10;
    const available=Math.max(240,($('sheetPreview').parentElement.clientWidth||340)-4),scale=Math.min(1,Math.min(560,available)/fw);
    el.style.width=Math.max(1,fw*scale)+'px';
    el.style.height=Math.max(1,fh*scale)+'px';
    const usable=document.createElement('div');
    usable.className='preview-usable';
    usable.style.left=((fw-uw)/2*scale)+'px';
    usable.style.top=((fh-uh)/2*scale)+'px';
    usable.style.width=(uw*scale)+'px';
    usable.style.height=(uh*scale)+'px';
    const grid=document.createElement('div');
    grid.className='preview-grid';
    const gapPx=gapMm*scale;
    const gridW=b.nx*b.pieceW*scale+Math.max(0,b.nx-1)*gapPx;
    const gridH=b.ny*b.pieceH*scale+Math.max(0,b.ny-1)*gapPx;
    grid.style.left=Math.max(0,((uw*scale)-gridW)/2)+'px';
    grid.style.top=Math.max(0,((uh*scale)-gridH)/2)+'px';
    grid.style.gridTemplateColumns='repeat('+b.nx+','+(b.pieceW*scale)+'px)';
    grid.style.gridTemplateRows='repeat('+b.ny+','+(b.pieceH*scale)+'px)';
    grid.style.gap=gapPx+'px';
    const artworkUrl=typeof getArtworkPreviewUrl==='function'?getArtworkPreviewUrl():'';
    const artworkSide=typeof activeArtworkSide==='string'?activeArtworkSide:'front';
    const selectedServiceNames=services.filter(service=>selectedServiceIds[String(service.id)]).map(service=>String(service.name||'').toLowerCase());
    const selectedMaterialName=String(materials.find(material=>String(material.id)===String(selectedMaterialId))?.name||'').toLowerCase();
    const hasDiecut=selectedServiceNames.some(name=>/ไดคัท|die.?cut/.test(name));
    const hasRoundedCorner=selectedServiceNames.some(name=>/ตัดมุม|rounded.?corner/.test(name));
    const materialEffect=/kraft|คราฟท์/.test(selectedMaterialName)?'is-kraft':/pvc|pp|sticker|สติกเกอร์/.test(selectedMaterialName)?'is-sticker':/art|อาร์ท/.test(selectedMaterialName)?'is-art-paper':'';
    for(let i=0;
    i<b.yield;
    i++) {
      const piece=document.createElement('div');
      piece.className='piece';
      piece.tabIndex=0;
      piece.setAttribute('role','button');
      piece.setAttribute('aria-label','ดูตัวอย่างชิ้นที่ '+(i+1));
      piece.dataset.pieceIndex=String(i+1);
      piece.style.width=(b.pieceW*scale)+'px';
      piece.style.height=(b.pieceH*scale)+'px';
      if(artworkUrl) {
        piece.classList.add('has-artwork');
        const artwork=document.createElement('img');
        artwork.className='piece-artwork';
        artwork.src=artworkUrl;
        artwork.alt='';
        if(typeof applyArtworkRotation==='function')applyArtworkRotation(artwork,artworkSide,b.pieceW,b.pieceH);
        piece.appendChild(artwork)
      }
      if(materialEffect) {
        const materialOverlay=document.createElement('span');
        materialOverlay.className='piece-material-effect '+materialEffect;
        materialOverlay.setAttribute('aria-hidden','true');
        piece.appendChild(materialOverlay)
      }
      if(hasDiecut)piece.classList.add('has-diecut-effect');
      if(hasRoundedCorner)piece.classList.add('has-rounded-corner');
      const number=document.createElement('span');
      number.className='piece-number';
      number.textContent=i+1;
      const bleed=document.createElement('div');
      bleed.className='bleed';
      const inset=bleedMm*scale;
      bleed.style.left=inset+'px';
      bleed.style.top=inset+'px';
      bleed.style.right=inset+'px';
      bleed.style.bottom=inset+'px';
      piece.append(number,bleed);
      grid.appendChild(piece)
    }
    usable.appendChild(grid);
    el.appendChild(usable);
    $('previewPaperName').textContent='Preset: '+String(p.name||'ไม่ระบุชื่อ');
    $('previewInfo').textContent='กระดาษ '+Number(p.fullW).toFixed(2)+' × '+Number(p.fullH).toFixed(2)+' cm • พื้นที่ใช้งาน '+Number(p.usableW).toFixed(2)+' × '+Number(p.usableH).toFixed(2)+' cm • '+b.yield+' ดวง/แผ่น • Gap '+formatMillimeters(gapMm)+' mm • Bleed '+formatMillimeters(bleedMm)+' mm/ด้าน • '+(b.rotate?'หมุน 90°':'แนวปกติ')+' • Layout '+b.nx+' × '+b.ny
  }

function calculate() {
    try {
      syncPreviewSliderValues();
      const p=presets[selectedSheet];
      if(!p) {
        resetPreview();
        return
      }
      const W=Number($('w').value),H=Number($('h').value),Q=parseInt($('qty').value,10),C=Number($('cost').value),P=Number($('profitPercent').value),B=previewBleed(),G=previewGap();
      if(!(W>0&&H>0&&Q>0&&C>=0&&P>=0)) {
        resetPreview();
        return
      }
      const b=findBest(p,W,H,G);
      if(!b) {
        $('sheets').textContent='0';
        $('yield').textContent='ขนาดใหญ่เกินไป';
        $('previewSheets').textContent='0';
        $('sheetPreview').innerHTML='';
        $('previewPaperName').textContent='Preset: '+String(p.name||'ไม่ระบุชื่อ');
        $('resultSize').textContent=W.toFixed(2)+' × '+H.toFixed(2)+' cm';
        $('gap').textContent=formatMillimeters(G);
        $('bleedSummary').textContent=formatMillimeters(B);
        lastCalc=null;
        if(typeof syncMaterialPreviewEffect==='function')syncMaterialPreviewEffect(null);
        return
      }
      const sheets=Math.ceil(Q/b.yield),matCost=selectedMaterialCost(sheets,Q),svcCost=serviceCost(sheets,Q),tc=sheets*C+matCost+svcCost,profit=tc*P/100,sale=tc+profit;
      $('sheets').textContent=sheets.toLocaleString('th-TH');
      $('previewSheets').textContent=sheets.toLocaleString('th-TH');
      $('yield').textContent=b.yield.toLocaleString('th-TH');
      $('gap').textContent=formatMillimeters(G);
      $('bleedSummary').textContent=formatMillimeters(B);
      $('resultSize').textContent=W.toFixed(2)+' × '+H.toFixed(2)+' cm';
      $('total').textContent=money(tc);
      $('sale').textContent=money(sale);
      drawPreview(p,b,B,G);
      lastCalc= {
        paper:p,W,H,Q,C,P,bleed:B,gap:G,b,sheets,material:materials.find(m=>String(m.id)===String(selectedMaterialId))||null,services:services.filter(s=>selectedServiceIds[String(s.id)]),matCost,svcCost,total:tc,profit,sale
      }
      ;
      window.dispatchEvent(new CustomEvent('iprint:calculated',{detail:lastCalc}));
    } catch(e) {
      console.error('Iprint calculate error',e)
    }
  }

function quoteItems() {
    if (Array.isArray(cartItems) && cartItems.length) {
      return cartItems.map((item, index) => ({
        id: item.id,
        name: item.name || `งานพิมพ์ ${index + 1}`,
        size: [item.size, item.paper?.name, item.material?.name]
          .filter(Boolean)
          .join(' • '),
        qty: Number(item.quantity) || 0,
        unit: item.unit || 'ดวง',
        price: Number(item.price) || 0
      }));
    }

    if (!lastCalc) return [];

    const addon = [];
    const selectedServices = Array.isArray(lastCalc.services)
      ? lastCalc.services
      : [];

    if (lastCalc.material) {
      const material = lastCalc.material;
      const materialUnit = normalizeUnit(material.unit);
      const qty = materialUnit === 'piece'
        ? Number(lastCalc.Q) || 0
        : materialUnit === 'sheet'
          ? Number(lastCalc.sheets) || 0
          : 1;

      addon.push({
        name: String(material.name || 'วัสดุ'),
        size: 'วัสดุ',
        qty,
        unit: unit(material.unit),
        price: (Number(material.price) || 0) * qty
      });
    }

    selectedServices.forEach(service => {
      if (!service) return;

      const serviceUnit = normalizeUnit(service.unit);
      const qty = serviceUnit === 'piece'
        ? Number(lastCalc.Q) || 0
        : serviceUnit === 'sheet'
          ? Number(lastCalc.sheets) || 0
          : 1;

      addon.push({
        name: String(service.name || 'บริการ'),
        size: 'บริการ',
        qty,
        unit: unit(service.unit),
        price: (Number(service.price) || 0) * qty
      });
    });

    const addonTotal = addon.reduce(
      (sum, item) => sum + (Number(item.price) || 0),
      0
    );

    const sale = Number(lastCalc.sale) || 0;
    const basePrice = Math.max(0, sale - addonTotal);

    return [
      {
        name: 'งานพิมพ์',
        size: `${(Number(lastCalc.W) || 0).toFixed(2)} × ${(Number(lastCalc.H) || 0).toFixed(2)} cm`,
        qty: Number(lastCalc.Q) || 0,
        unit: 'ดวง',
        price: basePrice
      },
      ...addon
    ];
  }

function quotePriceSummary() {
    const subtotal = Array.isArray(cartItems) && cartItems.length
      ? cartItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0)
      : Number(lastCalc?.sale) || 0;
    const vat = subtotal * 0.07;
    const grandTotal = subtotal + vat;

    return {
      subtotal,
      vat,
      grandTotal
    };
  }
