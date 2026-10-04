import { Vector3 } from 'three';
import { combat } from '@/game/3d/combat';
import { isCommandable, selectUnits } from '@/game/3d/commands';

const projected = new Vector3();
// Bounds are normalized canvas coordinates (0..1), the same for mouse and touch.
export function selectScreenBox(camera, bounds, additive = false) {
  if (!bounds || ![bounds.x1, bounds.y1, bounds.x2, bounds.y2].every(Number.isFinite)) return false;
  const left = Math.min(bounds.x1, bounds.x2), right = Math.max(bounds.x1, bounds.x2);
  const top = Math.min(bounds.y1, bounds.y2), bottom = Math.max(bounds.y1, bounds.y2);
  const picked = [];
  for (const u of combat.units) {
    if (!isCommandable(u)) continue;
    const p = u.bodyRef.current.translation();
    projected.set(p.x, p.y + (u.aimHeight ?? 0.6), p.z).project(camera);
    const x = (projected.x + 1) / 2, y = (1 - projected.y) / 2;
    if (projected.z >= -1 && projected.z <= 1 && x >= left && x <= right && y >= top && y <= bottom) picked.push(u);
  }
  return selectUnits(picked, additive);
}