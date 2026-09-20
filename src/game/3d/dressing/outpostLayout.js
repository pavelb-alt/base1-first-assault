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
  doorwayHalfWidth: 1.45,
  coverReach: 13,
  holdSeconds: 5,
};

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