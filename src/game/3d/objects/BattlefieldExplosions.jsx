import { gameEvents } from '@/game/gameEvents';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { dressingNoise } from '@/game/3d/dressing/groundAppearance';
import { terrainHeight } from '@/game/3d/terrain';
import { EXPLOSIONS as E } from '@/game/config';
import { explosion } from '@/game/3d/vfx/effects';
import { vfxStats } from '@/game/3d/vfx/stats';

// window.game.getVisualEffects() reads this object (shared with the VFX system).
export const explosionVisuals = vfxStats;
// Gameplay blasts (artillery shells) queue [x, z, power]; drained each frame.
export const explosionRequests = [];

// Ambient shellfire across no-man's-land plus the artillery impact queue. The
// visuals themselves (fireball → smoke column, shockwave, sparks, debris,
// scorch decal, light flash) are pooled GPU particles in src/game/3d/vfx.
export function BattlefieldExplosions() {
  const pool = useRef({ timer: E.minInterval, noise: 80000 });
  // Independent indexed visual noise keeps ambient timing out of combat RNG.
  const noise = () => dressingNoise(pool.current.noise++);
  useEffect(() => {
    const reset = () => {
      pool.current.timer = E.minInterval; pool.current.noise = 80000; explosionRequests.length = 0;
      Object.assign(vfxStats, { bursts: 0, smoke: 0, fire: 0, debris: 0, setPieces: 0, impacts: 0, muzzleFlashes: 0, alienBursts: 0 });
    };
    reset(); EventBus.on('reset-game', reset);
    return () => EventBus.off('reset-game', reset);
  }, []);

  const burst = (x, z, power, style) => {
    const y = terrainHeight(x, z) + 0.25;
    explosion(x, z, power, style);
    EventBus.emit('battlefield-explosion', { position: [x, y, z] });
    if (style === 'ambient') gameEvents.emit('explosion', { x, y, z, size: 1, kind: 'ambient' });
  };
  useFrame((_, delta) => {
    if (gameState.paused) return;
    const p = pool.current;
    p.timer -= Math.min(delta, 0.08);
    if (p.timer <= 0) {
      p.timer = E.minInterval + noise() * (E.maxInterval - E.minInterval);
      burst((noise() * 2 - 1) * E.areaX, E.areaZMin + noise() * (E.areaZMax - E.areaZMin), 0.8 + noise() * 0.6, 'ambient');
    }
    while (explosionRequests.length) { const [x, z, power] = explosionRequests.shift(); burst(x, z, power, 'shell'); }
  });
  return null;
}
