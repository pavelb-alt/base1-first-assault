// One shared requestAnimationFrame loop for every combat overlay. Callbacks get
// (dt seconds, now ms). dt is 0 while the game is paused so animations freeze.
import { gameState } from '@/game/3d/world';

const fns = new Set();
let raf = 0;
let last = 0;

function frame(now) {
  raf = fns.size ? requestAnimationFrame(frame) : 0;
  const dt = gameState.paused ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  for (const fn of fns) {
    try { fn(dt, now); } catch (err) { console.error('[combat-feedback] tick failed', err); }
  }
}

export function addTicker(fn) {
  fns.add(fn);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  return () => {
    fns.delete(fn);
    if (!fns.size && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
}
