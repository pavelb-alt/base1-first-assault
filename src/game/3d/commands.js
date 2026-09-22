import { EventBus } from '@/game/EventBus';
import { COMMANDS, MAP } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { combat } from '@/game/3d/combat';
import { battle } from '@/game/3d/battleMetrics';
import { walkRoute, terrainHeight } from '@/game/3d/terrain';
import { followRoute, stop } from '@/game/3d/navigation/motion';
import { releasePosition, resumeFrontline } from '@/game/3d/navigation/frontline';

// Player-issued orders for one selected friendly unit (soldier or artillery).
// entry.order: { type: 'move', x, z, arrived } | { type: 'attack', target } | { type: 'bombard', x, z }
export const selection = { unit: null, mode: 'move' };

function describeOrder(o) {
  if (!o) return null;
  return o.type === 'attack'
    ? { type: 'attack', targetId: o.target.id, targetType: o.target.type }
    : { type: o.type, x: o.x, z: o.z, arrived: !!o.arrived };
}
export function selectionSnapshot() {
  const u = selection.unit;
  return {
    unit: u ? { id: u.id, type: u.type, health: Math.max(0, Math.round(u.health)), maxHealth: u.maxHealth } : null,
    mode: selection.mode,
    order: describeOrder(u?.order),
  };
}
export const publishSelection = () => EventBus.emit('selection-changed', selectionSnapshot());
const notify = entry => { if (entry === selection.unit) publishSelection(); };

export function selectUnit(entry) {
  if (!entry?.alive || entry.team !== 'friendly' || gameState.mode !== 'strategic') return false;
  if (entry.type !== 'soldier' && entry.type !== 'artillery') return false;
  selection.unit = entry;
  selection.mode = entry.type === 'artillery' && entry.order?.type !== 'move' ? 'target' : 'move';
  gameState.selectedSoldierId = entry.type === 'soldier' ? entry.id : null;
  if (entry.type === 'soldier') EventBus.emit('soldier-selected');
  publishSelection();
  return true;
}
export function clearSelection() {
  if (!selection.unit) return;
  selection.unit = null;
  gameState.selectedSoldierId = null;
  EventBus.emit('soldier-deselected');
  publishSelection();
}
export function setCommandMode(mode) {
  if (mode !== 'move' && mode !== 'target') return;
  selection.mode = mode;
  publishSelection();
}
// Returns the unit to its normal AI behaviour.
export function clearOrders(entry = selection.unit) {
  if (!entry?.order) return;
  entry.order = null;
  if (entry.type === 'soldier') resumeFrontline(entry);
  notify(entry);
}

function enemyNear(x, z) {
  let best = null, bestDistance = COMMANDS.pickRadius;
  for (const u of combat.units) {
    if (u.team !== 'enemy' || !u.alive || !u.bodyRef.current) continue;
    const p = u.bodyRef.current.translation();
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestDistance) { bestDistance = d; best = u; }
  }
  return best;
}

// Ground click in strategic view: move order, or target order in target mode.
export function issueCommand(x, z) {
  const u = selection.unit;
  if (!u?.alive) { clearSelection(); return false; }
  const edge = MAP.HALF - 1;
  x = Math.max(-edge, Math.min(edge, x));
  z = Math.max(-edge, Math.min(edge, z));
  let order;
  if (selection.mode === 'target') {
    const enemy = enemyNear(x, z);
    if (enemy) order = { type: 'attack', target: enemy };
    else if (u.type === 'artillery') order = { type: 'bombard', x, z };
    else { EventBus.emit('command-feedback', 'No enemy there — click on or near an enemy.'); return false; }
  } else order = { type: 'move', x, z, arrived: false };
  if (u.type === 'soldier') {
    releasePosition(u);
    u.nav = { phase: 'ordered', route: null, index: 0, nextRoute: 0 };
  }
  u.order = order;
  publishSelection();
  return true;
}

// Soldier order behaviour; runs instead of the frontline AI while an order is active.
export function updateSoldierOrder(entry, delta, visibleEnemy, canSee) {
  const o = entry.order, nav = entry.nav, pos = entry.bodyRef.current.translation();
  if (o.type === 'attack') {
    const t = o.target;
    if (!t.alive || !t.bodyRef.current) { clearOrders(entry); return; }
    const p = t.bodyRef.current.translation();
    if (Math.hypot(p.x - pos.x, p.z - pos.z) <= entry.profile.range && canSee(entry, t)) {
      stop(entry); entry.aiTarget = t; return;
    }
    if (battle.elapsed >= nav.nextRoute) {
      nav.route = walkRoute(pos, { x: p.x, z: p.z }); nav.index = 0;
      nav.nextRoute = battle.elapsed + COMMANDS.retargetInterval;
    }
    followRoute(entry, delta);
    if (visibleEnemy) entry.aiTarget = visibleEnemy;
    return;
  }
  // Move: shoot anything in sight on the way, then hold the destination.
  if (visibleEnemy) entry.aiTarget = visibleEnemy;
  if (o.arrived) { stop(entry); return; }
  if (!nav.route) nav.route = walkRoute(pos, { x: o.x, z: o.z });
  if (followRoute(entry, delta)) { o.arrived = true; notify(entry); }
}

// Kinematic vehicle drive toward a move order; returns true while still driving.
export function driveToOrder(entry, group, delta, speed) {
  const body = entry.bodyRef.current, p = body.translation(), o = entry.order;
  const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
  if (d < 0.3) { o.arrived = true; notify(entry); return false; }
  const step = Math.min(d, speed * delta);
  const x = p.x + dx / d * step, z = p.z + dz / d * step;
  body.setNextKinematicTranslation({ x, y: terrainHeight(x, z), z });
  group.rotation.y = Math.atan2(dx, dz);
  return true;
}

export function resetCommands() {
  selection.unit = null;
  selection.mode = 'move';
  gameState.selectedSoldierId = null;
  publishSelection();
}