import { CITY, MAP } from '@/game/config';
import { dressingNoise as noise } from '@/game/3d/dressing/dressingNoise';

// All structures stay outside the battle boundary: no spawn or trench obstruction.
export const CITY_LAYOUT = { structure: [], windows: [], lights: [] };
const add = (type, x, y, z, w, h, d, color, rotation = 0) =>
  CITY_LAYOUT[type].push({ position: [x, y, z], scale: [w, h, d], color, rotation });
for (let side = 0; side < 4; side++) for (let row = 0; row < 2; row++) {
  for (let block = 0; block < CITY.blocksPerSide; block++) {
    const id = side * 100 + row * 30 + block, seed = 160000 + id * 20;
    const along = (block - (CITY.blocksPerSide - 1) / 2) * CITY.blockSpacing;
    const offset = CITY.firstBlockOffset + row * CITY.rowSpacing;
    const x = side < 2 ? (side === 0 ? -offset : offset) : along;
    const z = side < 2 ? along : (side === 2 ? -offset : offset);
    const w = 14 + noise(seed) * 5, d = 13 + noise(seed + 1) * 5;
    const h = (side === 3 ? 12 : 18) + noise(seed + 2) * (side === 3 ? 9 : 24) + row * 9;
    const color = CITY.buildings[id % CITY.buildings.length];
    const ruined = block % 3 === 1 && row === 0;
    add('structure', x, h / 2, z, w, h, d, color);
    add('structure', x, 0.25, z, w + 3, 0.5, d + 3, CITY.curb);
    // Cornices and vertical facade ribs break up the tower silhouettes.
    for (let y = 4; y < h; y += 4) add('structure', x, y, z, w + 0.35, 0.25, d + 0.35, CITY.trim);
    for (const dx of [-w / 2 + 0.45, w / 2 - 0.45])
      add('structure', x + dx, h / 2, z, 0.7, h, d + 0.45, CITY.concrete);
    if (ruined) {
      // Exposed broken upper-floor columns and tilted roof fragments.
      for (let k = 0; k < 4; k++) {
        add('structure', x - w * 0.38 + k * w / 4, h + 1.2 + noise(seed + k + 3), z,
          0.8, 2.4 + noise(seed + k + 3) * 2, d * 0.8, CITY.concrete);
      }
      add('structure', x + 1, h + 0.7, z - 1, w * 0.7, 0.45, d * 0.65, CITY.trim, 0.18);
    } else {
      add('structure', x, h + 0.5, z, w + 0.7, 1, d + 0.7, CITY.trim);
      add('structure', x - 2, h + 1.7, z + 1, 4, 2.4, 5, CITY.concrete);
    }
    // Repeated inset window grids share a single instanced batch.
    for (let y = 2.5; y < h - 1; y += 4) for (let c = -w / 2 + 2; c < w / 2 - 1; c += 3) {
      const lit = noise(seed + y * 21 + c) > 0.86;
      const kind = lit ? 'lights' : 'windows', color = lit ? CITY.windowGlow : CITY.glass;
      for (const face of [-1, 1]) add(kind, x + c, y, z + face * (d / 2 + 0.025), 1.5, 2, 0.05, color);
    }
    for (let y = 2.5; y < h - 1; y += 4) for (let c = -d / 2 + 2; c < d / 2 - 1; c += 3)
      for (const face of [-1, 1]) add('windows', x + face * (w / 2 + 0.025), y, z + c, 0.05, 2, 1.5, CITY.glass);
  }
}
// Nearer sidewalks, streetlights and concrete barriers provide human-scale detail.
for (const side of [-1, 1]) {
  const x = side * (MAP.HALF + 7);
  add('structure', x, 0.12, 0, 5, 0.24, MAP.SIZE, CITY.curb);
  for (let z = -65; z <= 65; z += 26) {
    add('structure', x, 3, z, 0.16, 6, 0.16, CITY.trim);
    add('structure', x - side * 1.2, 6, z, 2.5, 0.15, 0.2, CITY.trim);
    add('lights', x - side * 2.2, 5.9, z, 0.8, 0.12, 0.45, CITY.windowGlow);
    add('structure', x, 0.5, z + 7, 1.1, 1, 4, CITY.concrete);
  }
}