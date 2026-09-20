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

// Regular advance routes go around ruins. Deliberate cover/breach routes disable
// this steering and use the wide north/south doorways instead.
export function steerAroundOutposts(from, target, margin = 0.75) {
  const inside = outpostContaining(from);
  if (inside) {
    const side = target.z < inside.z ? -1 : 1;
    return { x: inside.x, z: inside.z + side * (OUTPOST.halfDepth + margin + 0.35) };
  }
  for (const outpost of OUTPOSTS) {
    if (!segmentHitsBox(from, target, outpost, margin)) continue;
    const sideX = from.x < outpost.x ? -1 : 1;
    const bypassX = outpost.x + sideX * (OUTPOST.halfWidth + margin + 0.35);
    const alreadyBeside = Math.abs(from.x - outpost.x) >= OUTPOST.halfWidth + margin - 0.15;
    const sideZ = (alreadyBeside ? target.z : from.z) < outpost.z ? -1 : 1;
    return { x: bypassX, z: outpost.z + sideZ * (OUTPOST.halfDepth + margin + 0.35) };
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