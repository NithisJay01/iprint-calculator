function closeSide() {
      $('materialsServicesSheet').classList.remove('open');
      $('sheetOverlay').classList.remove('open')
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
    ['w','h','qty','cost','profitPercent'].forEach(id=> {
      const el=$(id);
      el.addEventListener('input',calculate);
      el.addEventListener('change',calculate)
    }
    );
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
    $('openMaterialsServices').addEventListener('click',()=> {
      $('materialsServicesSheet').classList.add('open');
      $('sheetOverlay').classList.add('open')
    }
    );
    $('closeMaterialsServices').addEventListener('click',closeSide);
    $('sheetOverlay').addEventListener('click',closeSide);
    function closeSide() {
      $('materialsServicesSheet').classList.remove('open');
      $('sheetOverlay').classList.remove('open')
    }
    $('openQuote').addEventListener('click',openQuote);
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
    syncPresets,
    syncMaterials,
    syncServices,
    syncCustomers,
    openQuote,
    buildQuote,
    captureQuotePreview
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
