// Authoritative live registry. Body handles, not overlapping per-team IDs, identify hits.
export const combat = {
  units: [], pendingProjectiles: [], projectiles: [], physics: null,
  stats: { shots: 0, playerShots: 0, hits: 0, coverHits: 0, damage: 0 },
  lastShot: null, lastImpact: null,
};

// Find the nearest enemy unit within maxRange (XZ-plane distance)
export function findNearestEnemy(selfEntry, maxRange) {
  if (!selfEntry.bodyRef.current) return null;
  const selfPos = selfEntry.bodyRef.current.translation();
  let nearest = null;
  let nearestDist = maxRange;
  for (const u of combat.units) {
    if (!u.alive || u.team === selfEntry.team) continue;
    if (!u.bodyRef.current) continue;
    const enemyPos = u.bodyRef.current.translation();
    const dist = Math.hypot(enemyPos.x - selfPos.x, enemyPos.z - selfPos.z);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = u;
    }
  }
  return nearest;
}