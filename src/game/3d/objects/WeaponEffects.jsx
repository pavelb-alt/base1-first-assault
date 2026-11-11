import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { combat } from '@/game/3d/combat';
import { gameState } from '@/game/3d/world';
import { gameEvents } from '@/game/gameEvents';
import { impact, muzzleFlash } from '@/game/3d/vfx/effects';

const HEAVY = new Set(['tank', 'artillery', 'tower-cannon']);
// Artillery announces its shot before queueing the muzzle effect; remember it.
const pendingHeavy = { active: false, x: 0, y: 0, z: 0 };

// Drains combat.muzzleEffects / combat.impactEffects (gameplay-owned queues)
// into pooled GPU particles. The matching 'shot'/'impact' gameEvents are emitted
// synchronously right after each push, so listeners tag the newest queue entry
// with presentation info (shooter kind, player, cover/unit hit) — read-only for
// gameplay, which never looks at these extra fields.
export function WeaponEffects() {
  useEffect(() => {
    const onShot = e => {
      const last = combat.muzzleEffects[combat.muzzleEffects.length - 1];
      if (last && last.vfxKind === undefined) { last.vfxKind = e.kind; last.vfxPlayer = !!e.player; }
    };
    const onArtillery = e => { pendingHeavy.active = true; pendingHeavy.x = e.x; pendingHeavy.y = e.y; pendingHeavy.z = e.z; };
    const onImpact = e => {
      const last = combat.impactEffects[combat.impactEffects.length - 1];
      if (last && last.vfxCover === undefined && last.position[0] === e.x && last.position[2] === e.z) {
        last.vfxCover = !!e.cover; last.vfxTarget = e.team === 'friendly' ? 'enemy' : 'friendly';
      }
    };
    const offs = [gameEvents.on('shot', onShot), gameEvents.on('artillery-fire', onArtillery), gameEvents.on('impact', onImpact)];
    return () => { for (const off of offs) off(); };
  }, []);

  useFrame(() => {
    if (gameState.paused) return;
    for (const effect of combat.muzzleEffects) {
      const pos = effect.position, dir = effect.direction, x = pos[0], z = pos[2];
      let heavy = HEAVY.has(effect.vfxKind);
      if (pendingHeavy.active && Math.abs(x - pendingHeavy.x) + Math.abs(z - pendingHeavy.z) < 3) { heavy = true; pendingHeavy.active = false; }
      muzzleFlash(x, pos[1], z, dir[0], dir[1], dir[2], heavy, !!effect.vfxPlayer, effect.vfxKind === 'tower-frost');
    }
    combat.muzzleEffects.length = 0;
    pendingHeavy.active = false;
    for (const effect of combat.impactEffects) {
      const pos = effect.position, dir = effect.direction;
      // Untagged entries (no event listener matched) default to a unit hit.
      impact(pos[0], pos[1], pos[2], dir[0], dir[1], dir[2], !!effect.vfxCover, effect.vfxTarget ?? 'enemy');
    }
    combat.impactEffects.length = 0;
  });

  return null;
}
