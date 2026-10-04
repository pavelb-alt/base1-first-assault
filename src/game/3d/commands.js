import { EventBus } from '@/game/EventBus';
import { COMMANDS, MAP } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { combat } from '@/game/3d/combat';
import { battle } from '@/game/3d/battleMetrics';
import { walkRoute, terrainHeight } from '@/game/3d/terrain';
import { followRoute, stop } from '@/game/3d/navigation/motion';
import { releasePosition, resumeFrontline } from '@/game/3d/navigation/frontline';

// A live selection of ground units; `unit` remains the primary selection for possession.
export const selection = { unit: null, units: [], mode: 'move' };
export const canCommand = () => gameState.mode === 'strategic' && !gameState.paused && !gameState.preparing && !gameState.transitioning && !battle.gameOver;
export const isCommandable = u => !!(u?.alive && u.team === 'friendly' && u.bodyRef?.current && ['soldier', 'tank', 'artillery'].includes(u.type));

function describeOrder(o) {
  if (!o) return null;
  return o.type === 'attack'
    ? { type: 'attack', targetId: o.target.id, targetType: o.target.type }
    : { type: o.type, x: o.x, z: o.z, arrived: !!o.arrived };
}
export function selectionSnapshot() {
  const units = selection.units.filter(isCommandable).map(u => ({
    id: u.id, type: u.type, health: Math.max(0, Math.round(u.health)), maxHealth: u.maxHealth,
    order: describeOrder(u.order),
  }));
  return { unit: units[0] ?? null, units, count: units.length, mode: selection.mode, order: units[0]?.order ?? null };
}
export const publishSelection = () => EventBus.emit('selection-changed', selectionSnapshot());
const notify = entry => { if (selection.units.includes(entry)) publishSelection(); };

function applySelection(units) {
  selection.units = [...new Set(units.filter(isCommandable))];
  selection.unit = selection.units[0] ?? null;
  gameState.selectedSoldierId = selection.units.find(u => u.type === 'soldier')?.id ?? null;
  EventBus.emit(gameState.selectedSoldierId !== null ? 'soldier-selected' : 'soldier-deselected');
  publishSelection();
}
export function selectUnits(units, additive = false) {
  if (!canCommand()) return false;
  applySelection(additive ? [...selection.units, ...units] : units);
  return selection.units.length > 0;
}
export function selectUnit(entry, additive = false) {
  if (!canCommand() || !isCommandable(entry)) return false;
  if (additive && selection.units.includes(entry)) applySelection(selection.units.filter(u => u !== entry));
  else selectUnits([entry], additive);
  return true;
}
export function selectAllUnits() { return selectUnits(combat.units.filter(isCommandable)); }
export function pruneSelection() {
  if (selection.units.some(u => !isCommandable(u))) applySelection(selection.units);
}
export function clearSelection() { applySelection([]); }
export function setCommandMode(mode) {
  if (!canCommand() || (mode !== 'move' && mode !== 'target')) return false;
  selection.mode = mode;
  publishSelection();
  return true;
}
// With no argument, return the whole selection to automatic behaviour.
export function clearOrders(entry) {
  if (!entry) {
    if (!canCommand()) return;
    selection.units.forEach(u => clearOrders(u));
    return;
  }
  if (!entry.order) return;
  entry.order = null;
  entry.commandRoute = null;
  if (entry.type === 'soldier') resumeFrontline(entry);
  notify(entry);
}
function assignOrder(u, order) {
  if (u.type === 'soldier') {
    releasePosition(u);
    u.nav = { phase: 'ordered', route: null, index: 0, nextRoute: 0 };
    stop(u);
  } else u.bodyRef.current.setNextKinematicTranslation(u.bodyRef.current.translation());
  u.commandRoute = null;
  u.aiTarget = null;
  u.order = order;
}
export function holdPosition() {
  if (!canCommand()) return false;
  pruneSelection();
  for (const u of selection.units) {
    const p = u.bodyRef.current.translation();
    assignOrder(u, { type: 'hold', x: p.x, z: p.z, arrived: true });
  }
  publishSelection();
  return selection.units.length > 0;
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
export function issueAttack(target) {
  if (!canCommand() || !target?.alive || target.team !== 'enemy' || !target.bodyRef?.current) return false;
  pruneSelection();
  for (const u of selection.units) assignOrder(u, { type: 'attack', target });
  publishSelection();
  return selection.units.length > 0;
}

// Commands fan out once; each unit owns its own order and route.
export function issueCommand(x, z) {
  if (!canCommand() || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  pruneSelection();
  if (!selection.units.length) return false;
  const units = selection.units, edge = MAP.HALF - 1;
  if (selection.mode === 'target') {
    const enemy = enemyNear(x, z);
    if (enemy) return issueAttack(enemy);
    const guns = units.filter(u => u.type === 'artillery');
    if (!guns.length) { EventBus.emit('command-feedback', 'No enemy there — click on an enemy.'); return false; }
    for (const u of guns) assignOrder(u, { type: 'bombard', x: Math.max(-edge, Math.min(edge, x)), z: Math.max(-edge, Math.min(edge, z)) });
    if (guns.length !== units.length) EventBus.emit('command-feedback', 'Artillery shelling area; other troops keep their orders.');
  } else {
    const columns = Math.ceil(Math.sqrt(units.length)), rows = Math.ceil(units.length / columns);
    const spacing = units.some(u => u.type !== 'soldier') ? COMMANDS.vehicleSpacing : COMMANDS.formationSpacing;
    const halfX = (columns - 1) * spacing / 2, halfZ = (rows - 1) * spacing / 2;
    x = Math.max(-edge + halfX, Math.min(edge - halfX, x));
    z = Math.max(-edge + halfZ, Math.min(edge - halfZ, z));
    units.forEach((u, i) => assignOrder(u, { type: 'move', x: x + (i % columns) * spacing - halfX, z: z + Math.floor(i / columns) * spacing - halfZ, arrived: false }));
  }
  publishSelection();
  return true;
}

// Soldier order behaviour; runs instead of the frontline AI while an order is active.
export function updateSoldierOrder(entry, delta, visibleEnemy, canSee) {
  const o = entry.order, nav = entry.nav, pos = entry.bodyRef.current.translation();
  if (o.type === 'hold') {
    stop(entry);
    if (visibleEnemy) entry.aiTarget = visibleEnemy;
    return;
  }
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

// Vehicle orders use the same trench-crossing routes as ground troops.
export function driveVehicleToward(entry, group, delta, speed, target) {
  const body = entry.bodyRef.current, p = body.translation();
  let route = entry.commandRoute;
  if (!route || Math.hypot(route.x - target.x, route.z - target.z) > 3 && battle.elapsed >= route.next) {
    route = entry.commandRoute = { points: walkRoute(p, target), index: 0, x: target.x, z: target.z, next: battle.elapsed + COMMANDS.retargetInterval };
  }
  const next = route.points[route.index];
  if (!next) return false;
  const dx = next.x - p.x, dz = next.z - p.z, distance = Math.hypot(dx, dz);
  if (distance < 0.35) { route.index++; return route.index < route.points.length; }
  const step = Math.min(distance, speed * delta);
  const x = p.x + dx / distance * step, z = p.z + dz / distance * step;
  body.setNextKinematicTranslation({ x, y: terrainHeight(x, z), z });
  group.rotation.y = Math.atan2(dx, dz);
  return true;
}
export function driveToOrder(entry, group, delta, speed) {
  const driving = driveVehicleToward(entry, group, delta, speed, entry.order);
  if (!driving && !entry.order.arrived) { entry.order.arrived = true; notify(entry); }
  return driving;
}

export function resetCommands() {
  selection.units = [];
  selection.unit = null;
  selection.mode = 'move';
  gameState.selectedSoldierId = null;
  publishSelection();
}