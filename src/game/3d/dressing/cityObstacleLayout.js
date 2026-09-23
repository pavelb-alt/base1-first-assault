import { FRONT } from '@/game/config';
import { dressingNoise as noise } from '@/game/3d/dressing/dressingNoise';

// Local parts per obstacle kind: [material, size, position, rotation?].
// Colliders are one cuboid per obstacle: [halfExtents, centerY].
export const CITY_OBSTACLE_KINDS = {
  barricade: {
    parts: [
      ['concrete', [3, 0.25, 0.75], [0, 0.125, 0]],
      ['concrete', [3, 0.75, 0.35], [0, 0.6, 0]],
      ['paint', [3.02, 0.12, 0.37], [0, 0.82, 0]],
    ],
    collider: [[1.5, 0.5, 0.4], 0.5],
  },
  wreck: {
    parts: [
      ['rust', [3.6, 0.7, 1.8], [0, 0.6, 0]],
      ['dark', [1.8, 0.55, 1.6], [-0.2, 1.2, 0], [0, 0, 0.08]],
      ['glass', [1.2, 0.35, 1.62], [-0.2, 1.22, 0]],
      ...[-1.2, 1.2].flatMap(x => [-0.95, 0.95].map(z => ['dark', [0.6, 0.6, 0.3], [x, 0.3, z]])),
    ],
    collider: [[1.85, 0.75, 0.95], 0.75],
  },
  ruinWall: {
    parts: [
      ['concrete', [4.5, 2.4, 0.5], [0, 1.2, 0]],
      ['concrete', [1.3, 0.6, 0.5], [-1.4, 2.7, 0]],
      ['concrete', [0.8, 0.35, 0.5], [0.9, 2.55, 0]],
      ['steel', [0.06, 0.8, 0.06], [0.2, 2.8, 0]],
      ['steel', [0.06, 0.65, 0.06], [-0.3, 2.7, 0.1], [0.3, 0, 0.2]],
      ['dark', [1.1, 0.4, 0.9], [1.7, 0.2, 0.6], [0, 0.4, 0.15]],
      ['concrete', [0.9, 0.3, 0.7], [-1.8, 0.15, -0.6], [0, -0.3, 0]],
    ],
    collider: [[2.25, 1.3, 0.3], 1.3],
  },
  rubble: {
    parts: [
      ['concrete', [2.1, 0.6, 1.6], [0, 0.3, 0], [0, 0.3, 0.08]],
      ['dark', [1.2, 0.5, 1], [0.8, 0.55, 0.4], [0.3, 0.8, 0.2]],
      ['concrete', [1, 0.45, 1.4], [-0.9, 0.4, -0.3], [0, -0.4, -0.25]],
      ['steel', [0.15, 0.15, 2.4], [0.2, 0.85, 0], [0.3, 0.6, 0]],
    ],
    collider: [[1.35, 0.5, 1.05], 0.5],
  },
};

// Keep city cover behind the bulwark and away from its three approach routes.
const bands = [{z:FRONT.rows[FRONT.mainRow]+18,kinds:['barricade','wreck','rubble']}];
export const CITY_OBSTACLES = bands.flatMap((band, b) => [-60,-22.5,22.5,60].map((cx, s) => {
  const seed = 170000 + b * 40 + s * 4;
  // No man's land alternates rows so there is always a clear route across it.
  if (Math.abs(band.z) < 8 && (s + b) % 2) return null;
  const kind = band.kinds[(s + b) % band.kinds.length];
  const rot = kind === 'barricade' || kind === 'ruinWall' ? (noise(seed) - 0.5) * 0.6 : noise(seed) * Math.PI;
  return { kind, x: cx + (noise(seed + 1) - 0.5) * 3, z: band.z + (noise(seed + 2) - 0.5) * 2, rot };
}).filter(Boolean));