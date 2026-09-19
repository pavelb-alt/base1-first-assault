import { BALANCE } from '@/game/config';
import { battle } from '@/game/3d/battleMetrics';
import { visitNearby } from '@/game/3d/spatial';

// Authoritative live registry. Body handles, not overlapping per-team IDs, identify hits.
export const combat = {
  units: [], byBody: new Map(), pendingProjectiles: [], projectiles: [], physics: null,
  stats: { shots: 0, playerShots: 0, hits: 0, coverHits: 0, damage: 0 },
  lastShot: null, lastImpact: null,
};

// Find the nearest enemy unit within maxRange (XZ-plane distance)
export function findNearestEnemy(selfEntry, maxRange, visible = () => true) {
  if (!selfEntry.bodyRef.current) return null;
  const selfPos = selfEntry.bodyRef.current.translation();
  const cached = selfEntry.cachedTarget;
  if (battle.elapsed < (selfEntry.targetScan || 0)) {
    if (cached?.alive && cached.bodyRef.current) {
      const p = cached.bodyRef.current.translation();
      if (Math.hypot(p.x - selfPos.x, p.z - selfPos.z) < maxRange && visible(selfEntry,cached)) return cached;
    }
    return null;
  }
  selfEntry.targetScan = battle.elapsed + BALANCE.targetScanInterval;
  let nearest = null;
  let nearestDist = maxRange;
  visitNearby(selfPos.x,selfPos.z,maxRange,(u,p,d2)=>{
    if(u.team===selfEntry.team)return;
    const dist=Math.sqrt(d2);
    if(dist<nearestDist&&visible(selfEntry,u)){nearestDist=dist;nearest=u;}
  });
  selfEntry.cachedTarget = nearest;
  return nearest;
}