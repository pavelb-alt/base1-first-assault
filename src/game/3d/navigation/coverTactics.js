import { battle } from '@/game/3d/battleMetrics';
import { combat } from '@/game/3d/combat';
import { canSeeTarget } from '@/game/3d/ballistics';
import { OUTPOST, OUTPOSTS, outpostContaining, outpostCoverSlots } from '@/game/3d/dressing/outpostLayout';
import { moveToward, stop } from '@/game/3d/navigation/motion';

const slots = outpostCoverSlots();
const reservations = new Map();
const activeBreaches = new Set();

function claim(entry, enemy) {
  if (battle.elapsed < (entry.coverCooldownUntil || 0)) return false;
  const p = entry.bodyRef.current.translation();
  const target = enemy.bodyRef.current.translation();
  let best = null;
  for (const slot of slots) {
    if (reservations.has(slot.id)) continue;
    const outpost = OUTPOSTS.find(o => o.id === slot.outpostId);
    const outpostDistance = Math.hypot(outpost.x - p.x, outpost.z - p.z);
    if (outpostDistance > OUTPOST.coverReach) continue;
    const desiredSide = target.z < outpost.z ? -1 : 1;
    if (slot.side !== desiredSide) continue;
    const score = outpostDistance + Math.hypot(slot.x - target.x, slot.z - target.z) * 0.05;
    if (!best || score < best.score) best = { slot, outpost, score };
  }
  if (!best) return false;
  reservations.set(best.slot.id, entry);
  const inside = !!outpostContaining(p);
  entry.combatCover = {
    slotId: best.slot.id,
    outpost: best.outpost,
    route: inside
      ? [best.slot.center, { x: best.slot.x, z: best.slot.z }]
      : [best.slot.approach, best.slot.center, { x: best.slot.x, z: best.slot.z }],
    index: 0,
    phase: 'moving',
    leaveAt: battle.elapsed + OUTPOST.holdSeconds,
  };
  return true;
}

function findDefender(entry) {
  const p = entry.bodyRef.current.translation();
  let best = null, bestDistance = 36;
  for (const unit of combat.units) {
    if (!unit.alive || unit.team !== 'friendly' || !unit.bodyRef.current) continue;
    const q = unit.bodyRef.current.translation();
    const outpost = outpostContaining(q, -0.2);
    if (!outpost) continue;
    const distance = Math.hypot(q.x - p.x, q.z - p.z);
    if (distance < bestDistance) { bestDistance = distance; best = { unit, outpost }; }
  }
  return best;
}

export function releaseCombatCover(entry) {
  if (!entry) return;
  if (entry.combatCover && reservations.get(entry.combatCover.slotId) === entry) reservations.delete(entry.combatCover.slotId);
  entry.combatCover = null;
  entry.outpostBreach = null;
  entry.outpostAvoidance = null;
  activeBreaches.delete(entry);
}

export function resetCombatCover() {
  reservations.clear();
  activeBreaches.clear();
}

// Friendly soldiers enter through a doorway, hold for a short fixed window,
// then leave through the forward door and resume their advance.
export function updateFriendlyCover(entry, enemy, delta) {
  if (!entry.combatCover && enemy) claim(entry, enemy);
  const cover = entry.combatCover;
  if (!cover) return false;

  if (cover.phase === 'moving' || cover.phase === 'exiting') {
    entry.aiTarget = null;
    if (moveToward(entry, cover.route[cover.index], delta, { separate: false, avoidOutposts: false })) cover.index++;
    if (cover.index >= cover.route.length) {
      if (cover.phase === 'moving') {
        cover.phase = 'holding';
        cover.leaveAt = battle.elapsed + OUTPOST.holdSeconds;
      } else {
        entry.coverCooldownUntil = battle.elapsed + 8;
        entry.coverAdvanceUntil = battle.elapsed + 3;
        releaseCombatCover(entry);
        return false;
      }
    }
    return true;
  }

  stop(entry);
  if (enemy) entry.aiTarget = enemy;
  if (battle.elapsed < cover.leaveAt) return true;
  cover.phase = 'exiting';
  cover.index = 0;
  cover.route = [
    { x: cover.outpost.x, z: cover.outpost.z },
    { x: cover.outpost.x, z: cover.outpost.z - OUTPOST.halfDepth - 1.5 },
  ];
  entry.aiTarget = null;
  return true;
}

// Enemy ground units ignore empty ruins. A sheltered friendly creates a breach
// route through the nearest doorway; the attacker keeps pursuing until it has
// line of sight inside the structure.
export function updateEnemyBreach(entry, visibleEnemy, delta) {
  let breach = entry.outpostBreach;
  if (breach) {
    const q = breach.defender.bodyRef.current?.translation();
    if (!breach.defender.alive || !q || outpostContaining(q) !== breach.outpost) {
      entry.outpostBreach = null; activeBreaches.delete(entry); breach = null;
    }
  }
  if (!breach) {
    const found = findDefender(entry);
    if (!found) return false;
    const p = entry.bodyRef.current.translation();
    const side = p.z < found.outpost.z ? -1 : 1;
    breach = entry.outpostBreach = {
      defender: found.unit,
      outpost: found.outpost,
      route: [
        { x: found.outpost.x, z: found.outpost.z + side * (OUTPOST.halfDepth + 1.5) },
        { x: found.outpost.x, z: found.outpost.z },
      ],
      index: 0,
    };
    activeBreaches.add(entry);
  }

  if (canSeeTarget(entry, breach.defender)) {
    stop(entry);
    entry.aiTarget = breach.defender;
    return true;
  }
  entry.aiTarget = null;
  if (breach.index < breach.route.length) {
    if (moveToward(entry, breach.route[breach.index], delta, { separate: false, avoidOutposts: false })) breach.index++;
  } else {
    const q = breach.defender.bodyRef.current.translation();
    moveToward(entry, q, delta, { separate: false, avoidOutposts: false });
  }
  return true;
}

export function coverSnapshot() {
  return { outposts: OUTPOSTS.length, slots: slots.length, occupied: reservations.size, breaches: activeBreaches.size };
}