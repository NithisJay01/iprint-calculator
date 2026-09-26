import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// A PDF as artwork: page 1 is drawn in the browser (PDF.js from this site) and used as a picture.
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const { isPdfFile, renderSize, PDF_MAX_BYTES, PDF_RENDER_SIDE, PDF_MAX_PIXELS, pdfToPng } = await import('../material-preview/pdfArtwork.js');

assert.equal(isPdfFile({ name: 'card.PDF', type: '' }), true);
assert.equal(isPdfFile({ name: 'card', type: 'application/pdf' }), true);
assert.equal(isPdfFile({ name: 'card.png', type: 'image/png' }), false);
assert.equal(PDF_MAX_BYTES, 90 * 1024 * 1024, 'as big as the largest original a request can carry');

// render size: long side capped, aspect kept, pixel count capped
let size = renderSize(255, 153);
assert.equal(Math.max(size.width, size.height), PDF_RENDER_SIDE);
assert.ok(Math.abs(size.width / size.height - 255 / 153) < 0.01, 'the aspect ratio is kept');
size = renderSize(5000, 5000); // a poster-size page: capped by pixels as well
assert.ok(size.width * size.height <= PDF_MAX_PIXELS + 1, 'never more than 40 million pixels');
assert.ok(renderSize(1, 1000).width >= 1, 'never a zero-width canvas');

// bad files are refused before PDF.js is even loaded
await assert.rejects(pdfToPng({ size: PDF_MAX_BYTES + 1, name: 'big.pdf' }), /ใหญ่เกิน 90 MB/);
await assert.rejects(pdfToPng({ size: 9, name: 'bad.pdf', arrayBuffer: async () => new TextEncoder().encode('not a pdf').buffer }), /อ่านไฟล์ PDF ไม่ได้/);

// PDF.js is served from this site (the site policy allows scripts from itself only) under a .js name
for (const file of ['vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js', 'vendor/pdfjs/LICENSE']) {
  assert.ok(existsSync(new URL(`../material-preview/${file}`, import.meta.url)), `${file} is shipped`);
}
const module = read('../material-preview/pdfArtwork.js');
assert.ok(module.includes("import('./vendor/pdfjs/pdf.min.js')"), 'loaded only when a PDF is chosen');
assert.ok(module.includes('isEvalSupported: false'), 'no eval inside PDF.js');
assert.ok(!/https?:\/\//.test(module.replace(/\/\*[\s\S]*?\*\//g, '')), 'no outside address');

// wiring: front and back accept PDF; the special-technique and cut-file slots do not
const [html, layers] = [read('../material-preview/index.html'), read('../material-preview/layers.js')];
for (const id of ['artInput', 'backArtInput']) assert.match(html, new RegExp(`id="${id}" type="file" accept="[^"]*\\.pdf[^"]*application/pdf`));
for (const id of ['cutInput', 'maskInput']) assert.ok(!new RegExp(`id="${id}"[^>]*pdf`).test(html), `${id} stays SVG / PNG only`);
assert.ok(layers.includes('if (isPdfFile(file) && !asMask) return makePdfLayer(file);'));
assert.match(layers, /PDF มี \$\{page\.pages\} หน้า — ใช้เฉพาะหน้าแรก/, 'a multi-page PDF says only page 1 is used');
assert.match(html, /รับ SVG \(ไม่เกิน 5 MB\), PDF, PNG, JPG, WebP \(ไม่เกิน 90 MB\)/);

console.log('PDF artwork test passed');
