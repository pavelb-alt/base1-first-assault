import { useSyncExternalStore } from 'react';
import { settings } from '@/game/settings';
import { PERFORMANCE, QUALITY_PRESETS } from '@/game/config';
import { vfxStats } from '@/game/3d/vfx/stats';

// Live render-quality state derived from settings.quality / settings.postProcessing
// plus the adaptive governor (RenderBudget). Visual only: simulation never reads it.
// Everything here switches live — the Canvas is never remounted.
export const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultra'];
export function presetFor(level) { return QUALITY_PRESETS[level] ?? QUALITY_PRESETS.high; }

const governor = { suspendAO: false, suspendDoF: false };
let snapshot = build(settings.get());
const listeners = new Set();

function build(s) {
  const level = QUALITY_PRESETS[s.quality] ? s.quality : 'high';
  const preset = presetFor(level);
  return {
    level, preset,
    postProcessing: s.postProcessing !== false,
    ao: !!preset.ao && !governor.suspendAO,
    dof: !!preset.dof && !governor.suspendDoF,
  };
}

// Preset fields that existing per-frame readers of PERFORMANCE pick up live
// (unit shadow distance, animation cadence, particle budgets, light pool).
function applyPerformance(preset) {
  PERFORMANCE.minDpr = preset.dpr[0];
  PERFORMANCE.maxDpr = preset.dpr[1];
  PERFORMANCE.targetFps = preset.targetFps;
  PERFORMANCE.unitShadowDistance = preset.unitShadowDistance;
  PERFORMANCE.ambientParticleScale = preset.ambientParticleScale;
  PERFORMANCE.vfxParticleScale = preset.vfxParticleScale;
  PERFORMANCE.dynamicLights = preset.dynamicLights;
  PERFORMANCE.farAnimationHz = preset.farAnimationHz;
}

function publish(next) {
  const prev = snapshot;
  if (prev.level === next.level && prev.postProcessing === next.postProcessing && prev.ao === next.ao && prev.dof === next.dof) return;
  snapshot = next;
  applyPerformance(next.preset);
  vfxStats.quality = next.level; vfxStats.postProcessing = next.postProcessing; vfxStats.ao = next.ao; vfxStats.dof = next.dof;
  for (const fn of listeners) fn(snapshot);
}

applyPerformance(snapshot.preset);
vfxStats.quality = snapshot.level; vfxStats.postProcessing = snapshot.postProcessing; vfxStats.ao = snapshot.ao; vfxStats.dof = snapshot.dof;
settings.subscribe(s => {
  // A deliberate preset change resets any governor degradation.
  if (s.quality !== snapshot.level) { governor.suspendAO = false; governor.suspendDoF = false; }
  publish(build(s));
});

export const renderQuality = {
  get: () => snapshot,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  setGovernor(ao, dof) {
    governor.suspendAO = !ao; governor.suspendDoF = !dof;
    publish(build(settings.get()));
  },
};

export function useRenderQuality() {
  return useSyncExternalStore(renderQuality.subscribe, renderQuality.get, renderQuality.get);
}

// Highest pixel ratio the preset allows on this display.
export function dprCeiling(preset) {
  const device = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.max(preset.dpr[0], Math.min(device, preset.dpr[1]));
}
