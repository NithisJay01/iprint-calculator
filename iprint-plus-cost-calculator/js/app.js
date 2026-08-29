function closeSide() {
  document.querySelectorAll('.side-sheet.open').forEach(sheet=> {
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden','true');
  });
  $('sheetOverlay').classList.remove('open');
}

function openSide(id) {
  const sheet=$(id);
  if(!sheet)return;
  closeSide();
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden','false');
  $('sheetOverlay').classList.add('open');
}

async function downloadBrief() {
    const button=$('downloadBrief');
    const status=$('briefStatus');
    const hadTemporaryImages=typeof hasTemporaryImages==='function'&&hasTemporaryImages();

    if(!lastCalc) {
      if(hadTemporaryImages&&typeof clearTemporaryImages==='function')clearTemporaryImages();
      status.textContent='กรุณากรอกข้อมูลให้คำนวณก่อนสร้างภาพ'+(hadTemporaryImages?' • ล้างภาพชั่วคราวแล้ว':'');
      status.className='brief-status status warn';
      return
    }

    const defaultLabel=button.textContent;
    button.disabled=true;
    button.classList.add('is-sending');
    button.textContent='กำลังส่งบรีฟ…';
    status.textContent='';

    try {
      const image=await captureBriefImage(lastCalc);
      const url=URL.createObjectURL(image);
      const link=document.createElement('a');
      const date=new Date();
      const stamp=date.getFullYear()+String(date.getMonth()+1).padStart(2,'0')+String(date.getDate()).padStart(2,'0');
      const filename='iprint-brief-'+stamp+'.png';

      link.href=url;
      link.download=filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);

      if(!getWriteApiKey()) {
        status.textContent='ดาวน์โหลดภาพแล้ว • ตั้ง API Key เพื่อสร้าง Ticket ใน Notion';
        status.className='brief-status status warn';
        return
      }

      const ticket=buildBriefTicket(lastCalc);
      const remote=await createTicketRemote(ticket,image,filename);

      if(remote?.success) {
        $('graphicBriefDescription').value='';
        status.textContent='ดาวน์โหลดภาพและสร้าง Ticket ใน Notion แล้ว';
        status.className='brief-status status ok';
      } else {
        status.textContent='ดาวน์โหลดภาพแล้ว • สร้าง Ticket ใน Notion ไม่สำเร็จ: '+String(remote?.error||'กรุณาลองใหม่');
        status.className='brief-status status warn';
      }
    } catch(error) {
      console.error('Create brief image',error);
      status.textContent='สร้างภาพสรุปไม่สำเร็จ กรุณาลองใหม่';
      status.className='brief-status status warn';
    } finally {
      if(hadTemporaryImages&&typeof clearTemporaryImages==='function') {
        clearTemporaryImages();
        status.textContent=(status.textContent?status.textContent+' • ':'')+'ล้างภาพชั่วคราวแล้ว';
      }
      button.disabled=false;
      button.classList.remove('is-sending');
      button.textContent=defaultLabel;
    }
  }

function bind() {
    loadState();
    renderPresets();
    $('sheet').addEventListener('change',e=> {
      selectedSheet=e.target.value;
      saveState();
      calculate()
    }
    );
    ['w','h','qty','cost','profitPercent','pieceGap','bleed'].forEach(id=> {
      const el=$(id);
      el.addEventListener('input',calculate);
      el.addEventListener('change',calculate)
    }
    );
    bindVirtualKnobs();
    bindArtwork();
    $('addPreset').addEventListener('click',openPreset);
    $('cancelPreset').addEventListener('click',closePreset);
    $('savePreset').addEventListener('click',savePreset);
    $('deletePreset').addEventListener('click',deletePreset);
    $('pMode').addEventListener('change',()=> {
      $('customArea').hidden=$('pMode').value!=='custom'
    }
    );
    $('materialSelect').addEventListener('change',e=> {
      selectedMaterialId=e.target.value;
      saveState();
      renderMaterials();
      calculate()
    }
    );
    $('openPaperPreviewSettings').addEventListener('click',()=>openSide('paperPreviewSheet'));
    $('openBriefAssets').addEventListener('click',()=>openSide('briefAssetsSheet'));
    $('openMaterialsServices').addEventListener('click',()=>openSide('materialsServicesSheet'));
    $('closePaperPreviewSettings').addEventListener('click',closeSide);
    $('closeBriefAssets').addEventListener('click',closeSide);
    $('closeMaterialsServices').addEventListener('click',closeSide);
    $('sheetOverlay').addEventListener('click',closeSide);
    $('openQuote').addEventListener('click',openQuote);
    $('downloadBrief').addEventListener('click',downloadBrief);
    $('closeQuote').addEventListener('click',closeQuote);
    $('cancelQuote2').addEventListener('click',closeQuote);
    $('quoteCustomer').addEventListener('input',selectQuoteCustomer);
    $('quoteCustomer').addEventListener('change',selectQuoteCustomer);
    ['quoteContact','quoteTaxId','quoteAddress'].forEach(id=>$(id).addEventListener('input',buildQuote));
    $('printQuote').addEventListener('click',printQuote);
    window.addEventListener('resize',()=>setTimeout(calculate,60));
    calculate();
    syncPresets();
    syncMaterials();
    syncServices();
    syncCustomers()
  }

function init() {
  bind();
  window.Iprint = {
    calculate,
    findBest,
    syncPresets,
    syncMaterials,
    syncServices,
    syncCustomers,
    openQuote,
    buildQuote,
    captureQuotePreview,
    captureBriefImage,
    buildBriefTicket,
    downloadBrief,
    clearArtworkImage,
    clearTemporaryImages
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
