import { MAP, FRONT, BASES } from '@/game/config';
import { terrainHeight, trenchCenter } from '@/game/3d/trenchShape';
import { dressingNoise as n } from '@/game/3d/dressing/dressingNoise';

// Visual-only ground clutter on flat battlefield earth; no colliders, no trench interiors.
const bases = [BASES.friendly.position, BASES.enemy.position];
function open(x, z, margin) {
  if (Math.abs(x) > MAP.HALF - 1 || Math.abs(z) > MAP.HALF - 1) return false;
  if (bases.some(b => Math.hypot(x - b[0], z - b[2]) < 9)) return false;
  if (FRONT.rows.some((_, row) => Math.abs(z - trenchCenter(row, x)) < margin)) return false;
  return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => terrainHeight(x + dx, z + dz) > -0.01);
}
function scatter(kind, count, seed, margin, make) {
  const items = [];
  for (let i = 0; i < count * 3 && items.length < count; i++) {
    const x = (n(seed + i * 4) - 0.5) * MAP.SIZE, z = (n(seed + i * 4 + 1) - 0.5) * MAP.SIZE;
    if (!open(x, z, margin)) continue;
    items.push({ ...make(x, z, n(seed + i * 4 + 2), n(seed + i * 4 + 3), i), tone: i });
  }
  GROUND_DETAIL[kind] = items;
}
export const GROUND_DETAIL = {};
const item = (x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) => ({ position: [x, y, z], scale: [sx, sy, sz], rotation: [rx, ry, rz] });

scatter('pebble', 1500, 300000, 4.2, (x, z, a, b) => {
  const s = 0.06 + a * 0.14;
  return item(x, s * 0.25, z, s * (1 + b), s * 0.6, s, b * 6, a * 2);
});
scatter('stone', 260, 310000, 4.6, (x, z, a, b) => {
  const s = 0.25 + a * 0.45;
  return item(x, s * 0.2, z, s * (1.1 + b * 0.6), s * 0.55, s, b * 6, a, b * 0.4);
});
// Grass/weed clumps: several thin blades per clump.
{
  const blades = [];
  for (let c = 0; c < 520; c++) {
    const cx = (n(320000 + c * 3) - 0.5) * MAP.SIZE, cz = (n(320001 + c * 3) - 0.5) * MAP.SIZE;
    if (!open(cx, cz, 4.4)) continue;
    const count = 4 + Math.floor(n(320002 + c * 3) * 5);
    for (let k = 0; k < count; k++) {
      const a = n(330000 + c * 17 + k), b = n(331000 + c * 17 + k);
      const h = 0.18 + a * 0.32, ang = b * Math.PI * 2, r = a * 0.28;
      blades.push({ ...item(cx + Math.cos(ang) * r, h / 2, cz + Math.sin(ang) * r, 0.05, h, 0.05, ang, (b - 0.5) * 0.6, (a - 0.5) * 0.6), tone: c + k });
    }
  }
  GROUND_DETAIL.tuft = blades;
}
scatter('mound', 110, 340000, 5.5, (x, z, a, b) => {
  const s = 1 + a * 2.4;
  return item(x, 0, z, s * (1 + b * 0.8), 0.14 + a * 0.18, s, b * 6);
});
scatter('rim', 55, 350000, 6.5, (x, z, a, b) => {
  const s = 1.4 + a * 2.2;
  return item(x, 0.02, z, s * (1 + b * 0.3), s, 0.9 + a * 0.4, b * 6, -Math.PI / 2);
});
scatter('plank', 190, 360000, 4.6, (x, z, a, b) => {
  const l = 0.4 + a * 1.1;
  return item(x, 0.04, z, l, 0.06, 0.14 + b * 0.12, b * 6, 0, (a - 0.5) * 0.3);
});
scatter('casing', 420, 370000, 4.2, (x, z, a, b) => item(x, 0.025, z, 0.05, 0.12, 0.05, b * 6, Math.PI / 2, a));