import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { largeOriginals, announceOriginals, referenceSources, uploadOriginals, originalOf } from '../material-preview/originals.js';
import { MAX_ARTWORK_BYTES, MAX_ORIGINAL_BYTES } from '../shared/print-request.js';
import { RASTER_MAX_BYTES } from '../material-preview/rasterArtwork.js';

// Big originals: the request carries a small reference, the original goes up separately after the request is saved.
const fileOf = (name, size) => ({ name, size });
const MB = 1048576;
assert.equal(MAX_ORIGINAL_BYTES, 90 * MB);
assert.equal(RASTER_MAX_BYTES, MAX_ORIGINAL_BYTES, 'a picture up to 90 MB can be opened in the preview');

// ---------- which files are "large" ----------
const small = { kind: 'raster', file: fileOf('small.png', 2 * MB), info: { type: 'png', width: 100, height: 100 } };
const big = { kind: 'raster', file: fileOf('big.png', 30 * MB), info: { type: 'png', width: 9000, height: 6000 } };
const pdf = { kind: 'raster', file: fileOf('page1.png', 4 * MB), original: fileOf('poster.pdf', 50 * MB), info: { type: 'png', width: 3000, height: 2000 } };
assert.deepEqual(largeOriginals({ art: small }), [], 'a small file goes in the request as before');
assert.deepEqual(largeOriginals({ art: big }).map(i => [i.slot, i.file.name]), [['front', 'big.png']]);
assert.deepEqual(largeOriginals({ art: pdf }).map(i => [i.slot, i.file.name]), [['front', 'poster.pdf']], 'a PDF is judged (and sent) as the PDF, not its picture');
assert.equal(originalOf(pdf).name, 'poster.pdf');
assert.equal(originalOf(big).name, 'big.png');
assert.equal(originalOf(null), null);
assert.deepEqual(largeOriginals({ art: big, backArt: pdf }).map(i => i.slot), ['front', 'back']);
assert.deepEqual(largeOriginals({ art: small, backArt: big }).map(i => i.slot), ['back']);
assert.deepEqual(largeOriginals({ art: big, backArt: pdf }, false).map(i => i.slot), ['front'], 'no back side: nothing for the back');
assert.deepEqual(largeOriginals({ art: fileOf('x', MAX_ARTWORK_BYTES) && { file: fileOf('x.png', MAX_ARTWORK_BYTES) } }), [], 'exactly 10 MB is still a normal file');
assert.equal(largeOriginals({ mask: big }).length, 0, 'the special-technique shape is never sent as an original');
assert.deepEqual(announceOriginals(largeOriginals({ art: pdf })), [{ slot: 'front', name: 'poster.pdf', size: 50 * MB }]);

// ---------- the reference picture ----------
const shrunk = [];
const shrink = async (file, info) => { shrunk.push(file.name); return { file: fileOf('ref-' + file.name, 1 * MB), info: { type: 'jpeg', width: 1000, height: 600 } }; };
const out = await referenceSources({ paperId: 'smooth', art: { ...big, pixelWidth: 9000 }, backArt: small, mask: null }, shrink);
assert.deepEqual(shrunk, ['big.png'], 'only the oversize picture is shrunk');
assert.equal(out.art.file.name, 'ref-big.png');
assert.deepEqual(out.art.info, { type: 'jpeg', width: 1000, height: 600 });
assert.equal(out.art.pixelWidth, 9000, "the resolution check still uses the customer's own pixels");
assert.equal(out.backArt, small, 'a small picture is left as it is');
assert.equal(out.paperId, 'smooth');
assert.equal(big.file.name, 'big.png', 'the original layer is not changed');
const svg = { kind: 'svg', file: fileOf('v.svg', 20 * MB) };
assert.equal((await referenceSources({ art: svg }, shrink)).art, svg, 'an SVG is never shrunk');
assert.equal((await referenceSources({ art: pdf }, shrink)).art, pdf, 'the picture of a PDF page is already small');

// ---------- the upload ----------
const sent = [];
const items = [{ slot: 'front', file: fileOf('a.pdf', 50 * MB) }, { slot: 'back', file: fileOf('b.png', 30 * MB) }];
const progress = [];
await uploadOriginals({ apiRoot: 'https://api.test', token: 'T', items, onProgress: p => progress.push(p),
  send: async (url, file, token, onProgress) => { sent.push([url, file.name, token]); onProgress(1, 2); } });
assert.deepEqual(sent, [['https://api.test/public/print-requests/originals/front', 'a.pdf', 'T'], ['https://api.test/public/print-requests/originals/back', 'b.png', 'T']], 'front first, then back');
assert.deepEqual(items, [], 'sent files are taken off the list');
assert.deepEqual(progress[0], { slot: 'front', name: 'a.pdf', loaded: 1, total: 2 });
// a failure stops there, keeps what was not sent, and a retry sends only that
const retry = [{ slot: 'front', file: fileOf('a.pdf', 50 * MB) }, { slot: 'back', file: fileOf('b.png', 30 * MB) }];
let attempts = 0;
const flaky = async (url) => { attempts += 1; if (url.endsWith('/back')) throw new Error('offline'); };
await assert.rejects(uploadOriginals({ apiRoot: 'x', token: 'T', items: retry, send: flaky }), /offline/);
assert.deepEqual(retry.map(i => i.slot), ['back'], 'the front went through; only the back is left');
await uploadOriginals({ apiRoot: 'x', token: 'T', items: retry, send: async () => {} });
assert.deepEqual(retry, []);

// ---------- the page: wiring ----------
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const [page, html, layers] = ['../material-preview/request-print.js', '../material-preview/index.html', '../material-preview/layers.js'].map(read);
assert.ok(page.includes('...(snapshot.large?.length ? { originals: announceOriginals(snapshot.large) } : {})'), 'the request announces the originals');
assert.ok(page.includes('current.large.length ? await referenceSources(current.exportSources) : current.exportSources'), 'the request carries the small reference export');
assert.ok(page.includes('large: largeOriginals(sources)'));
assert.match(page, /if \(result\.uploadToken\) \{ originalsState = \{ token: result\.uploadToken/, 'the originals are uploaded after the request is saved');
assert.match(page, /ระบบรับไฟล์ต้นฉบับยังไม่พร้อม — คำขอถูกบันทึกแล้ว กรุณาส่งไฟล์ต้นฉบับให้ร้านทาง LINE/, 'no ticket: the customer is told, the request is not lost');
assert.match(page, /function close\(\) \{ if \(!submitting && !uploading\) dialog\.close\(\); \}/, 'the pop-up cannot be closed in the middle of an upload');
assert.match(page, /if \(submitting \|\| uploading\) event\.preventDefault\(\)/, 'nor with Esc');
assert.match(page, /\$\('requestOriginalsRetry'\)\.addEventListener\('click', sendOriginals\)/, 'a failed upload can be retried');
for (const id of ['requestOriginals', 'requestOriginalsStatus', 'requestOriginalsBar', 'requestOriginalsRetry']) assert.ok(html.includes(`id="${id}"`), id);
assert.ok(layers.includes('layer.original = file;') && layers.includes('original: l.original,'), 'a PDF layer keeps its PDF for the export sources');
assert.match(html, /PDF, PNG, JPG, WebP \(ไม่เกิน 90 MB\)/);

console.log('Large originals test passed');
