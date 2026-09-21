// Enterable ruins distributed between trench lines. All entrances run north/south
// so the main faction advance can flow through each structure.
export const OUTPOSTS = [
  { id: 'west-north', x: -48, z: -34, rotation: 0 },
  { id: 'center-north', x: -8, z: -34, rotation: 0 },
  { id: 'east-mid', x: 45, z: -10, rotation: 0 },
  { id: 'west-mid', x: -43, z: 12, rotation: 0 },
  { id: 'center-south', x: 8, z: 34, rotation: 0 },
  { id: 'east-south', x: 48, z: 34, rotation: 0 },
];

export const OUTPOST = {
  halfWidth: 5,
  halfDepth: 4,
  wallHeight: 2.8,
  doorwayHalfWidth: 1.75,
  coverReach: 13,
  holdSeconds: 5,
};

export function outpostContaining(position, margin = 0) {
  return OUTPOSTS.find(outpost =>
    Math.abs(position.x - outpost.x) < OUTPOST.halfWidth + margin &&
    Math.abs(position.z - outpost.z) < OUTPOST.halfDepth + margin
  ) || null;
}

function segmentHitsBox(from, to, outpost, margin) {
  let tMin = 0, tMax = 1;
  for (const axis of ['x', 'z']) {
    const min = outpost[axis] - (axis === 'x' ? OUTPOST.halfWidth : OUTPOST.halfDepth) - margin;
    const max = outpost[axis] + (axis === 'x' ? OUTPOST.halfWidth : OUTPOST.halfDepth) + margin;
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 0.0001) { if (from[axis] < min || from[axis] > max) return false; continue; }
    const a = (min - from[axis]) / delta, b = (max - from[axis]) / delta;
    tMin = Math.max(tMin, Math.min(a, b)); tMax = Math.min(tMax, Math.max(a, b));
    if (tMin > tMax) return false;
  }
  return tMax >= 0 && tMin <= 1;
}

// Regular advance routes go around ruins. A per-unit avoidance record makes the
// chosen side sticky: first move beside the ruin, then pass its far corner.
// This prevents crowded units from switching corners every frame and deadlocking.
export function steerAroundOutposts(from, target, margin = 0.75, avoidance = null, unitId = 0) {
  const clearanceX = OUTPOST.halfWidth + margin + 0.6;
  const clearanceZ = OUTPOST.halfDepth + margin + 0.6;
  const inside = outpostContaining(from);
  if (inside) {
    const side = target.z < inside.z ? -1 : 1;
    return { x: inside.x, z: inside.z + side * clearanceZ };
  }

  let active = avoidance?.outpostId ? OUTPOSTS.find(o => o.id === avoidance.outpostId) : null;
  if (active) {
    const bypassX = active.x + avoidance.sideX * clearanceX;
    if (avoidance.phase === 'side') {
      if (Math.abs(from.x - bypassX) < 0.55) avoidance.phase = 'pass';
      else return { x: bypassX, z: from.z };
    }
    const passZ = active.z + avoidance.sideZ * clearanceZ;
    if (Math.abs(from.z - passZ) < 0.55) {
      avoidance.outpostId = null;
      avoidance.phase = null;
      active = null;
    } else return { x: bypassX, z: passZ };
  }

  for (const outpost of OUTPOSTS) {
    if (!segmentHitsBox(from, target, outpost, margin)) continue;
    const centered = Math.abs(from.x - outpost.x) < 0.25;
    const sideX = centered ? (unitId % 2 ? -1 : 1) : (from.x < outpost.x ? -1 : 1);
    const sideZ = target.z < outpost.z ? -1 : 1;
    if (avoidance) Object.assign(avoidance, { outpostId: outpost.id, sideX, sideZ, phase: 'side' });
    return { x: outpost.x + sideX * clearanceX, z: from.z };
  }
  return target;
}

export function outpostCoverSlots() {
  const slots = [];
  for (const outpost of OUTPOSTS) {
    for (const side of [-1, 1]) {
      for (const offset of [-2.45, 2.45]) {
        slots.push({
          id: `${outpost.id}:${side}:${offset}`,
          outpostId: outpost.id,
          x: outpost.x + offset,
          z: outpost.z + side * (OUTPOST.halfDepth - 0.85),
          center: { x: outpost.x, z: outpost.z },
          approach: { x: outpost.x, z: outpost.z - side * (OUTPOST.halfDepth + 1.5) },
          side,
        });
      }
    }
  }
  return slots;
}