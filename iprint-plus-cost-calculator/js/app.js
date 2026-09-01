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

let applicationBound = false;

function setLoginStatus(message, kind = '') {
  const status = $('loginStatus');
  status.textContent = message;
  status.className = 'login-status' + (kind ? ' ' + kind : '');
}

function showLoginGate(message = '') {
  $('mobileApp').hidden = true;
  $('loginGate').hidden = false;
  $('loginSubmit').disabled = false;
  $('loginSubmit').textContent = 'เข้าสู่ระบบ';
  $('loginApiKey').value = '';
  setLoginStatus(message, message ? 'warn' : '');
  setTimeout(()=>$('loginApiKey').focus(), 60);
}

function showAuthenticatedApp() {
  $('loginGate').hidden = true;
  $('mobileApp').hidden = false;
}

function toggleLoginKeyVisibility() {
  const input = $('loginApiKey');
  const button = $('toggleLoginKey');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.textContent = show ? 'ซ่อน' : 'แสดง';
  button.setAttribute('aria-label', show ? 'ซ่อนรหัส' : 'แสดงรหัส');
  button.setAttribute('aria-pressed', String(show));
}

async function submitLogin(event) {
  event?.preventDefault();
  const key = normalizeWriteApiKey($('loginApiKey').value);

  if (!key) {
    setLoginStatus('กรุณากรอกรหัสเข้าใช้งาน', 'warn');
    $('loginApiKey').focus();
    return;
  }

  const button = $('loginSubmit');
  button.disabled = true;
  button.textContent = 'กำลังตรวจสอบ…';
  setLoginStatus('กำลังเชื่อมต่อ iPrint Flow…');

  try {
    await verifyWriteApiKey(key);
    storeWriteApiKey(key, $('rememberLogin').checked);
    $('loginApiKey').value = '';
    showAuthenticatedApp();
    startApplication();
  } catch (error) {
    button.disabled = false;
    button.textContent = 'เข้าสู่ระบบ';
    setLoginStatus(error?.message || 'เข้าสู่ระบบไม่สำเร็จ', 'warn');
  }
}

function logoutApplication() {
  closeSide();
  removeWriteApiKey();
  showLoginGate('ออกจากระบบแล้ว');
}

async function restoreLogin() {
  if (IPRINT_TEST_MODE) {
    showAuthenticatedApp();
    return true;
  }

  const key = getWriteApiKey();
  if (!key) {
    showLoginGate();
    return false;
  }

  $('loginSubmit').disabled = true;
  $('loginSubmit').textContent = 'กำลังเข้าสู่ระบบ…';
  setLoginStatus('กำลังตรวจสอบสิทธิ์…');

  try {
    await verifyWriteApiKey(key);
    showAuthenticatedApp();
    return true;
  } catch (error) {
    removeWriteApiKey();
    showLoginGate('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
    return false;
  }
}

function bindLogin() {
  $('loginForm').addEventListener('submit',submitLogin);
  $('toggleLoginKey').addEventListener('click',toggleLoginKeyVisibility);
}

function bind() {
    if (IPRINT_RESET_TEST_DATA) localStorage.removeItem(KEY);
    loadState();
    if (IPRINT_TEST_MODE) {
      document.body.dataset.testMode = 'true';
      const badge = $('testModeBadge');
      if (badge) badge.hidden = false;
    }
    updateApiKeyStatus();
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
    bindDiecutShape();
    bindCart();
    bindWorkflow();
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
    $('openApiSettings').addEventListener('click',openApiSettings);
    $('closeApiSettings').addEventListener('click',closeSide);
    $('saveApiKey').addEventListener('click',saveWriteApiKey);
    $('clearApiKey').addEventListener('click',logoutApplication);
    $('toggleApiKeyVisibility').addEventListener('click',toggleApiKeyVisibility);
    $('apiKeyInput').addEventListener('keydown',event=> {
      if(event.key==='Enter')saveWriteApiKey();
    });
    $('openBriefAssets').addEventListener('click',()=>openSide('briefAssetsSheet'));
    $('closePaperPreviewSettings').addEventListener('click',closeSide);
    $('closeBriefAssets').addEventListener('click',closeSide);
    $('sheetOverlay').addEventListener('click',closeSide);
    $('openQuote').addEventListener('click',openQuote);
    $('downloadBrief').addEventListener('click',downloadBrief);
    $('closeQuote').addEventListener('click',closeQuote);
    $('cancelQuote2').addEventListener('click',closeQuote);
    $('quoteCustomer').addEventListener('input',selectQuoteCustomer);
    $('quoteCustomer').addEventListener('change',selectQuoteCustomer);
    ['quoteRecipient','quotePhone','quoteContact','quoteLine','quoteTaxId','quoteAddress'].forEach(id=>$(id).addEventListener('input',buildQuote));
    $('printQuote').addEventListener('click',printQuote);
    window.addEventListener('resize',()=>setTimeout(calculate,60));
    calculate();
    syncPresets();
    syncMaterials();
    syncServices();
    syncCustomers()
  }

function startApplication() {
  if (applicationBound) return;
  applicationBound = true;
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
    clearTemporaryImages,
    rotateArtworkImage,
    setActiveArtworkSide,
    getArtworkRotation,
    setCostPreviewMode,
    getCostPreviewMode,
    rotateCostPiecePaper,
    getCostPiecePaperRotation,
    getArtworkSideState,
    syncMaterialPreviewEffect,
    setMaterialPreviewEnabled,
    getMaterialPreviewEnabled,
    getDiecutShapeState,
    clearDiecutShape,
    addCurrentJobToCart,
    openCart,
    publicOrderItems,
    cartTotal,
    clearCartAfterOrder,
    openWorkflow,
    loadWorkflow,
    rememberOrder,
    openApiSettings
  };
}

async function init() {
  bindLogin();
  if (await restoreLogin()) startApplication();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
