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
      pageId:String(item.id||''),
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
  const artworkSides=typeof getArtworkSideState==='function'
    ?getArtworkSideState()
    :{hasFront:false,hasBack:false,useFrontForBack:false};

  return {
    title:'BRIEF-'+stamp+' • '+paper+' • '+size,
    createdAt:now.toISOString(),
    paper,
    size,
    pieceCount:Number(calc.Q)||0,
    yield:Number(calc.b?.yield)||0,
    sheets:Number(calc.sheets)||0,
    totalCost:Number(calc.total)||0,
    sale:Number(calc.sale)||0,
    printSide:typeof getSelectedPrintSide==='function'?getSelectedPrintSide():'unspecified',
    artworkSides,
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

function briefArtworkPreview(calc, artworkUrl, top=574, sideLabel='ด้านหน้า') {
  const cardHeight=680;
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
  const pieceW=Math.max(1,Number(calc.b?.pieceW)||1) / 10;  // mm → cm
  const pieceH=Math.max(1,Number(calc.b?.pieceH)||1) / 10;  // mm → cm
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
      const clipId=`briefPieceClip${row}-${column}`;
      const clip=`<defs><clipPath id="${clipId}"><rect x="${x+1}" y="${y+1}" width="${Math.max(1,width-2)}" height="${Math.max(1,height-2)}" rx="2"/></clipPath></defs>`;
      const placeholder=`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3" fill="#eaf5ff" stroke="#8fc6ef"/>`;
      const image=artworkUrl
        ? `<image href="${briefEscapeSvg(artworkUrl)}" x="${x+1}" y="${y+1}" width="${Math.max(1,width-2)}" height="${Math.max(1,height-2)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`
        : '';
      const bleedMark=inset>0
        ? `<rect x="${x+inset}" y="${y+inset}" width="${Math.max(1,width-inset*2)}" height="${Math.max(1,height-inset*2)}" fill="none" stroke="#0a8cff" stroke-dasharray="2 2" stroke-width=".8"/>`
        : '';
      cells.push(clip+placeholder+image+bleedMark);
    }
  }

  const paperSize=`${fullW.toLocaleString('th-TH',{maximumFractionDigits:2})} × ${fullH.toLocaleString('th-TH',{maximumFractionDigits:2})} cm`;
  const usableSize=`${usableW.toLocaleString('th-TH',{maximumFractionDigits:2})} × ${usableH.toLocaleString('th-TH',{maximumFractionDigits:2})} cm`;
  const isPartial=previewNx*previewNy<nx*ny;

  return `<rect x="50" y="${top}" width="980" height="${cardHeight}" rx="20" fill="#ffffff" stroke="#dfe5eb"/>
    <text x="76" y="${top+40}" class="section">Preview การวางชิ้นงาน • ${briefEscapeSvg(sideLabel)}</text>
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
    const clipId=`briefReferenceClip${index}`;
    return `<defs><clipPath id="${clipId}"><rect x="${x + 1}" y="${cardY + 13}" width="${width - 2}" height="${imageHeight - 2}" rx="9"/></clipPath></defs>
      <rect x="${x}" y="${cardY + 12}" width="${width}" height="${imageHeight}" rx="10" fill="#f6f8fa" stroke="#dfe5eb"/>
      <image href="${briefEscapeSvg(url)}" x="${x + 1}" y="${cardY + 13}" width="${width - 2}" height="${imageHeight - 2}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})"/>
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

function briefImageSvg(calc, artworkUrl='', referenceUrls=[], description='', backArtworkUrl='', includeBack=false) {
  const layoutWidth=1080;
  const renderScale=2;
  const extras=briefExtras(calc);
  const previewTop=530;
  const previewBlockHeight=700;
  const previewHeight=includeBack ? previewBlockHeight*2 : previewBlockHeight;
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
    ${briefArtworkPreview(calc,artworkUrl,previewTop,'ด้านหน้า')}
    ${includeBack?briefArtworkPreview(calc,backArtworkUrl,previewTop+previewBlockHeight,'ด้านหลัง'):''}
    ${descriptionBlock.markup}
    <text x="50" y="${extrasTitleY}" class="section">วัสดุและบริการเพิ่มเติม</text>
    ${extrasMarkup}
    ${referenceGallery.markup}
  </svg>`;
}

function briefReviewSurfaceOverlay(x,y,width,height,calc) {
  if(typeof getMaterialPreviewEnabled==='function'&&!getMaterialPreviewEnabled())return '';
  const config=typeof materialPreviewConfig==='function'?materialPreviewConfig(calc):{mode:'none',effect:'none'};
  if(config.mode==='webgl')return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#reviewHolo)" opacity=".42"/>`;
  const opacity=config.effect==='gloss'?'.58':config.effect==='matte'?'.22':'.1';
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#reviewShine)" opacity="${opacity}"/>`;
}

function briefReviewMaterialTint(calc) {
  const name=String(calc?.material?.name||'').toLowerCase();
  if(/kraft|คราฟท์/.test(name))return '<rect class="piece-tint" fill="#b67b3d" opacity=".2"/>';
  if(/pvc|pp|sticker|สติกเกอร์/.test(name))return '<rect class="piece-tint" fill="#e6f6ff" opacity=".12"/>';
  if(/art|อาร์ท/.test(name))return '<rect class="piece-tint" fill="#fff8e9" opacity=".12"/>';
  return '';
}

function briefReviewSheetSvg(calc,artworkUrl,side,x,y,width,height) {
  const paper=calc.paper||{};
  const fullW=Math.max(1,Number(paper.fullW)||1),fullH=Math.max(1,Number(paper.fullH)||1);
  const usableW=Math.max(1,Math.min(fullW,Number(paper.usableW)||fullW)),usableH=Math.max(1,Math.min(fullH,Number(paper.usableH)||fullH));
  const scale=Math.min((width-30)/fullW,(height-30)/fullH);
  const paperW=fullW*scale,paperH=fullH*scale,paperX=x+(width-paperW)/2,paperY=y+(height-paperH)/2;
  const usableX=paperX+(fullW-usableW)/2*scale,usableY=paperY+(fullH-usableH)/2*scale,usableWidth=usableW*scale,usableHeight=usableH*scale;
  const nx=Math.max(1,Number(calc.b?.nx)||1),ny=Math.max(1,Number(calc.b?.ny)||1);
  const pieceW=Math.max(1,Number(calc.b?.pieceW)||1)/10,pieceH=Math.max(1,Number(calc.b?.pieceH)||1)/10,gap=Math.max(0,Number(calc.gap)||0)/10;
  const gridW=(nx*pieceW+Math.max(0,nx-1)*gap)*scale,gridH=(ny*pieceH+Math.max(0,ny-1)*gap)*scale;
  const startX=usableX+(usableWidth-gridW)/2,startY=usableY+(usableHeight-gridH)/2;
  const maximum=Math.min(96,Math.max(1,Number(calc.b?.yield)||nx*ny));
  const diecut=(calc.services||[]).some(service=>/ไดคัท|die.?cut/.test(String(service?.name||'').toLowerCase()));
  const cells=[];
  for(let index=0;index<maximum;index++) {
    const row=Math.floor(index/nx),column=index%nx;
    if(row>=ny)break;
    const cellX=startX+column*(pieceW+gap)*scale,cellY=startY+row*(pieceH+gap)*scale,cellW=pieceW*scale,cellH=pieceH*scale;
    const clipId=`review-${side}-${index}`;
    const image=artworkUrl?`<image href="${briefEscapeSvg(artworkUrl)}" x="${cellX+1}" y="${cellY+1}" width="${Math.max(1,cellW-2)}" height="${Math.max(1,cellH-2)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`:'';
    const tint=briefReviewMaterialTint(calc).replace('class="piece-tint"',`x="${cellX+1}" y="${cellY+1}" width="${Math.max(1,cellW-2)}" height="${Math.max(1,cellH-2)}"`);
    cells.push(`<defs><clipPath id="${clipId}"><rect x="${cellX+1}" y="${cellY+1}" width="${Math.max(1,cellW-2)}" height="${Math.max(1,cellH-2)}"/></clipPath></defs><rect x="${cellX}" y="${cellY}" width="${cellW}" height="${cellH}" fill="#fff" stroke="${diecut?'#ff8b00':'#8a949e'}" ${diecut?'stroke-dasharray="3 2"':''}/>${image}${tint}`);
  }
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="#edf4f8"/><rect x="${paperX}" y="${paperY}" width="${paperW}" height="${paperH}" rx="4" fill="#fff" stroke="#75818b"/><rect x="${usableX}" y="${usableY}" width="${usableWidth}" height="${usableHeight}" fill="none" stroke="#a1adb6" stroke-dasharray="5 4"/>${cells.join('')}${briefReviewSurfaceOverlay(paperX,paperY,paperW,paperH,calc)}`;
}

function briefReviewPieceSvg(calc,artworkUrl,x,y,width,height) {
  const workW=Math.max(.1,Number(calc.b?.pieceW)||Number(calc.W)*10||1),workH=Math.max(.1,Number(calc.b?.pieceH)||Number(calc.H)*10||1);
  const scale=Math.min((width-80)/workW,(height-50)/workH);
  const pieceW=workW*scale,pieceH=workH*scale,pieceX=x+(width-pieceW)/2,pieceY=y+(height-pieceH)/2;
  const clipId='review-piece-'+Math.random().toString(36).slice(2);
  const diecut=(calc.services||[]).some(service=>/ไดคัท|die.?cut/.test(String(service?.name||'').toLowerCase()));
  const image=artworkUrl?`<image href="${briefEscapeSvg(artworkUrl)}" x="${pieceX+1}" y="${pieceY+1}" width="${Math.max(1,pieceW-2)}" height="${Math.max(1,pieceH-2)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`:'';
  const tint=briefReviewMaterialTint(calc).replace('class="piece-tint"',`x="${pieceX+1}" y="${pieceY+1}" width="${Math.max(1,pieceW-2)}" height="${Math.max(1,pieceH-2)}"`);
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="#edf4f8"/><defs><clipPath id="${clipId}"><rect x="${pieceX+1}" y="${pieceY+1}" width="${Math.max(1,pieceW-2)}" height="${Math.max(1,pieceH-2)}" rx="5"/></clipPath></defs><rect x="${pieceX}" y="${pieceY}" width="${pieceW}" height="${pieceH}" rx="7" fill="#fff" stroke="${diecut?'#ff8b00':'#8a949e'}" ${diecut?'stroke-dasharray="5 3"':''}/>${image}${tint}${briefReviewSurfaceOverlay(pieceX,pieceY,pieceW,pieceH,calc)}`;
}

function briefReviewImageSvg(calc,artworkUrls) {
  const variants=typeof getJobVariants==='function'?getJobVariants():[];
  const doubleSided=typeof getSelectedPrintSide==='function'&&getSelectedPrintSide()==='double';
  const sides=doubleSided&&artworkUrls.back?['front','back']:['front'];
  const services=(calc.services||[]).map(service=>service.name).filter(Boolean).join(' • ')||'ไม่มีบริการเพิ่มเติม';
  const jobName=String($('jobName')?.value||'').trim()||'-';
  const note=graphicBriefDescription()||'ไม่มีคำขอเทคนิคพิเศษ';
  const link=String($('briefFileLink')?.value||'').trim();
  let y=56;
  const content=[];
  content.push(`<rect x="50" y="${y}" width="980" height="110" rx="22" fill="#fff" stroke="#063b70" stroke-width="2"/><text x="80" y="${y+50}" class="title">■ iPrint Brief — ${briefEscapeSvg(Number(calc.W).toLocaleString('th-TH'))}×${briefEscapeSvg(Number(calc.H).toLocaleString('th-TH'))} cm</text><text x="1000" y="${y+50}" text-anchor="end" class="muted">Preview</text>`);
  y+=110;
  content.push(`<rect x="50" y="${y}" width="980" height="66" fill="#fff" stroke="#b8d6ee"/><text x="80" y="${y+41}" class="body"><tspan font-weight="700">ชื่องาน :</tspan> ${briefEscapeSvg(jobName)}</text>`);
  y+=66;
  const variantsHeight=58+Math.max(1,variants.length)*43;
  content.push(`<rect x="50" y="${y}" width="980" height="${variantsHeight}" fill="#fff"/><text x="80" y="${y+36}" class="section">จำนวนแบบ : ${variants.length} แบบ</text>${(variants.length?variants:[{name:'-',quantity:0}]).map((variant,index)=>`<text x="80" y="${y+76+index*43}" class="body"><tspan font-weight="700">แบบที่ ${index+1}</tspan><tspan x="220">${briefEscapeSvg(briefShorten(variant.name||'-',56))}</tspan><tspan x="990" text-anchor="end" font-weight="700">${Number(variant.quantity||0).toLocaleString('th-TH')} ชิ้น</tspan></text>`).join('')}`);
  y+=variantsHeight+14;
  const metric=(x,top,label,value)=>`<rect x="${x}" y="${top}" width="473" height="92" rx="13" fill="#eef6ff"/><text x="${x+18}" y="${top+28}" class="small">${briefEscapeSvg(label)}</text><text x="${x+18}" y="${top+61}" class="metric">${briefEscapeSvg(value)}</text>`;
  content.push(metric(50,y,'ขนาด / จำนวน',`${calc.W}×${calc.H} cm (${Number(calc.Q).toLocaleString('th-TH')} ชิ้น)`)+metric(557,y,'การจัดวางชิ้นงาน',`${calc.b.yield} ชิ้น/แผ่น (${calc.sheets} แผ่น)`)+metric(50,y+106,'วัสดุ / การผลิต',String(calc.material?.name||calc.paper?.name||'-'))+metric(557,y+106,'กำหนดส่งงาน',typeof formatGregorianDate==='function'?formatGregorianDate($('deliveryDeadline')?.value):'-'));
  y+=212;
  content.push(`<rect x="50" y="${y}" width="980" height="92" rx="14" fill="#f8fbff" stroke="#b8d6ee"/><text x="72" y="${y+34}" class="body">${briefEscapeSvg(briefShorten(note,95))}</text><text x="72" y="${y+66}" class="small">${briefEscapeSvg(briefShorten(services,105))}</text>`);
  y+=126;
  content.push(`<text x="50" y="${y}" class="section">Preview รายแผ่น</text>`); y+=20;
  sides.forEach(side=>{content.push(`<rect x="50" y="${y}" width="980" height="510" rx="18" fill="#f8fbff" stroke="#b8d6ee"/><text x="76" y="${y+35}" class="card-title">ตัวอย่าง • ${side==='back'?'ด้านหลัง':'ด้านหน้า'}</text>${briefReviewSheetSvg(calc,artworkUrls[side]||'',side,76,y+52,928,432)}`);y+=528;});
  y+=16; content.push(`<text x="50" y="${y}" class="section">Preview รายชิ้น</text>`); y+=20;
  sides.forEach(side=>{content.push(`<rect x="50" y="${y}" width="980" height="350" rx="18" fill="#f8fbff" stroke="#b8d6ee"/><text x="76" y="${y+35}" class="card-title">ตัวอย่าง • ${side==='back'?'ด้านหลัง':'ด้านหน้า'}</text>${briefReviewPieceSvg(calc,artworkUrls[side]||'',76,y+52,928,272)}`);y+=368;});
  if(link){content.push(`<rect x="50" y="${y+12}" width="980" height="82" rx="14" fill="#f8fbff" stroke="#b8d6ee"/><text x="72" y="${y+43}" class="small">ลิงก์ไฟล์ต้นฉบับ</text><text x="72" y="${y+70}" class="body">${briefEscapeSvg(briefShorten(link,100))}</text>`);y+=106;}
  const height=y+56;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2160" height="${height*2}" viewBox="0 0 1080 ${height}"><defs><linearGradient id="reviewShine" x1="0" y1="0" x2="1" y2="1"><stop offset="18%" stop-color="#fff" stop-opacity="0"/><stop offset="50%" stop-color="#fff" stop-opacity=".9"/><stop offset="82%" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="reviewHolo" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#45dcff" stop-opacity=".2"/><stop offset=".45" stop-color="#ff58dd" stop-opacity=".55"/><stop offset=".72" stop-color="#ffe85c" stop-opacity=".38"/><stop offset="1" stop-color="#45dcff" stop-opacity=".18"/></linearGradient></defs><style>text{font-family:Arial,Tahoma,sans-serif;fill:#111315}.title{font-size:25px;font-weight:700}.section{font-size:21px;font-weight:700}.body{font-size:17px}.small,.muted{font-size:15px;fill:#61788d}.metric{font-size:18px;font-weight:700}.card-title{font-size:17px;font-weight:700;fill:#063b70}</style><rect width="1080" height="${height}" fill="#eef6ff"/><rect x="36" y="36" width="1008" height="${height-72}" rx="28" fill="#fff" stroke="#063b70" stroke-width="2"/>${content.join('')}</svg>`;
}

async function captureBriefImage(calc=lastCalc) {
  if(!calc)throw new Error('ไม่พบข้อมูลสำหรับสร้างภาพสรุป');
  if(typeof renderBriefReview==='function')renderBriefReview({skipValidation:true});
  const artworkUrls=typeof getArtworkPreviewDataUrls==='function'?await getArtworkPreviewDataUrls():{front:'',back:''};
  const imageUrl=URL.createObjectURL(new Blob([briefReviewImageSvg(calc,artworkUrls)],{type:'image/svg+xml;charset=utf-8'}));
  try {
    const image=await new Promise((resolve,reject)=>{const preview=new Image();preview.onload=()=>resolve(preview);preview.onerror=()=>reject(new Error('สร้างภาพจากการ์ด Review ไม่สำเร็จ'));preview.src=imageUrl;});
    const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth||2160;
    canvas.height=image.naturalHeight||1440;
    const context=canvas.getContext('2d');
    context.fillStyle='#eef6ff';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0);
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('แปลงภาพ Review เป็น PNG ไม่สำเร็จ')),'image/png'));
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
