/**
 * pdfBuild.js — a production job (productionSpec.assembleJob) → PDF bytes. Pure apart from CompressionStream.
 *
 * What is in the file
 *   page 1   MediaBox = the page, BleedBox = the artwork frame, TrimBox = the cut shape's bounding box
 *   layers   one optional-content layer per job layer (Artwork, Dieline, Foil_Gold…, Marks) — Acrobat and Illustrator
 *            list them as layers
 *   colour   artwork in RGB or a simple CMYK; die-line, finishes and crop marks as named SEPARATION spot colours at
 *            100%, set to overprint so a finish never knocks out the print beneath it
 *   images   embedded at the resolution they were given (JPEG passes through untouched)
 *   page 2   optional job sheet (spec in plain text, standard Helvetica)
 *
 * It is a print-oriented PDF, not a certified PDF/X: no output intent / ICC profile, fonts of the job sheet not embedded.
 */
import { PdfWriter, PT_PER_MM, fmt, pdfName, pdfLiteral, pdfText, pdfDate, deflate, rgbToCmyk, asciiOnly } from './pdf.js';
import { segmentsToPdf } from './svgPath.js';

const CAP = { butt: 0, round: 1, square: 2 };
const JOIN = { miter: 0, round: 1, bevel: 2 };
const A4 = { w: 595.276, h: 841.89 };

const wrap = (text, max = 92) => {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
};

/** @returns {Promise<Uint8Array>} */
export async function buildPdf(job) {
  const k = PT_PER_MM;
  const H = job.media.h;
  const pt = (x, y) => [x * k, (H - y) * k]; // page mm (y down) → PDF pt (y up)
  const w = new PdfWriter();
  const catalog = w.reserve();
  const pagesId = w.reserve();
  const infoId = w.reserve();

  const spotNames = new Map();
  const gStates = new Map();
  const imageRefs = new Map();
  let usesAlpha = false;

  const csName = (key) => {
    if (!job.spots[key]) throw new Error(`PDF: ไม่รู้จักสีพิเศษ "${key}"`);
    if (!spotNames.has(key)) spotNames.set(key, `CS${spotNames.size + 1}`);
    return spotNames.get(key);
  };
  const gsName = (fillAlpha, strokeAlpha, overprint) => {
    const key = `${fmt(fillAlpha)}|${fmt(strokeAlpha)}|${overprint ? 1 : 0}`;
    if (!gStates.has(key)) gStates.set(key, { name: `GS${gStates.size + 1}`, fillAlpha, strokeAlpha, overprint });
    if (fillAlpha < 1 || strokeAlpha < 1) usesAlpha = true;
    return gStates.get(key).name;
  };

  const paint = (p, stroke) => {
    if (!p) return '';
    if (p.spot) return `/${csName(p.spot)} ${stroke ? 'CS' : 'cs'} ${fmt(p.tint ?? 1)} ${stroke ? 'SCN' : 'scn'}\n`;
    const [r, g, b] = p.rgb;
    if (job.colorMode === 'cmyk') return `${rgbToCmyk(r, g, b).map(fmt).join(' ')} ${stroke ? 'K' : 'k'}\n`;
    return `${fmt(r)} ${fmt(g)} ${fmt(b)} ${stroke ? 'RG' : 'rg'}\n`;
  };

  /* ---------------------------------------------------------- images */
  const embedImage = async (id) => {
    if (imageRefs.has(id)) return imageRefs.get(id);
    const img = job.images[id];
    if (!img) throw new Error(`PDF: ไม่พบภาพ ${id}`);
    let data = img.data;
    let filter = img.filter ?? null;
    if (!filter) {
      const z = await deflate(data);
      if (z) {
        data = z;
        filter = 'FlateDecode';
      }
    }
    let smask = '';
    if (img.smask) {
      let sd = img.smask.data;
      let sf = null;
      const z = await deflate(sd);
      if (z) {
        sd = z;
        sf = 'FlateDecode';
      }
      const sid = w.addStream(`/Type /XObject /Subtype /Image /Width ${img.smask.width} /Height ${img.smask.height} /ColorSpace /DeviceGray /BitsPerComponent 8${sf ? ` /Filter /${sf}` : ''}`, sd);
      smask = ` /SMask ${sid} 0 R`;
    }
    const dict = `/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /${img.colorSpace} /BitsPerComponent ${img.bpc ?? 8}${filter ? ` /Filter /${filter}` : ''}${img.decode ? ` /Decode [${img.decode.join(' ')}]` : ''}${smask}`;
    const ref = { name: `Im${imageRefs.size + 1}`, id: w.addStream(dict, data) };
    imageRefs.set(id, ref);
    return ref;
  };

  /* ----------------------------------------------------------- items */
  const pathOps = (item) => {
    const fillAlpha = item.fill?.alpha ?? 1;
    const strokeAlpha = item.stroke?.alpha ?? 1;
    let s = 'q\n';
    if (fillAlpha < 1 || strokeAlpha < 1 || item.overprint) s += `/${gsName(fillAlpha, strokeAlpha, item.overprint)} gs\n`;
    s += paint(item.fill, false) + paint(item.stroke, true);
    if (item.stroke) {
      const st = item.stroke;
      s += `${fmt(st.width * k)} w\n${st.cap ?? 0} J\n${st.join ?? 0} j\n${fmt(st.miter ?? 10)} M\n`;
      if (st.dash?.length) s += `[${st.dash.map((d) => fmt(d * k)).join(' ')}] ${fmt((st.dashOffset ?? 0) * k)} d\n`;
    }
    s += `${segmentsToPdf(item.segs, pt)}\n`;
    const evenOdd = item.rule === 'evenodd';
    if (item.fill && item.stroke) s += evenOdd ? 'B*\n' : 'B\n';
    else if (item.fill) s += evenOdd ? 'f*\n' : 'f\n';
    else if (item.stroke) s += 'S\n';
    else s += 'n\n';
    return `${s}Q\n`;
  };

  const imageOps = async (item) => {
    const ref = await embedImage(item.id);
    const [a, b, c, d, e, f] = item.matrix;
    // image space is 0..1 with y UP; the matrix maps it onto the page in mm with y DOWN
    const cm = [a * k, -b * k, c * k, -d * k, e * k, (H - f) * k].map(fmt).join(' ');
    const alpha = item.alpha ?? 1;
    return `q\n${alpha < 1 ? `/${gsName(alpha, alpha, false)} gs\n` : ''}${cm} cm\n/${ref.name} Do\nQ\n`;
  };

  /* ---------------------------------------------------------- layers */
  const ocgs = [];
  let content = '';
  for (const layer of job.layers) {
    if (!layer.items?.length) continue;
    const id = w.add(`<< /Type /OCG /Name ${pdfLiteral(layer.name)} >>`);
    const name = `OC${ocgs.length + 1}`;
    ocgs.push({ id, name });
    content += `/OC /${name} BDC\n`;
    for (const item of layer.items) content += item.type === 'image' ? await imageOps(item) : pathOps(item);
    content += 'EMC\n';
  }

  /* ------------------------------------------------------------ page 1 */
  const box = (x0, y0, x1, y1) => `[${[x0 * k, (H - y1) * k, x1 * k, (H - y0) * k].map(fmt).join(' ')}]`;
  const spotCs = (key) => {
    const s = job.spots[key];
    return `[/Separation ${pdfName(s.name)} /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [${s.cmyk.map(fmt).join(' ')}] /N 1 >>]`;
  };
  const resources = [
    spotNames.size ? `/ColorSpace << ${[...spotNames].map(([key, n]) => `/${n} ${spotCs(key)}`).join(' ')} >>` : '',
    gStates.size
      ? `/ExtGState << ${[...gStates.values()].map((g) => `/${g.name} << /Type /ExtGState /CA ${fmt(g.strokeAlpha)} /ca ${fmt(g.fillAlpha)}${g.overprint ? ' /OP true /op true /OPM 1' : ''} >>`).join(' ')} >>`
      : '',
    imageRefs.size ? `/XObject << ${[...imageRefs.values()].map((r) => `/${r.name} ${r.id} 0 R`).join(' ')} >>` : '',
    ocgs.length ? `/Properties << ${ocgs.map((o) => `/${o.name} ${o.id} 0 R`).join(' ')} >>` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const raw = new TextEncoder().encode(content);
  const packed = await deflate(raw);
  const contentId = w.addStream(packed ? '/Filter /FlateDecode' : '', packed ?? raw);
  const page1 = w.add(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox ${box(0, 0, job.media.w, job.media.h)} /BleedBox ${box(job.bleed.x0, job.bleed.y0, job.bleed.x1, job.bleed.y1)} /TrimBox ${box(job.trim.x0, job.trim.y0, job.trim.x1, job.trim.y1)} /Resources << ${resources} >> /Contents ${contentId} 0 R${usesAlpha ? ' /Group << /S /Transparency /CS /DeviceRGB >>' : ''} >>`,
  );
  const kids = [page1];

  /* ------------------------------------------------------------ page 2 */
  if (job.jobPage?.length) {
    const font = w.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const [title, ...rest] = job.jobPage;
    let text = `BT\n/F1 15 Tf\n56 780 Td\n${pdfLiteral(title)} Tj\nET\nBT\n/F1 10.5 Tf\n15 TL\n56 748 Td\n`;
    for (const l of rest) for (const part of wrap(l)) text += `${pdfLiteral(part)} Tj\nT*\n`;
    text += 'ET\n';
    const bytes = new TextEncoder().encode(text);
    const z = await deflate(bytes);
    const c2 = w.addStream(z ? '/Filter /FlateDecode' : '', z ?? bytes);
    kids.push(w.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c2} 0 R >>`));
  }

  w.set(pagesId, `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`);
  const refs = ocgs.map((o) => `${o.id} 0 R`).join(' ');
  w.set(catalog, `<< /Type /Catalog /Pages ${pagesId} 0 R${ocgs.length ? ` /OCProperties << /OCGs [${refs}] /D << /Order [${refs}] /ON [${refs}] >> >>` : ''} >>`);
  w.set(infoId, `<< /Title ${pdfText(job.title)} /Subject ${pdfText(job.subject)} /Keywords ${pdfText(asciiOnly(job.keywords))} /Creator ${pdfLiteral('iPrint Material Preview')} /Producer ${pdfLiteral('iPrint Material Preview')} /CreationDate (${pdfDate(job.date)}) >>`);
  return w.serialize({ root: catalog, info: infoId, id: job.docId });
}
