function briefEscapeSvg(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function briefShorten(value, maximum) {
  const text=String(value || '-').replace(/\s+/g,' ').trim();
  return text.length>maximum?text.slice(0,maximum-1)+'…':text;
}

function briefUnit(value) {
  const normalized=String(value || '').toLowerCase();
  if(normalized==='sheet'||normalized==='sheets'||normalized==='แผ่น')return 'แผ่น';
  if(normalized==='piece'||normalized==='pieces'||normalized==='ชิ้น'||normalized==='ดวง')return 'ชิ้น';
  if(normalized==='job'||normalized==='งาน')return 'งาน';
  return String(value || 'หน่วย');
}

function briefQuantity(item,calc) {
  const normalized=String(item?.unit || '').toLowerCase();
  if(normalized==='sheet'||normalized==='sheets'||normalized==='แผ่น')return Number(calc.sheets)||0;
  if(normalized==='piece'||normalized==='pieces'||normalized==='ชิ้น'||normalized==='ดวง')return Number(calc.Q)||0;
  return 1;
}

function briefExtras(calc) {
  const extras=[];
  const add=(kind,item)=> {
    if(!item)return;
    const quantity=briefQuantity(item,calc);
    const price=Number(item.price)||0;
    extras.push({
      kind,
      name:String(item.name||kind),
      quantity,
      unit:briefUnit(item.unit),
      price,
      total:price*quantity
    });
  };

  add('วัสดุ',calc.material);
  (Array.isArray(calc.services)?calc.services:[]).forEach(service=>add('บริการเพิ่มเติม',service));
  return extras;
}

function graphicBriefDescription() {
  return String($('graphicBriefDescription')?.value || '').trim();
}

function buildBriefTicket(calc=lastCalc) {
  if(!calc)return null;

  const now=new Date();
  const stamp=now.getFullYear()+
    String(now.getMonth()+1).padStart(2,'0')+
    String(now.getDate()).padStart(2,'0')+'-'+
    String(now.getHours()).padStart(2,'0')+
    String(now.getMinutes()).padStart(2,'0');
  const size=(Number(calc.W)||0).toFixed(2)+' × '+(Number(calc.H)||0).toFixed(2)+' cm';
  const paper=String(calc.paper?.name||'ไม่ระบุ Preset');

  return {
    title:'BRIEF-'+stamp+' • '+paper+' • '+size,
    createdAt:now.toISOString(),
    paper,
    size,
    pieceCount:Number(calc.Q)||0,
    yield:Number(calc.b?.yield)||0,
    sheets:Number(calc.sheets)||0,
    gap:Number(calc.gap)||0,
    bleed:Number(calc.bleed)||0,
    costPerSheet:Number(calc.C)||0,
    profitPercent:Number(calc.P)||0,
    totalCost:Number(calc.total)||0,
    sale:Number(calc.sale)||0,
    graphicBriefDescription:graphicBriefDescription(),
    extras:briefExtras(calc)
  };
}

function briefCard(x,y,width,label,value,detail) {
  return `<rect x="${x}" y="${y}" width="${width}" height="116" rx="18" fill="#ffffff" stroke="#dfe5eb"/>
    <text x="${x+22}" y="${y+31}" class="label">${briefEscapeSvg(label)}</text>
    <text x="${x+22}" y="${y+69}" class="value">${briefEscapeSvg(value)}</text>
    <text x="${x+22}" y="${y+94}" class="detail">${briefEscapeSvg(detail)}</text>`;
}

function briefArtworkPreview(calc, artworkUrl, top=574) {
  const cardHeight=540;
  const stageX=125;
  const stageY=top+54;
  const stageW=830;
  const stageH=330;
  const paper=calc.paper || {};
  const fullW=Math.max(1,Number(paper.fullW)||Number(paper.usableW)||1);
  const fullH=Math.max(1,Number(paper.fullH)||Number(paper.usableH)||1);
  const usableW=Math.min(fullW,Math.max(1,Number(paper.usableW)||fullW));
  const usableH=Math.min(fullH,Math.max(1,Number(paper.usableH)||fullH));
  const paperScale=Math.min((stageW-40)/fullW,(stageH-40)/fullH);
  const paperW=fullW*paperScale;
  const paperH=fullH*paperScale;
  const paperX=stageX+(stageW-paperW)/2;
  const paperY=stageY+(stageH-paperH)/2;
  const usableX=paperX+(fullW-usableW)/2*paperScale;
  const usableY=paperY+(fullH-usableH)/2*paperScale;
  const usableWidth=usableW*paperScale;
  const usableHeight=usableH*paperScale;
  const nx=Math.max(1,Number(calc.b?.nx)||1);
  const ny=Math.max(1,Number(calc.b?.ny)||1);
  const previewNx=Math.min(nx,8);
  const previewNy=Math.min(ny,Math.max(1,Math.floor(64/previewNx)));
  const pieceW=Math.max(1,Number(calc.b?.pieceW)||1);
  const pieceH=Math.max(1,Number(calc.b?.pieceH)||1);
  const gap=Math.max(0,Number(calc.gap)||0);
  const bleed=Math.max(0,Number(calc.bleed)||0);
  const gapCm=gap/10;
  const rawW=previewNx*pieceW+Math.max(0,previewNx-1)*gapCm;
  const rawH=previewNy*pieceH+Math.max(0,previewNy-1)*gapCm;
  const gridW=rawW*paperScale;
  const gridH=rawH*paperScale;
  const startX=usableX+(usableWidth-gridW)/2;
  const startY=usableY+(usableHeight-gridH)/2;
  const cells=[];

  for(let row=0;row<previewNy;row++) {
    for(let column=0;column<previewNx;column++) {
      const x=startX+column*(pieceW+gapCm)*paperScale;
      const y=startY+row*(pieceH+gapCm)*paperScale;
      const width=pieceW*paperScale;
      const height=pieceH*paperScale;
      const inset=Math.min(width/3,height/3,bleed/10*paperScale);
      const placeholder=`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3" fill="#eaf5ff" stroke="#8fc6ef"/>`;
      const image=artworkUrl
        ? `<image href="${briefEscapeSvg(artworkUrl)}" x="${x+1}" y="${y+1}" width="${Math.max(1,width-2)}" height="${Math.max(1,height-2)}" preserveAspectRatio="xMidYMid meet"/>`
        : '';
      const bleedMark=inset>0
        ? `<rect x="${x+inset}" y="${y+inset}" width="${Math.max(1,width-inset*2)}" height="${Math.max(1,height-inset*2)}" fill="none" stroke="#0a8cff" stroke-dasharray="2 2" stroke-width=".8"/>`
        : '';
      cells.push(placeholder+image+bleedMark);
    }
  }

  const paperSize=`${fullW.toLocaleString('th-TH',{maximumFractionDigits:2})} × ${fullH.toLocaleString('th-TH',{maximumFractionDigits:2})} cm`;
  const usableSize=`${usableW.toLocaleString('th-TH',{maximumFractionDigits:2})} × ${usableH.toLocaleString('th-TH',{maximumFractionDigits:2})} cm`;
  const isPartial=previewNx*previewNy<nx*ny;

  return `<rect x="50" y="${top}" width="980" height="${cardHeight}" rx="20" fill="#ffffff" stroke="#dfe5eb"/>
    <text x="76" y="${top+40}" class="section">Preview การวางชิ้นงาน</text>
    <text x="1004" y="${top+40}" text-anchor="end" class="detail">Preset: ${briefEscapeSvg(briefShorten(paper.name || 'ไม่ระบุชื่อ',40))}</text>
    <rect x="${stageX}" y="${stageY}" width="${stageW}" height="${stageH}" rx="16" fill="#eef3f6" stroke="#d8e1e7"/>
    <rect x="${paperX}" y="${paperY}" width="${paperW}" height="${paperH}" rx="5" fill="#ffffff" stroke="#75818b" stroke-width="1.5"/>
    <rect x="${usableX}" y="${usableY}" width="${usableWidth}" height="${usableHeight}" fill="none" stroke="#a1adb6" stroke-dasharray="5 4"/>
    ${cells.join('')}
    <rect x="76" y="${top+592}" width="928" height="62" rx="13" fill="#f6f8fa" stroke="#e0e7ec"/>
    <text x="98" y="${top+618}" class="label">กระดาษ ${briefEscapeSvg(paperSize)}</text>
    <text x="98" y="${top+640}" class="detail">พื้นที่ใช้งาน ${briefEscapeSvg(usableSize)}</text>
    <text x="544" y="${top+618}" class="label">${(Number(calc.b?.yield)||0).toLocaleString('th-TH')} ดวง/แผ่น • Layout ${nx} × ${ny}</text>
    <text x="544" y="${top+640}" class="detail">Gap ${gap.toLocaleString('th-TH',{maximumFractionDigits:1})} mm • Bleed ${bleed.toLocaleString('th-TH',{maximumFractionDigits:1})} mm/ด้าน${isPartial?' • แสดง Preview บางส่วน':''}</text>`;
}

function briefReferenceGallery(referenceUrls, y) {
  const references = (Array.isArray(referenceUrls) ? referenceUrls : []).filter(Boolean).slice(0, 3);
  if (!references.length) return { markup:'', height:0 };

  const gap = 12;
  const width = (944 - gap * (references.length - 1)) / references.length;
  const cardHeight = references.length===1 ? 430 : references.length===2 ? 350 : 310;
  const imageHeight = cardHeight-62;
  const cardY = y + 26;
  const cards = references.map((url, index) => {
    const x = 68 + index * (width + gap);
    return `<rect x="${x}" y="${cardY + 12}" width="${width}" height="${imageHeight}" rx="10" fill="#f6f8fa" stroke="#dfe5eb"/>
      <image href="${briefEscapeSvg(url)}" x="${x + 1}" y="${cardY + 13}" width="${width - 2}" height="${imageHeight - 2}" preserveAspectRatio="xMidYMid meet"/>
      <text x="${x}" y="${cardY + cardHeight - 18}" class="detail">Ref ${index + 1} สำหรับกราฟิก</text>`;
  }).join('');

  return {
    markup:`<text x="50" y="${y}" class="section">Ref สำหรับกราฟิก</text>
      <rect x="50" y="${cardY}" width="980" height="${cardHeight}" rx="20" fill="#ffffff" stroke="#dfe5eb"/>
      ${cards}`,
    height:26+cardHeight
  };
}

function briefDescriptionCard(description, y) {
  const text=String(description||'').replace(/\s+/g,' ').trim();
  if(!text)return { markup:'',height:0 };
  const maximum=70;
  const lines=[];
  for(let index=0;index<text.length&&lines.length<3;index+=maximum) {
    lines.push(text.slice(index,index+maximum));
  }
  if(text.length>maximum*3)lines[2]=lines[2].slice(0,maximum-1)+'…';
  const cardY=y+24;
  const cardHeight=62+lines.length*27;
  const lineMarkup=lines.map((line,index)=>`<tspan x="78" y="${cardY+61+index*27}">${briefEscapeSvg(line)}</tspan>`).join('');
  return {
    markup:`<rect x="50" y="${cardY}" width="980" height="${cardHeight}" rx="20" fill="#ffffff" stroke="#dfe5eb"/>
      <text x="78" y="${cardY+32}" class="label">คำอธิบายสำหรับแผนกกราฟิก</text>
      <text class="detail">${lineMarkup}</text>`,
    height:24+cardHeight
  };
}

function briefImageSvg(calc, artworkUrl='', referenceUrls=[], description='') {
  const layoutWidth=1080;
  const renderScale=2;
  const extras=briefExtras(calc);
  const previewTop=530;
  const previewHeight=560;
  const extraRowHeight=96;
  const extraCount=Math.max(1,extras.length);
  const references=(Array.isArray(referenceUrls)?referenceUrls:[]).filter(Boolean).slice(0,3);
  const descriptionBlock=briefDescriptionCard(description,previewTop+previewHeight+32);
  const extrasTitleY=previewTop+previewHeight+32+descriptionBlock.height+(descriptionBlock.height?28:22);
  const extrasTop=extrasTitleY+24;
  const referenceTop=extrasTop+92+extraCount*extraRowHeight+26;
  const referenceGallery=briefReferenceGallery(references,referenceTop);
  const contentBottom=referenceGallery.height
    ? referenceTop+referenceGallery.height
    : extrasTop+92+extraCount*extraRowHeight;
  const height=contentBottom+56;
  const paperName=briefShorten(calc.paper?.name || 'ไม่ระบุ Preset',38);
  const size=(Number(calc.W)||0).toFixed(2)+' × '+(Number(calc.H)||0).toFixed(2)+' cm';
  const quantity=(Number(calc.Q)||0).toLocaleString('th-TH')+' ชิ้นงาน';
  const yieldValue=(Number(calc.b?.yield)||0).toLocaleString('th-TH')+' ดวง/แผ่น';
  const sheetValue=(Number(calc.sheets)||0).toLocaleString('th-TH')+' แผ่น';
  const extrasMarkup=extras.length
    ? extras.map((item,index)=> {
      const y=extrasTop+58+index*extraRowHeight;
      const details='฿'+money(item.price)+' / '+item.unit+' • '+item.quantity.toLocaleString('th-TH')+' '+item.unit+' • รวม ฿'+money(item.total);
      return `<rect x="50" y="${y}" width="980" height="78" rx="16" fill="#ffffff" stroke="#dfe5eb"/>
        <rect x="70" y="${y+18}" width="118" height="30" rx="15" fill="#eaf5ff"/>
        <text x="129" y="${y+39}" text-anchor="middle" class="pill">${briefEscapeSvg(item.kind)}</text>
        <text x="210" y="${y+34}" class="extra-name">${briefEscapeSvg(briefShorten(item.name,48))}</text>
        <text x="210" y="${y+58}" class="detail">${briefEscapeSvg(details)}</text>`;
    }).join('')
    : `<rect x="50" y="${extrasTop+58}" width="980" height="78" rx="16" fill="#ffffff" stroke="#dfe5eb"/>
       <text x="540" y="${extrasTop+105}" text-anchor="middle" class="empty">ยังไม่ได้เลือกวัสดุหรือบริการเพิ่มเติม</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layoutWidth*renderScale}" height="${height*renderScale}" viewBox="0 0 ${layoutWidth} ${height}">
    <style>
      text { font-family: Arial, Tahoma, sans-serif; fill: #111315; }
      .brand { font-size: 36px; font-weight: 800; fill: #ffffff; }
      .title { font-size: 24px; font-weight: 700; fill: #ffffff; }
      .header-meta { font-size: 16px; fill: #dbeeff; }
      .section { font-size: 19px; font-weight: 700; }
      .label { font-size: 15px; font-weight: 700; fill: #687078; }
      .value { font-size: 30px; font-weight: 800; }
      .detail { font-size: 15px; fill: #687078; }
      .pill { font-size: 13px; font-weight: 700; fill: #16639b; }
      .extra-name { font-size: 19px; font-weight: 700; }
      .empty { font-size: 18px; fill: #687078; }
    </style>
    <rect width="100%" height="100%" fill="#f4f7fa"/>
    <rect width="100%" height="152" fill="#0a8cff"/>
    <text x="50" y="68" class="brand">iPrint</text>
    <text x="50" y="103" class="header-meta">สรุปบรีฟงานพิมพ์</text>
    <text x="1030" y="68" text-anchor="end" class="title">WORK BRIEF</text>
    <text x="1030" y="103" text-anchor="end" class="header-meta">Preset: ${briefEscapeSvg(paperName)}</text>
    <rect x="50" y="188" width="980" height="134" rx="20" fill="#111315"/>
    <text x="78" y="228" class="header-meta">ขนาดชิ้นงาน</text>
    <text x="78" y="278" class="brand">${briefEscapeSvg(size)}</text>
    <line x1="550" y1="212" x2="550" y2="297" stroke="#3a4249"/>
    <text x="580" y="228" class="header-meta">จำนวนชิ้นงาน</text>
    <text x="580" y="278" class="brand">${briefEscapeSvg(quantity)}</text>
    <text x="50" y="374" class="section">แผนการผลิต</text>
    ${briefCard(50,400,475,'จำนวนชิ้นงานต่อแผ่น',yieldValue,'Layout '+(calc.b?.nx||0)+' × '+(calc.b?.ny||0)+' • Gap '+Number(calc.gap||0).toLocaleString('th-TH',{maximumFractionDigits:1})+' mm • Bleed '+Number(calc.bleed||0).toLocaleString('th-TH',{maximumFractionDigits:1})+' mm/ด้าน')}
    ${briefCard(555,400,475,'จำนวนแผ่นที่ใช้',sheetValue,'Preset '+paperName)}
    ${briefArtworkPreview(calc,artworkUrl,previewTop)}
    ${descriptionBlock.markup}
    <text x="50" y="${extrasTitleY}" class="section">วัสดุและบริการเพิ่มเติม</text>
    ${extrasMarkup}
    ${referenceGallery.markup}
  </svg>`;
}

async function captureBriefImage(calc=lastCalc) {
  if(!calc)throw new Error('ไม่พบข้อมูลสำหรับสร้างภาพสรุป');

  const artworkUrl=typeof getArtworkPreviewDataUrl==='function'
    ? await getArtworkPreviewDataUrl()
    : '';
  const referenceUrls=typeof getBriefReferenceDataUrls==='function'
    ? await getBriefReferenceDataUrls()
    : [];
  const description=graphicBriefDescription();
  const svgBlob=new Blob([briefImageSvg(calc,artworkUrl,referenceUrls,description)],{type:'image/svg+xml;charset=utf-8'});
  const imageUrl=URL.createObjectURL(svgBlob);

  try {
    const image=await new Promise((resolve,reject)=> {
      const preview=new Image();
      preview.onload=()=>resolve(preview);
      preview.onerror=()=>reject(new Error('สร้างภาพสรุปไม่สำเร็จ'));
      preview.src=imageUrl;
    });
    const canvas=document.createElement('canvas');
    canvas.width=image.width;
    canvas.height=image.height;
    canvas.getContext('2d').drawImage(image,0,0);

    return await new Promise((resolve,reject)=> {
      canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('แปลงภาพสรุปเป็น PNG ไม่สำเร็จ')),'image/png');
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
