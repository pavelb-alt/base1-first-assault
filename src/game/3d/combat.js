// Shared combat registry — module scope, read/written by useFrame callbacks.
// NEVER put per-frame gameplay state in React useState.
export const combat = {
  units: [],               // { id, team, bodyRef, health, maxHealth, alive }
  pendingProjectiles: [],  // { origin: [x,y,z], targetId, damage, team }
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