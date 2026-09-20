import { battle } from '@/game/3d/battleMetrics';
import { OUTPOST, OUTPOSTS, outpostCoverSlots } from '@/game/3d/dressing/outpostLayout';
import { moveToward, stop } from '@/game/3d/navigation/motion';

const slots = outpostCoverSlots();
const reservations = new Map();

function claim(entry, enemy) {
  const p = entry.bodyRef.current.translation();
  const target = enemy.bodyRef.current.translation();
  let best = null;
  for (const slot of slots) {
    if (reservations.has(slot.id)) continue;
    const outpost = OUTPOSTS.find(o => o.id === slot.outpostId);
    const outpostDistance = Math.hypot(outpost.x - p.x, outpost.z - p.z);
    if (outpostDistance > OUTPOST.coverReach) continue;
    // Pick the wall facing the threat, so the ruin sits between soldier and fire.
    const desiredSide = target.z < outpost.z ? -1 : 1;
    if (slot.side !== desiredSide) continue;
    const score = outpostDistance + Math.hypot(slot.x - target.x, slot.z - target.z) * 0.05;
    if (!best || score < best.score) best = { slot, outpost, score };
  }
  if (!best) return false;
  reservations.set(best.slot.id, entry);
  const inside = Math.abs(p.x - best.outpost.x) < OUTPOST.halfWidth && Math.abs(p.z - best.outpost.z) < OUTPOST.halfDepth;
  entry.combatCover = {
    slotId: best.slot.id,
    route: inside
      ? [best.slot.center, { x: best.slot.x, z: best.slot.z }]
      : [best.slot.approach, best.slot.center, { x: best.slot.x, z: best.slot.z }],
    index: 0,
    phase: 'moving',
    holdUntil: battle.elapsed + OUTPOST.holdSeconds,
  };
  return true;
}

export function releaseCombatCover(entry) {
  if (!entry?.combatCover) return;
  if (reservations.get(entry.combatCover.slotId) === entry) reservations.delete(entry.combatCover.slotId);
  entry.combatCover = null;
}

export function resetCombatCover() {
  reservations.clear();
}

// Returns true while cover tactics own movement for this frame.
export function updateCombatCover(entry, enemy, delta) {
  if (!entry.combatCover && enemy) claim(entry, enemy);
  const cover = entry.combatCover;
  if (!cover) return false;

  if (cover.phase === 'moving') {
    entry.aiTarget = null;
    if (moveToward(entry, cover.route[cover.index], delta)) cover.index++;
    if (cover.index >= cover.route.length) {
      cover.phase = 'holding';
      cover.holdUntil = battle.elapsed + OUTPOST.holdSeconds;
    }
    return true;
  }

  stop(entry, entry.type === 'eyedrone');
  if (enemy) {
    entry.aiTarget = enemy;
    cover.holdUntil = battle.elapsed + OUTPOST.holdSeconds;
    return true;
  }
  entry.aiTarget = null;
  if (battle.elapsed < cover.holdUntil) return true;
  releaseCombatCover(entry);
  return false;
}

export function coverSnapshot() {
  return { outposts: OUTPOSTS.length, slots: slots.length, occupied: reservations.size };
}