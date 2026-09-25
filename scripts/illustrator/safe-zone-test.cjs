const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const inset = 3 * 72 / 25.4;
const source = name => fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/^#target.*$/m, '');
function object(b) {
  return { typename: 'PathItem', editable: true, visibleBounds: b.slice(),
    translate(x,y) { this.visibleBounds = this.visibleBounds.map((v,i) => v + (i % 2 ? y : x)); } };
}
function move(items, r = [0,100,100,0]) {
  const alerts = [];
  const app = { documents: [1], coordinateSystem: 'original', redraw() {}, activeDocument: {
    selection: items, artboards: Object.assign([{artboardRect:r}], {getActiveArtboardIndex: () => 0}) } };
  vm.runInNewContext(source('02_MoveToNearestSafeZone.jsx'), {app, alert: x => alerts.push(x), CoordinateSystem: {DOCUMENTCOORDINATESYSTEM: 1}});
  assert.equal(app.coordinateSystem, 'original');
  return alerts;
}
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
let a = object([12,60,22,50]); assert.equal(move([a]).length,0); near(a.visibleBounds[0],inset);
a = object([80,60,90,50]); move([a]); near(a.visibleBounds[2],100-inset);
a = object([40,90,50,80]); move([a]); near(a.visibleBounds[1],100-inset);
a = object([40,20,50,10]); move([a]); near(a.visibleBounds[3],inset);
a = object([-20,120,-10,110]); move([a]); near(a.visibleBounds[0],inset); near(a.visibleBounds[1],100-inset);
a = object([12,60,22,50]); let b = object([24,60,34,50]); move([a,b]); near(b.visibleBounds[0]-a.visibleBounds[0],12);
a = object([0,100,100,0]); assert.equal(move([a]).length,1); assert.deepEqual(a.visibleBounds,[0,100,100,0]);
a = object([inset,60,inset+10,50]); const before = a.visibleBounds.slice(); move([a]); assert.deepEqual(a.visibleBounds,before);
a = object([212,-140,222,-150]); move([a],[200,-100,300,-200]); near(a.visibleBounds[0],200+inset);
a = object([12,60,22,50]); b = object([24,60,34,50]); b.translate = () => {throw Error('locked during move');};
assert.equal(move([a,b]).length,1); assert.deepEqual(a.visibleBounds,[12,60,22,50]);
// Execute the actual guide script twice: 3 mm inset and no duplicate guide.
const paths = [];
paths.add = () => {const p = {setEntirePath(points) {this.points=points;}}; paths.push(p); return p;};
const layers = []; layers.add = () => {const l={pathItems:paths}; layers.push(l); return l;};
const originalLayer = {};
const app = {documents:[1], coordinateSystem:'original', redraw(){}, activeDocument:{layers, activeLayer:originalLayer,
  artboards:Object.assign([{artboardRect:[200,-100,300,-200]}],{getActiveArtboardIndex:()=>0})}};
for (let i=0;i<2;i++) vm.runInNewContext(source('01_CreateSafeZone3mm.jsx'), {
  app, alert: message => {throw Error(message);}, CoordinateSystem:{DOCUMENTCOORDINATESYSTEM:1}});
assert.equal(paths.length,1); assert.equal(paths[0].guides,true); assert.equal(layers[0].locked,true);
assert.equal(layers[0].printable,false); near(paths[0].points[0][0],200+inset); near(paths[0].points[0][1],-100-inset);
near(paths[0].points[2][0],300-inset); near(paths[0].points[2][1],-200+inset);
assert.equal(app.coordinateSystem,'original'); assert.equal(app.activeDocument.activeLayer,originalLayer);
console.log('PASS: four edges, outside corner, multi-selection, oversize, repeat, shifted artboard, rollback, guide inset and update.');
