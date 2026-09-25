// Showroom styling only; customers can still choose these pairs in the editor.
export const isAllowedShowroomPreset = ({ paper, finish }) =>
  paper !== 'kraft' || !['goldFoil', 'silverFoil'].includes(finish);

export const SHOWROOM_PRESETS = Object.freeze([
  { paper: 'smooth', coating: 'matte', finish: 'goldFoil' },
  { paper: 'uncoated', coating: 'none', finish: 'spotUV' },
  { paper: 'cotton', coating: 'none', finish: 'emboss' },
  { paper: 'kraft', coating: 'none', finish: 'emboss' },
  { paper: 'smooth', coating: 'gloss', finish: 'deboss' },
  { paper: 'cotton', coating: 'none', finish: 'silverFoil' },
].filter(isAllowedShowroomPreset));

// Count visible time, and never overlap asynchronous texture/shader changes.
// The caller applies preset 0 before starting the clock.
export function createShowroomCycle(apply, onError = console.warn) {
  let index = 0, elapsed = 0, last = null, changing = false;
  return {
    get changing() { return changing; },
    pause() { last = null; },
    tick(now, active) {
      if (!active || changing) { last = null; return; }
      if (last !== null) elapsed += Math.max(0, now - last);
      last = now;
      if (elapsed < 8000) return;
      elapsed = 0;
      last = null;
      changing = true;
      const next = (index + 1) % SHOWROOM_PRESETS.length;
      return Promise.resolve().then(() => apply(SHOWROOM_PRESETS[next])).then(() => {
        index = next;
      }).catch(onError).finally(() => { changing = false; last = null; });
    },
  };
}
