function renderServices() {
    const box=$('servicesContainer');
    box.innerHTML='';
    if(!services.length) {
      box.innerHTML='<div class="ms-status">ไม่พบบริการที่ Active</div>';
      return
    }
    const groups= {
    }
    ;
    services.forEach(s=>(groups[String(s.category||'Other')]??=[]).push(s));
    Object.keys(groups).forEach(cat=> {
      const g=document.createElement('div');
      g.className='service-group';
      const t=document.createElement('div');
      t.className='service-group-title';
      t.textContent=cat;
      g.appendChild(t);
      groups[cat].forEach(s=> {
        const row=document.createElement('label');
        row.className='service-row';
        const cb=document.createElement('input');
        cb.type='checkbox';
        cb.checked=!!selectedServiceIds[String(s.id)];
        cb.addEventListener('change',()=> {
          if(cb.checked)selectedServiceIds[String(s.id)]=true;
          else delete selectedServiceIds[String(s.id)];
          saveState();
          calculate()
        }
        );
        const main=document.createElement('div');
        main.className='service-main';
        const n=document.createElement('div');
        n.className='service-name';
        n.textContent=s.name;
        const meta=document.createElement('div');
        meta.className='service-meta';
        meta.textContent=(s.material?s.material+' • ':'')+'หน่วย '+unit(s.unit);
        main.append(n,meta);
        const pr=document.createElement('div');
        pr.className='service-price';
        pr.textContent='฿'+money(s.price);
        row.append(cb,main,pr);
        g.appendChild(row)
      }
      );
      box.appendChild(g)
    }
    );
    $('serviceStatus').textContent='Notion • '+services.length+' บริการ';
  }

async function syncServices() {
    try {
      const d=await getJSON(API.services);
      services=(d.services||[])
      .filter(s=>s&&s.name&&s.active!==false)
      .sort((a,b)=>
      (Number(a.sortOrder)||9999)-
      (Number(b.sortOrder)||9999)
      );
      cachePut(CACHE.services,services);
      renderServices();
    } catch(e) {
      const c=cacheGet(CACHE.services);
      if(c) {
        services=c.data;
        renderServices();
        setCachedStatus(
        'serviceStatus',
        'Cache Services',
        c.timestamp
        );
      } else {
        services=[];
        renderServices();
        setStatus(
        'serviceStatus',
        'เชื่อมต่อ Services ไม่สำเร็จ',
        'warn'
        );
      }
      console.error('GET /services',e);
    }
  }

function serviceCost(sheetCount,pieceCount) {
    let total=0;
    services.filter(s=>selectedServiceIds[String(s.id)]).forEach(s=> {
      const p=Number(s.price)||0,u=normalizeUnit(s.unit);
      total+=u==='sheet'?p*sheetCount:u==='piece'?p*pieceCount:p
    }
    );
    return total
  }
