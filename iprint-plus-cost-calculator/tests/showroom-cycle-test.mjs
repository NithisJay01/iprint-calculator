import assert from 'node:assert/strict';
import { SHOWROOM_PRESETS, createShowroomCycle, isAllowedShowroomPreset } from '../business-card/showroom-cycle.js';
import { paperMaterials, coatings, finishes } from '../material-preview/materials.js';

for (const finish of ['goldFoil', 'silverFoil']) {
  assert.equal(isAllowedShowroomPreset({ paper: 'kraft', finish }), false);
  assert.equal(isAllowedShowroomPreset({ paper: 'cotton', finish }), true);
  assert.ok(SHOWROOM_PRESETS.some(preset => preset.finish === finish), 'both foils remain in the showcase on other papers');
}
assert.equal(isAllowedShowroomPreset({ paper: 'kraft', finish: 'emboss' }), true);
assert.ok(SHOWROOM_PRESETS.some(preset => preset.paper === 'kraft'), 'Kraft remains in the showcase');

for (const preset of SHOWROOM_PRESETS) {
  assert.ok(paperMaterials[preset.paper] && coatings[preset.coating] && finishes[preset.finish]);
  assert.ok(isAllowedShowroomPreset(preset));
}
const applied = [];
let release;
const cycle = createShowroomCycle(preset => { applied.push(preset); return new Promise(resolve => { release = resolve; }); });
cycle.tick(0, true);
cycle.tick(7999, true);
assert.equal(applied.length, 0);
const first = cycle.tick(8000, true);
await Promise.resolve();
assert.deepEqual(applied, [SHOWROOM_PRESETS[1]]);
cycle.tick(10000, true);
assert.equal(applied.length, 1, 'no overlapping shader changes');
release(); await first;
cycle.tick(11000, true); cycle.tick(12000, true);
cycle.tick(13000, false); cycle.tick(80000, false);
cycle.tick(90000, true); cycle.tick(96999, true);
assert.equal(applied.length, 1, 'hidden time is not counted');
const second = cycle.tick(97000, true); await Promise.resolve(); release(); await second;
assert.equal(applied[1], SHOWROOM_PRESETS[2]);
let now = 100000;
for (let n = 0; n < SHOWROOM_PRESETS.length - 2; n++) {
  cycle.tick(now, true); const pending = cycle.tick(now + 8000, true);
  await Promise.resolve(); release(); await pending; now += 9000;
}
assert.equal(applied.at(-1), SHOWROOM_PRESETS[0], 'the sequence loops');
let errors = 0;
const failing = createShowroomCycle(() => { throw new Error('texture failure'); }, () => { errors++; });
failing.tick(0, true); await failing.tick(8000, true);
assert.equal(errors, 1); assert.equal(failing.changing, false);
console.log('Showroom cycle: 8-second timing, visible time, serialized updates, looping and error recovery passed');
