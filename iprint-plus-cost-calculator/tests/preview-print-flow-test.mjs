import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the real UI controller with small DOM/service doubles; no live customer data or Notion writes.
class Element {
  constructor() { this.style = {}; this.children = []; this.value = ''; this.hidden = false; this.open = false; this.checked = false; this.events = {}; this.classList = { contains: () => true }; }
  addEventListener(name, handler) { (this.events[name] ||= []).push(handler); }
  async emit(name) { for (const handler of this.events[name] || []) await handler({ preventDefault() {} }); }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit('close'); }
  reportValidity() { return true; }
  replaceChildren(...items) { this.children = items; }
  append(item) { this.children.push(item); }
}
const elements = new Map();
const el = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
globalThis.document = { getElementById: el, createElement: () => new Element() };
let verification;
globalThis.window = { turnstile: { render: (_, options) => { verification = options; options.callback('verified'); return 1; }, reset: () => { verification.callback('verified'); } } };
globalThis.Option = class {};
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const pricingStub = dataModule(`export const LOCAL=false, API_ROOT='https://api.test'; export async function loadPricing(){return {products:[]}}; export async function loadCatalog(){return {materials:[],services:[]}}`);
const pdfStub = dataModule(`export async function exportFile(kind, sources, options) { globalThis.exported.push({kind,sources,options}); await globalThis.exportGate; return {blob:new Blob([kind === 'pdf' ? '%PDF-test' : '<svg></svg>'],{type:kind === 'pdf' ? 'application/pdf' : 'image/svg+xml'}),filename:'design.pdf',pdf:{pages:2,layers:['Artwork','Dieline','Foil_Gold']},plan:{checks:[{level:'warn',text:'Bleed warning'}]}} }`);
globalThis.exported = [];
globalThis.exportGate = Promise.resolve();
let source = readFileSync(new URL('../material-preview/request-print.js', import.meta.url), 'utf8');
source = source.replace('../shared/pricing-client.js', pricingStub).replace('../business-card/product.js', new URL('../business-card/product.js', import.meta.url).href).replace('../shared/print-request.js', new URL('../shared/print-request.js', import.meta.url).href).replace('./exportFiles.js', pdfStub).replace('./artwork-bundle.js', new URL('../material-preview/artwork-bundle.js', import.meta.url).href);
const { initPrintRequest } = await import(dataModule(source));
const sources = { params: {kind:'rect',width:90,height:54,radius:3,bleed:3}, spec: {}, art:null, mask:null };
const card = { spec:{bounds:{w:90,h:54}} };
const panel = {state:{paper:'smooth',coating:'matte',finish:'none'}};
initPrintRequest({card,panel,layers:{exportSources:()=>sources}});
el('requestQuantity').value='500'; el('requestName').value='ทดสอบ'; el('requestPhone').value='0812345678';
el('exportJobName').value='Essential-Pack'; el('exportMaterialName').value='Art300g';
el('exportColor').value='rgb'; el('exportJob').checked=true;

await el('requestPrint').emit('click');
assert.equal(el('printRequestDialog').open,false);
assert.match(el('status').textContent,/ขั้น 1 แบบของคุณ/);
sources.art={file:new File(['art'], 'original.svg')}; panel.state.finish='goldFoil';
await el('requestPrint').emit('click'); assert.match(el('status').textContent,/ขั้น 4 เทคนิคพิเศษ/);
sources.mask={file:new File(['mask'],'finish.svg'),invert:false};
await el('requestPrint').emit('click');
assert.equal(el('requestConsent').checked,false);
assert.equal(el('printRequestDialog').open,true); assert.equal(el('requestSubmit').disabled,false);
assert.equal(exported.length,2); assert.equal(exported[0].kind,'pdf'); assert.equal(exported[0].sources.finishId,'goldFoil');
assert.equal(exported[0].options.jobPage,true); assert.match(el('requestPdfWarnings').textContent,/Bleed/);
assert.match(el('requestSubmit').textContent,/สอบถามราคา/);

let sent = [], failed = true;
globalThis.fetch = async (url, options) => {
  sent.push({url,form:options.body});
  return failed ? Response.json({error:'temporary failure'},{status:502}) : Response.json({id:'ticket-123'});
};
await el('printRequestForm').emit('submit');
assert.equal(sent.length,1); assert.match(el('requestStatus').textContent,/temporary failure/);
assert.equal(el('printRequestForm').hidden,false);
assert.equal(sent[0].form.get('artwork'),null,'originals are not sent');
assert.equal(await sent[0].form.get('artworkPdf').text(),'%PDF-test');
assert.equal(await sent[0].form.get('artworkSvg').text(),'<svg></svg>');
assert.equal(sent[0].form.get('artworkSvg').name, '(ทดสอบ)Essential-Pack-(9x5.4cm)Art300g-(500piece)-front.svg');
const firstKey=JSON.parse(sent[0].form.get('request')).key;
verification.callback('fresh-token'); failed=false;
await el('printRequestForm').emit('submit');
assert.equal(JSON.parse(sent[1].form.get('request')).key,firstKey,'retry uses the same key');
assert.equal(el('requestTicket').textContent,'ticket-123'); assert.equal(el('requestLine').hidden,true);
assert.equal(el('requestSuccess').hidden,false);

await el('requestClose').emit('click');
let release;
globalThis.exportGate=new Promise(resolve=>{release=resolve;});
const opening=el('requestPrint').emit('click');
await new Promise(resolve=>setTimeout(resolve,0));
await el('requestClose').emit('click'); release(); await opening;
assert.equal(el('printRequestDialog').open,false);
assert.equal(el('requestPdfDownload').hidden,true,'a late export cannot update a closed dialog');
// A newly attached back must invalidate the snapshot and send four distinct files.
sources.spec = { frame:{cx:0,cy:0,w:96,h:60}, rings:[[{x:-45,y:-27},{x:45,y:-27},{x:45,y:27}]] };
sources.backArt = {file:new File(['back'], 'back.svg')};
globalThis.exportGate = Promise.resolve();
await el('requestPrint').emit('click');
assert.equal(el('requestArtworkDownloads').children.length,4);
const backExport = exported.at(-1);
assert.equal(backExport.sources.art, sources.backArt);
assert.equal(backExport.sources.mask,null);
assert.equal(backExport.sources.finishId,'none');
assert.equal(backExport.sources.spec.rings[0][0].x,-sources.spec.rings[0].at(-1).x,'back die-cut is mirrored when turning the card over');
assert.equal(sources.spec.rings[0][0].x,-45,'front die-cut is unchanged');
verification.callback('fresh-token');
await el('printRequestForm').emit('submit');
assert.equal(sent.at(-1).form.get('backArtworkSvg').name,'(ทดสอบ)Essential-Pack-(9x5.4cm)Art300g-(500piece)-back.svg');
assert.equal(JSON.parse(sent.at(-1).form.get('request')).hasBack,true);
assert.notEqual(JSON.parse(sent.at(-1).form.get('request')).key,firstKey);
console.log('Preview print flow: artwork gates, PDF snapshot, consent, failed submit, retry and close/export race passed');
