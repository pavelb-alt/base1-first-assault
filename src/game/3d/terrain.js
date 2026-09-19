import { FRONT, MAP } from '@/game/config';

const clamp = v => Math.max(0, Math.min(1, v));

export function nearestSection(x) {
  const frontage = MAP.HALF * 0.9;
  return Math.max(0, Math.min(FRONT.sectionCenters.length - 1, Math.floor((x + frontage) / FRONT.sectionWidth)));
}
export function trenchAt(z, margin = FRONT.rampReach) {
  return FRONT.rows.findIndex(row => Math.abs(row - z) < margin);
}

// Zigzag offset: shifts the trench centerline in Z based on X position,
// creating short zigzag sections instead of identical straight trenches.
export function zigzagOffset(x, rowIndex) {
  const period = FRONT.zigzagPeriod;
  const amplitude = FRONT.zigzagAmplitude;
  const phase = rowIndex * 7.3;
  const t = (((x + phase) % period) + period) % period / period;
  return (t < 0.5 ? t * 4 - 1 : 3 - t * 4) * amplitude;
}

// This surface definition builds the actual collision mesh, not just an AI height hint.
export function terrainHeight(x, z) {
  if (Math.abs(x) >= MAP.HALF * 0.94) return 0;
  const rowIndex = trenchAt(z, FRONT.rampReach + 0.01);
  if (rowIndex < 0) return 0;
  const rowZ = FRONT.rows[rowIndex] + zigzagOffset(x, rowIndex);
  const dz = z - rowZ;

  // Crossing passage: ground level at crossings
  const crossingDistance = Math.min(...FRONT.crossings.map(c => Math.abs(c - x)));
  const cut = clamp((crossingDistance - FRONT.crossingHalfWidth) / FRONT.crossingSlope);

  // Gate passage: ramp at section centers (ground-level passage through back wall)
  const sectionX = FRONT.sectionCenters[nearestSection(x)];
  const gate = 1 - clamp((Math.abs(x - sectionX) - 1.0) / 0.5);

  const hw = FRONT.halfWidth;   // trench half-width (1.8)
  const fw = 0.9;               // floor half-width (allows 2 soldiers side by side)
  const wallTrans = 0.3;        // wall transition width

  let height = 0;
  if (dz < -(hw + wallTrans)) {
    // Ground in front of trench
    height = 0;
  } else if (dz < -hw) {
    // Front wall transition: ground to firing step
    height = FRONT.firingFloor * clamp((dz + hw + wallTrans) / wallTrans);
  } else if (dz < -fw) {
    // Firing step
    height = FRONT.firingFloor;
  } else if (dz < fw) {
    // Trench floor
    height = -FRONT.depth;
  } else if (dz < hw) {
    // Back ramp: floor to ground
    height = -FRONT.depth * (1 - clamp((dz - fw) / (hw - fw)));
  } else if (dz < hw + wallTrans) {
    // Back wall: steep wall (non-gate) or ramp (gate)
    const wall = -FRONT.depth * (1 - clamp((dz - hw) / wallTrans));
    const ramp = -FRONT.depth * (1 - clamp((dz - hw) / (FRONT.rampReach - hw)));
    height = wall * (1 - gate) + ramp * gate;
  } else {
    // Ground behind trench
    height = 0;
  }

  return height * cut;
}

const sorted = a => [...new Set(a)].sort((a, b) => a - b);
const terrainEdge = MAP.HALF * 0.94;

// Finer X grid to capture zigzag shape
const fineX = [];
for (let x = -MAP.HALF; x <= MAP.HALF; x += 5) fineX.push(x);

export const TERRAIN_X = sorted([...fineX, -terrainEdge, terrainEdge,
  ...FRONT.crossings.flatMap(x => [x - FRONT.crossingHalfWidth - FRONT.crossingSlope, x - FRONT.crossingHalfWidth, x + FRONT.crossingHalfWidth, x + FRONT.crossingHalfWidth + FRONT.crossingSlope]),
  ...FRONT.sectionCenters.flatMap(x => [x - 1.5, x - 1.0, x + 1.0, x + 1.5]),
]);

const trenchZOffsets = [-(FRONT.halfWidth + 0.3), -FRONT.halfWidth, -0.9, 0.9, FRONT.halfWidth, FRONT.halfWidth + 0.3, FRONT.rampReach];
export const TERRAIN_Z = sorted([-MAP.HALF, ...FRONT.rows.flatMap(z => trenchZOffsets.map(d => z + d)), MAP.HALF]);

// Parapets have actual colliders. Gaps coincide with all entry ramps and crossings.
const gaps = [...FRONT.crossings.map(x => [x - FRONT.crossingHalfWidth - 0.5, x + FRONT.crossingHalfWidth + 0.5]),
              ...FRONT.sectionCenters.map(x => [x - 1.5, x + 1.5])].sort((a, b) => a[0] - b[0]);
export const COVER_SEGMENTS = [];
const frontage = MAP.HALF * 0.9;
let cursor = -frontage;
for (const [a, b] of gaps) {
  if (a > cursor) COVER_SEGMENTS.push({ x: (cursor + a) / 2, width: a - cursor });
  cursor = Math.max(cursor, b);
}
if (cursor < frontage) COVER_SEGMENTS.push({ x: (cursor + frontage) / 2, width: frontage - cursor });

// Route every ground crossing through a physical ramp, never through a wall.
export function walkRoute(start, target) {
  const route = [];
  const direction = target.z < start.z ? FRONT.friendlyForward : FRONT.enemyForward;
  const startRow = trenchAt(start.z, 4.5), endRow = trenchAt(target.z, 4.5);
  let currentZ = start.z;
  if (startRow >= 0 && startRow !== endRow) {
    const gateX = FRONT.sectionCenters[nearestSection(start.x)];
    route.push({ x: gateX, z: start.z }, { x: gateX, z: FRONT.rows[startRow] + direction * 4 });
    currentZ = FRONT.rows[startRow] + direction * 4;
  }
  const rows = FRONT.rows.map((z, i) => ({ z, i })).filter(r => r.i !== endRow && r.i !== startRow && (r.z - currentZ) * direction > 0 && (target.z - r.z) * direction > 0).sort((a, b) => (a.z - b.z) * direction);
  for (const row of rows) {
    const gateX = FRONT.sectionCenters[nearestSection(target.x)];
    route.push({ x: gateX, z: row.z - direction * 4 }, { x: gateX, z: row.z + direction * 4 });
  }
  if (endRow >= 0) {
    const rowZ = FRONT.rows[endRow], gateX = FRONT.sectionCenters[nearestSection(target.x)];
    if (startRow !== endRow) route.push({ x: gateX, z: rowZ - direction * 4 });
    else route.push({ x: gateX, z: start.z });
    route.push({ x: gateX, z: rowZ + 1 }, { x: target.x, z: rowZ + 1 });
  }
  route.push({ x: target.x, z: target.z });
  return route;
}