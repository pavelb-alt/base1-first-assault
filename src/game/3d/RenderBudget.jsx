import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PERFORMANCE } from '@/game/config';
import { renderQuality, useRenderQuality, dprCeiling } from '@/game/3d/vfx/quality';
import { vfxStats } from '@/game/3d/vfx/stats';

// Frame-time governor. Each quality preset builds a "ladder" of rungs from its
// full look down to its cheapest acceptable form:
//   ceiling dpr → step to 1.0 → drop AO → drop DoF → step to the preset floor.
// The governor samples average fps over PERFORMANCE.governorInterval windows,
// steps down after two slow windows and climbs back only after sustained
// headroom, with exponential back-off so it never oscillates (each pixel-ratio
// change reallocates the HDR targets). Simulation timing is never touched.
function buildLadder(preset) {
  const rungs = [];
  let dpr = dprCeiling(preset);
  const floor = preset.dpr[0];
  rungs.push({ dpr, ao: !!preset.ao, dof: !!preset.dof });
  while (dpr > 1.001) { dpr = Math.max(1, dpr - 0.125); rungs.push({ dpr, ao: !!preset.ao, dof: !!preset.dof }); }
  if (preset.ao) rungs.push({ dpr, ao: false, dof: !!preset.dof });
  if (preset.dof) rungs.push({ dpr, ao: false, dof: false });
  while (dpr - 0.1 >= floor - 0.001) { dpr = Math.round((dpr - 0.1) * 100) / 100; rungs.push({ dpr, ao: false, dof: false }); }
  return rungs;
}

export function RenderBudget() {
  const setDpr = useThree(state => state.setDpr);
  const { level } = useRenderQuality();
  const gov = useRef(null);

  useEffect(() => {
    const preset = renderQuality.get().preset;
    gov.current = { ladder: buildLadder(preset), step: 0, time: 0, frames: 0, slow: 0, fast: 0,
      climbWindows: 4, lastClimb: -1e9, clock: 0, warmup: 2 };
    const rung = gov.current.ladder[0];
    setDpr(rung.dpr);
    vfxStats.dpr = rung.dpr; vfxStats.renderStep = 0;
    renderQuality.setGovernor(rung.ao, rung.dof);
  }, [level, setDpr]);

  useFrame((_, delta) => {
    const g = gov.current;
    if (!g) return;
    // Ignore loading, hidden tabs and single hitches (shader compiles, GC).
    if (!window.game?.ready || document.hidden || delta > 0.25) { g.time = 0; g.frames = 0; return; }
    g.clock += delta; g.time += delta; g.frames++;
    if (g.time < PERFORMANCE.governorInterval) return;
    const fps = g.frames / g.time;
    g.time = 0; g.frames = 0;
    vfxStats.governorFps = Math.round(fps * 10) / 10;
    if (g.warmup > 0) { g.warmup--; return; }
    const target = PERFORMANCE.targetFps;
    if (fps < target - 2) { g.slow++; g.fast = 0; }
    else if (fps > target + PERFORMANCE.governorHeadroom) { g.fast++; g.slow = 0; }
    else { g.slow = 0; g.fast = 0; }
    let next = g.step;
    if (g.slow >= 2 && g.step < g.ladder.length - 1) {
      next = g.step + 1;
      // Dropping right after a climb means the climb was premature: wait longer next time.
      if (g.clock - g.lastClimb < 12) g.climbWindows = Math.min(g.climbWindows * 2, 64);
    } else if (g.fast >= g.climbWindows && g.step > 0) {
      next = g.step - 1; g.lastClimb = g.clock;
    }
    if (next === g.step) return;
    g.slow = 0; g.fast = 0; g.warmup = 1; // let the new configuration settle before judging it
    const from = g.ladder[g.step], rung = g.ladder[next];
    g.step = next;
    if (Math.abs(from.dpr - rung.dpr) > 0.001) setDpr(rung.dpr);
    if (from.ao !== rung.ao || from.dof !== rung.dof) renderQuality.setGovernor(rung.ao, rung.dof);
    vfxStats.dpr = rung.dpr; vfxStats.renderStep = next;
  });
  return null;
}
