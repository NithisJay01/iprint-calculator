import assert from 'node:assert/strict';
import { NotionPricingSettingsRepository } from '../worker/repositories/notion-pricing-settings-repository.js';
import { newProduct } from '../shared/product-pricing.js';
import worker from '../worker/index.js';
let schema={Name:{type:'title'},Active:{type:'checkbox'},Type:{type:'select'}}, page=null;
const fetcher=async(url,options={})=>{
  const method=options.method||'GET';
  if(url.endsWith('/data_sources/presets') && method==='GET')return Response.json({properties:schema});
  if(url.endsWith('/data_sources/presets') && method==='PATCH'){schema={...schema,'Pricing Rules':{type:'rich_text'}};return Response.json({properties:schema})}
  if(url.endsWith('/query')){assert.equal(JSON.parse(options.body).filter.title.equals,'__IPRINT_PRICING_SETTINGS__');return Response.json({results:page?[page]:[]})}
  if(url.endsWith('/pages') && method==='POST'){page={id:'saved',properties:JSON.parse(options.body).properties};return Response.json(page)}
  if(url.endsWith('/pages/saved') && method==='PATCH'){page.properties={...page.properties,...JSON.parse(options.body).properties};return Response.json(page)}
  throw new Error(`Unexpected ${url}`);
};
const repository=new NotionPricingSettingsRepository({fetcher,headers:{},dataSourceId:'presets'});
assert.deepEqual((await repository.get()).products,[]);
const saved=await repository.save({products:[newProduct()]});
assert.ok(saved.version);assert.deepEqual(await repository.get(),saved);
const updated=await repository.save({...saved,products:[{...saved.products[0],markup:40}]});
assert.notEqual(updated.version,saved.version);assert.equal((await repository.get()).products[0].markup,40);
await assert.rejects(()=>repository.save({products:[{...newProduct(),rounding:0}]}));
const env={NOTION_TOKEN:'test',NOTION_DATA_SOURCE_ID:'presets',NOTION_MATERIALS_DATA_SOURCE_ID:'m',NOTION_SERVICES_DATA_SOURCE_ID:'s',NOTION_CUSTOMERS_DATA_SOURCE_ID:'c',NOTION_QUOTES_DATA_SOURCE_ID:'q',NOTION_ORDER_ITEMS_DATA_SOURCE_ID:'i',WRITE_API_KEY:'test-key'};
const denied=await worker.fetch(new Request('https://test/staff/pricing-settings',{method:'PUT',body:'{}'}),env);
assert.equal(denied.status,401);
const original=globalThis.fetch;
try{
  globalThis.fetch=fetcher;
  const response=await worker.fetch(new Request('https://test/pricing-settings'),env);assert.equal(response.status,200);assert.deepEqual((await response.json()).settings,updated);
  const bad=await worker.fetch(new Request('https://test/staff/pricing-settings',{method:'PUT',headers:{'X-API-Key':'test-key'},body:'{"products":null}'}),env);assert.equal(bad.status,400);
}finally{globalThis.fetch=original}
console.log('Pricing settings persistence, versioning, validation and authorization passed');
