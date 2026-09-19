import { FRONT, MAP } from '@/game/config';

const clamp = v => Math.max(0, Math.min(1, v));
export function nearestSection(x) {
  return Math.max(0, Math.min(FRONT.sectionCenters.length - 1, Math.floor((x + 180) / FRONT.sectionWidth)));
}
export function trenchAt(z, margin = FRONT.rampReach) {
  return FRONT.rows.findIndex(row => Math.abs(row - z) < margin);
}
// This surface definition builds the actual collision mesh, not just an AI height hint.
export function terrainHeight(x, z) {
  if (Math.abs(x) >= 188) return 0;
  const rowIndex = trenchAt(z, FRONT.rampReach + 0.01);
  if (rowIndex < 0) return 0;
  const dz = z - FRONT.rows[rowIndex];
  const crossingDistance = Math.min(...FRONT.crossings.map(c => Math.abs(c - x)));
  const cut = clamp((crossingDistance - FRONT.crossingHalfWidth) / FRONT.crossingSlope);
  const sectionX = FRONT.sectionCenters[nearestSection(x)];
  const gate = 1 - clamp((Math.abs(x - sectionX) - 3) / 1);
  let height = 0;
  if (dz < -4) height = FRONT.firingFloor * clamp((dz + 4.3) / 0.3);
  else if (dz <= -2.5) height = FRONT.firingFloor;
  else if (dz < 0.5) height = FRONT.firingFloor + (-FRONT.depth - FRONT.firingFloor) * (dz + 2.5) / 3;
  else if (dz <= 4) height = -FRONT.depth;
  else {
    const wall = -FRONT.depth * (1 - clamp((dz - 4) / 0.3));
    const ramp = -FRONT.depth * (1 - clamp((dz - 4) / (FRONT.rampReach - 4)));
    height = wall * (1 - gate) + ramp * gate;
  }
  return height * cut;
}

const sorted = a => [...new Set(a)].sort((a,b) => a-b);
export const TERRAIN_X = sorted([-MAP.HALF, -188, ...FRONT.crossings.flatMap(x => [x-8,x-3,x,x+3,x+8]),
  ...FRONT.sectionCenters.flatMap(x => [x-4,x-3,x,x+3,x+4]), 188, MAP.HALF]);
export const TERRAIN_Z = sorted([-MAP.HALF, ...FRONT.rows.flatMap(z => [-10,-4.3,-4,-2.5,0.5,4,4.3,10].map(d => z+d)), MAP.HALF]);

// Parapets have actual colliders. Gaps coincide with all entry ramps and crossings.
const gaps = [...FRONT.crossings.map(x => [x-8,x+8]), ...FRONT.sectionCenters.map(x => [x-4,x+4])].sort((a,b) => a[0]-b[0]);
export const COVER_SEGMENTS = [];
let cursor = -180;
for (const [a,b] of gaps) {
  if (a > cursor) COVER_SEGMENTS.push({ x: (cursor+a)/2, width: a-cursor });
  cursor = Math.max(cursor,b);
}
if (cursor < 180) COVER_SEGMENTS.push({ x:(cursor+180)/2, width:180-cursor });

// Route every ground crossing through a physical ramp, never through a wall.
export function walkRoute(start, target) {
  const route = [];
  const direction = target.z < start.z ? FRONT.friendlyForward : FRONT.enemyForward;
  const startRow = trenchAt(start.z, 10.5), endRow = trenchAt(target.z, 10.5);
  let currentZ = start.z;
  if (startRow >= 0 && startRow !== endRow) {
    const gateX = FRONT.sectionCenters[nearestSection(start.x)];
    route.push({x:gateX,z:start.z}, {x:gateX,z:FRONT.rows[startRow]+direction*12});
    currentZ = FRONT.rows[startRow]+direction*12;
  }
  const rows = FRONT.rows.map((z,i)=>({z,i})).filter(r => r.i!==endRow && r.i!==startRow && (r.z-currentZ)*direction>0 && (target.z-r.z)*direction>0).sort((a,b)=>(a.z-b.z)*direction);
  for (const row of rows) {
    const gateX = FRONT.sectionCenters[nearestSection(target.x)];
    route.push({x:gateX,z:row.z-direction*12},{x:gateX,z:row.z+direction*12});
  }
  if (endRow >= 0) {
    const rowZ = FRONT.rows[endRow], gateX = FRONT.sectionCenters[nearestSection(target.x)];
    if (startRow !== endRow) route.push({x:gateX,z:rowZ-direction*12});
    else route.push({x:gateX,z:start.z});
    route.push({x:gateX,z:rowZ+1}, {x:target.x,z:rowZ+1});
  }
  route.push({x:target.x,z:target.z});
  return route;
}