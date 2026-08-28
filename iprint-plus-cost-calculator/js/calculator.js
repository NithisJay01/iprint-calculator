function normalizeUnit(u) {
    const x=String(u||'').toLowerCase();
    return x==='sheet'||x==='sheets'||x==='แผ่น'?'sheet':x==='piece'||x==='pieces'||x==='ชิ้น'||x==='ดวง'?'piece':x==='job'||x==='งาน'?'job':x
  }

function findBest(p,Wcm,Hcm) {
    const uw=Number(p.usableW)*10,uh=Number(p.usableH)*10;
    const W=Number(Wcm)*10,H=Number(Hcm)*10;
    let best=null;
    [[W,H,false],[H,W,true]].forEach(([pw,ph,rotate])=> {
      const nx=Math.floor(uw/pw),ny=Math.floor(uh/ph),n=nx*ny;
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
    $('sheets').textContent='—';
    $('yield').textContent='—';
    $('total').textContent='—';
    $('sale').textContent='—';
    lastCalc=null
  }

function drawPreview(p,b) {
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
    grid.style.left='0';
    grid.style.top='0';
    grid.style.gridTemplateColumns='repeat('+b.nx+','+(b.pieceW*scale)+'px)';
    grid.style.gridTemplateRows='repeat('+b.ny+','+(b.pieceH*scale)+'px)';
    for(let i=0;
    i<b.yield;
    i++) {
      const piece=document.createElement('div');
      piece.className='piece';
      piece.textContent=i+1;
      piece.style.width=(b.pieceW*scale)+'px';
      piece.style.height=(b.pieceH*scale)+'px';
      const bleed=document.createElement('div');
      bleed.className='bleed';
      const inset=BLEED_MM*scale;
      bleed.style.left=inset+'px';
      bleed.style.top=inset+'px';
      bleed.style.right=inset+'px';
      bleed.style.bottom=inset+'px';
      piece.appendChild(bleed);
      grid.appendChild(piece)
    }
    usable.appendChild(grid);
    el.appendChild(usable);
    $('previewInfo').textContent='กระดาษ '+Number(p.fullW).toFixed(2)+' × '+Number(p.fullH).toFixed(2)+' cm • พื้นที่ใช้งาน '+Number(p.usableW).toFixed(2)+' × '+Number(p.usableH).toFixed(2)+' cm • '+b.yield+' ดวง/แผ่น • Bleed '+BLEED_MM+' mm/ด้าน • '+(b.rotate?'หมุน 90°':'แนวปกติ')+' • Layout '+b.nx+' × '+b.ny
  }

function calculate() {
    try {
      const p=presets[selectedSheet];
      if(!p) {
        resetPreview();
        return
      }
      const W=Number($('w').value),H=Number($('h').value),Q=parseInt($('qty').value,10),C=Number($('cost').value),P=Number($('profitPercent').value);
      if(!(W>0&&H>0&&Q>0&&C>=0&&P>=0)) {
        resetPreview();
        return
      }
      const b=findBest(p,W,H);
      if(!b) {
        $('sheets').textContent='0';
        $('yield').textContent='ขนาดใหญ่เกินไป';
        $('previewSheets').textContent='0';
        $('sheetPreview').innerHTML='';
        return
      }
      const sheets=Math.ceil(Q/b.yield),matCost=selectedMaterialCost(sheets,Q),svcCost=serviceCost(sheets,Q),tc=sheets*C+matCost+svcCost,profit=tc*P/100,sale=tc+profit;
      $('sheets').textContent=sheets.toLocaleString('th-TH');
      $('previewSheets').textContent=sheets.toLocaleString('th-TH');
      $('yield').textContent=b.yield.toLocaleString('th-TH');
      $('total').textContent=money(tc);
      $('sale').textContent=money(sale);
      drawPreview(p,b);
      lastCalc= {
        paper:p,W,H,Q,C,P,b,sheets,material:materials.find(m=>String(m.id)===String(selectedMaterialId))||null,services:services.filter(s=>selectedServiceIds[String(s.id)]),matCost,svcCost,total:tc,profit,sale
      }
      ;
    } catch(e) {
      console.error('Iprint calculate error',e)
    }
  }

function quoteItems() {
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
    const subtotal = Number(lastCalc?.sale) || 0;
    const vat = subtotal * 0.07;
    const grandTotal = subtotal + vat;

    return {
      subtotal,
      vat,
      grandTotal
    };
  }
