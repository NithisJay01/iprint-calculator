/**
 * pdfArtwork.js — a PDF as an artwork layer (front / back).
 *
 * Nothing is uploaded. The first page is drawn in the browser (PDF.js, served from this site) onto a canvas whose
 * long side is at most PDF_RENDER_SIDE px, and handed on as a PNG so the picture pipeline (fit, position pop-up,
 * production PDF) treats it like any other picture. Scripts inside the PDF are never run.
 */
export const PDF_MAX_BYTES = 10 * 1024 * 1024;
export const PDF_RENDER_SIDE = 3000;
export const PDF_MAX_PIXELS = 40e6;

export const isPdfFile = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');

let lib = null;
async function loadPdfJs() {
  if (!lib) {
    lib = import('./vendor/pdfjs/pdf.min.js').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
      return m;
    });
  }
  return lib;
}

/** Size of the render for a page of w × h points: the long side is PDF_RENDER_SIDE px (never more than PDF_MAX_PIXELS). */
export function renderSize(w, h) {
  const k = Math.min(PDF_RENDER_SIDE / Math.max(w, h), Math.sqrt(PDF_MAX_PIXELS / (w * h)));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/**
 * @returns {Promise<{file: File, pages: number, widthMm: number, heightMm: number}>} page 1 as a PNG file
 */
export async function pdfToPng(file) {
  if (file.size > PDF_MAX_BYTES) throw new Error(`ไฟล์ PDF ใหญ่เกิน ${PDF_MAX_BYTES / 1048576} MB`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('อ่านไฟล์ PDF ไม่ได้ — ไฟล์อาจเสียหาย');
  const pdfjs = await loadPdfJs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, enableXfa: false }).promise;
  } catch (error) {
    throw new Error(error?.name === 'PasswordException' ? 'PDF นี้มีรหัสผ่าน — ถอดรหัสผ่านก่อนอัปโหลด' : 'อ่านไฟล์ PDF ไม่ได้ — ไฟล์อาจเสียหาย');
  }
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const size = renderSize(base.width, base.height);
    const viewport = page.getViewport({ scale: size.width / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise; // transparent where the page has no colour
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('แปลงไฟล์ PDF เป็นภาพไม่ได้');
    const mm = (pt) => (pt * 25.4) / 72;
    return {
      file: new File([blob], String(file.name || 'artwork.pdf').replace(/\.pdf$/i, '') + '.png', { type: 'image/png' }),
      pages: doc.numPages,
      widthMm: mm(base.width),
      heightMm: mm(base.height),
    };
  } finally {
    doc.destroy();
  }
}
