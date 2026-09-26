import assert from 'node:assert/strict';
import { handlePrintRequest, printRequestBrief } from './routes/print-requests.js';
import { validatePrintRequest, lineRequestUrl, artworkFilename, MAX_REQUEST_BYTES } from '../shared/print-request.js';

const value = { key: '12345678-1234-1234-1234-123456789012', name: 'ลูกค้าทดสอบ', phone: '0812345678', lineId: 'test', quantity: 500, spec: { kind: 'rounded', width: 90, height: 54, radius: 3, bleed: 3, paper: 'smooth', coating: 'matte', finish: 'goldFoil' } };
const env = { PUBLIC_ORDER_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'secret', NOTION_TICKETS_DATA_SOURCE_ID: 'tickets' };
const pdfText = '%PDF-1.7\nArtwork test fixture\n%%EOF';
const svgText = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>';
const request = ({ data = value, pdf = pdfText, svg = svgText, backPdf = pdfText, backSvg = svgText, token = 'verified', origin = 'https://iprint.tchl.online' } = {}) => {
  const form = new FormData();
  form.set('request', JSON.stringify(data)); form.set('turnstileToken', token);
  if (pdf !== null) form.set('artworkPdf', new Blob([pdf], { type: 'application/pdf' }), 'artwork.pdf');
  if (data.version === 2 && svg !== null) form.set('artworkSvg', new Blob([svg], {type:'image/svg+xml'}), 'ignored.svg');
  if (data.hasBack && backPdf !== null) form.set('backArtworkPdf', new Blob([backPdf], {type:'application/pdf'}), 'ignored.pdf');
  if (data.hasBack && backSvg !== null) form.set('backArtworkSvg', new Blob([backSvg], {type:'image/svg+xml'}), 'ignored.svg');
  return new Request('https://worker.test/public/print-requests', { method: 'POST', body: form, headers: { Origin: origin } });
};
const json = (body, status = 200) => Response.json(body, { status });
let writes, uploads, filenames, calls, stored, deny = false, failUpload = false;
const reset = () => { writes = []; uploads = []; filenames = []; calls = []; stored = null; deny = false; failUpload = false; };
reset();
async function fetchImpl(url, options) {
  calls.push(url);
  if (url.includes('siteverify')) return Response.json({ success: !deny, action: 'create_order', hostname: 'iprint.tchl.online' });
  if (url.endsWith('/data_sources/tickets')) return Response.json({ properties: { Name: { type: 'title' }, 'Order Key': { type: 'rich_text' }, 'จำนวนรวม': { type: 'number' } } });
  if (url.endsWith('/query')) return Response.json({ results: stored ? [stored] : [] });
  if (url.endsWith('/file_uploads')) {
    const body = JSON.parse(options.body);
    assert.ok(['application/pdf','image/svg+xml'].includes(body.content_type));
    filenames.push(body.filename);
    return Response.json({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
  }
  if (url.endsWith('/send')) {
    if (failUpload) return new Response('private upstream error', { status: 502 });
    uploads.push(await options.body.get('file').text());
    assert.equal(options.headers['Content-Type'], undefined);
    return Response.json({ status: 'uploaded' });
  }
  if (url.endsWith('/pages')) {
    writes.push(JSON.parse(options.body));
    stored = { id: 'ticket-id', url: 'https://notion.so/private' };
    return Response.json(stored);
  }
  throw new Error(`Unexpected ${url}`);
}
const run = (req = request(), overrides = {}) => handlePrintRequest({ request: req, env, json, notionHeaders: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, fetchImpl, ...overrides });

assert.deepEqual(validatePrintRequest(value), []);
assert.ok(validatePrintRequest({ ...value, quantity: 0 }).length);
assert.ok(validatePrintRequest({ ...value, spec: { ...value.spec, paper: '__proto__' } }).length);
assert.ok(lineRequestUrl('ticket', 'summary').includes('%40683amlxt'), 'configured shop receives the message');
assert.equal(lineRequestUrl('ticket', 'summary', ''), '', 'missing recipient is disabled');
assert.match(lineRequestUrl('ticket', 'summary', '@shop'), /^https:\/\/line.me\/R\/oaMessage\/%40shop/);
assert.equal(printRequestBrief(value).fields.material.status, 'need_confirmation');

for (const [req, status] of [[request({ origin: 'https://evil.example' }), 403], [request({ data: { ...value, quantity: -1 } }), 400], [request({ pdf: null }), 400], [request({ pdf: '<svg>not a PDF</svg>' }), 415], [request({ token: '' }), 400]]) {
  reset(); assert.equal((await run(req)).status, status); assert.equal(writes.length, 0); assert.equal(uploads.length, 0);
}
reset(); deny = true;
assert.equal((await run()).status, 403); assert.equal(calls.length, 1);
reset(); failUpload = true;
const failed = await run(); assert.equal(failed.status, 502); assert.equal(writes.length, 0);
assert.doesNotMatch(await failed.text(), /private upstream/);
reset();
const response = await run(); assert.equal(response.status, 200);
const result = await response.json(); assert.equal(result.id, 'ticket-id'); assert.equal(result.url, undefined);
assert.deepEqual(uploads, [pdfText], 'the uploaded PDF is the exact exported file');
assert.equal(writes.length, 1);
assert.equal(writes[0].properties['จำนวนรวม'].number, 500);
const blocks = writes[0].children;
assert.equal(blocks.at(-1).type, 'file');
assert.equal(blocks.at(-1).file.file_upload.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
assert.match(JSON.stringify(blocks), /บรีฟนามบัตรจากหน้า 3D/);
assert.match(JSON.stringify(blocks), /0812345678/);
assert.match(JSON.stringify(blocks), /Gold Foil/);
assert.doesNotMatch(JSON.stringify(blocks), /เจ้าของร้านตรวจและยืนยันข้อมูลแล้ว/);
const retry = await run(); assert.equal((await retry.json()).deduplicated, true);
assert.equal(writes.length, 1); assert.equal(uploads.length, 1, 'retry does not upload another PDF');
const duplex = {...value, version:2, name:'Bdms', jobName:'Essential-Pack', materialName:'Art300g', quantity:100, hasBack:true};
assert.equal(artworkFilename(duplex,'pdf'), '(Bdms)Essential-Pack-(9x5.4cm)Art300g-(100piece)-front.pdf');
assert.doesNotMatch(artworkFilename({...duplex,name:'../Bad\\Name:*?'} ,'svg'), /[\\/:*?]/);
for (const options of [{svg:null}, {backSvg:null}, {backPdf:null}, {svg:'<svg><script>alert(1)</script></svg>'}, {data:{...duplex,jobName:''}}, {data:{...duplex,hasBack:'yes'}}]) {
  reset(); const res = await run(request({data:duplex,...options})); assert.ok([400,415].includes(res.status)); assert.equal(writes.length,0); assert.equal(uploads.length,0);
}
reset();
assert.equal((await run(request({data:duplex}))).status,200);
assert.deepEqual(uploads,[pdfText,svgText,pdfText,svgText]);
assert.deepEqual(filenames,['front.pdf','front.svg','back.pdf','back.svg'].map(suffix=>`(Bdms)Essential-Pack-(9x5.4cm)Art300g-(100piece)-${suffix}`));
assert.equal(writes[0].children.filter(block=>block.type==='file').length,4);
assert.match(JSON.stringify(writes[0].children),/พิมพ์หน้า–หลัง/);
assert.doesNotMatch(JSON.stringify(writes[0].children),/Confirmed|Need confirmation/);
assert.equal((await (await run(request({data:duplex}))).json()).deduplicated,true);
assert.equal(uploads.length,4);
reset();
assert.equal((await run(request({data:{...duplex,hasBack:false}}))).status,200);
assert.equal(uploads.length,2);
reset();
const oversized=request({data:duplex}); oversized.headers.set('Content-Length',String(MAX_REQUEST_BYTES+1));
assert.equal((await run(oversized)).status,413); assert.equal(calls.length,0);
console.log('Print requests: validation, bot protection, brief + PDF, failure recovery and sequential retry passed');
