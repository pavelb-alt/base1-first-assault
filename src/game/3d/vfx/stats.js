// Shared visual-effects counters. Exposed through window.game.getVisualEffects()
// (BattlefieldExplosions re-exports this object as `explosionVisuals`).
export const vfxStats = {
  bursts: 0, smoke: 0, fire: 0, debris: 0,
  setPieces: 0, impacts: 0, muzzleFlashes: 0, alienBursts: 0,
  particles: 0, emissive: 0, volume: 0, ground: 0, lights: 0, burners: 0,
  quality: 'high', postProcessing: true, ao: false, dof: false,
  dpr: 1, renderStep: 0, governorFps: 0,
};
