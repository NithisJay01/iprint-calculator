import assert from 'node:assert/strict';
import { NotionCatalogRepository } from '../worker/repositories/notion-catalog-repository.js';
import { resolveMaterial, loadMaterials, applyOpticalParams } from '../material-preview/material-catalog.js';
import { paperMaterials } from '../material-preview/materials.js';
import { MeshPhysicalMaterial } from '../material-preview/vendor/three/three.module.min.js';

const page = {id:'stable-record', properties:{
  Name:{title:[{plain_text:'ชื่อสินค้าอะไรก็ได้'}]}, Material:{select:{name:'Art Paper'}},
  Active:{checkbox:true}, 'Preview Renderer':{select:{name:'webgl'}},
  '3D Material Key':{select:{name:'coated'}}, 'Spec Value':{number:250}, 'Spec Unit':{select:{name:'gsm'}},
}};
const repository = new NotionCatalogRepository({materialDataSourceId:'stock', fetcher:async()=>Response.json({results:[page]})});
const api = async (_url, options) => {
  assert.equal(options.cache,'no-store');
  return Response.json({success:true,materials:await repository.list('material')});
};
const material = new MeshPhysicalMaterial();
for (const key of ['coated','pet_translucent','smooth','pet_matte_white','kraft']) {
  page.properties['3D Material Key'].select.name=key;
  const [record]=await loadMaterials('https://api.example',api);
  assert.equal(record.id,'stable-record');
  assert.equal(record.material,'Art Paper');
  assert.equal(record.specValue,250);
  assert.equal(resolveMaterial(record).key,key,'same record/category, changed Notion key drives shader');
  applyOpticalParams(material,paperMaterials[resolveMaterial(record).key]);
  assert.equal(material.transmission,key==='pet_translucent'?0.92:0);
  assert.equal(material.opacity,1);
  assert.equal(material.transparent,false);
}
for (const key of ['',null,'unknown','constructor','__proto__']) {
  assert.deepEqual(resolveMaterial({material3dKey:key,previewRenderer:'webgl'}),{key:'smooth',fallback:true});
}
for (const name of ['PVC Card','Sticker Paper','Sticker PP','Sticker PVC']) {
  const before={name,material:name,active:true,previewRenderer:'css',shaderPreset:'texture'};
  const copy=structuredClone(before);
  assert.equal(resolveMaterial(before).fallback,true);
  assert.deepEqual(before,copy);
}
const pet=paperMaterials.pet_translucent;
assert.ok(pet.roughness>0.3 && pet.transmission>0.8);
assert.ok(paperMaterials.pet_matte_white.ior>1.5,'plastic Fresnel response exceeds default paper IOR');
await assert.rejects(loadMaterials('https://api.example',async()=>Response.json({}, {status:503})));
await assert.rejects(loadMaterials('https://api.example',async()=>Response.json({materials:null})));
assert.deepEqual(await loadMaterials('https://api.example',async()=>Response.json({materials:[{id:'a',name:'inactive',active:false}]})),[]);
console.log('Material sync: repository → API → key → Three.js, fallback, legacy isolation and errors passed');
