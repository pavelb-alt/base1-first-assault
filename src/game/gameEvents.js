// High-frequency gameplay event bus for presentation systems (audio, camera shake,
// hit markers, kill feed, damage numbers, stats). Gameplay code only EMITS here;
// listeners must never mutate gameplay state. Synchronous, allocation-light.
//
// Event catalogue (payload fields):
//  'shot'       { team, kind, player, x, y, z }           kind: soldier|quadshell|spider403|eyedrone|trilobite|tank|tower-mg|tower-cannon|tower-frost
//  'impact'     { team, player, cover, x, y, z }           a projectile hit a unit or cover
//  'damage'     { team, targetTeam, targetType, amount, player, playerTarget, killed, x, y, z, fromX, fromZ }
//               player = shot fired by the player; playerTarget = the player's controlled unit got hit
//  'kill'       { team, targetTeam, targetType, player, x, y, z } team = killer team
//  'artillery-fire'   { player, x, y, z }
//  'explosion'  { x, y, z, size, kind }                    kind: shell|ambient|vehicle|tower-splash
//  'tower-built'      { type, x, z }
//  'scrap'      { amount, total }
//  'wave-start' { wave, maxWaves, level }
//  'base-damage'{ team, health }                           team whose base got breached
const listeners = new Map();

export const gameEvents = {
  on(type, fn) {
    let set = listeners.get(type);
    if (!set) listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  },
  off(type, fn) { listeners.get(type)?.delete(fn); },
  emit(type, payload) {
    const set = listeners.get(type);
    if (!set || set.size === 0) return;
    for (const fn of set) {
      try { fn(payload); } catch (err) { console.error(`[gameEvents] ${type} listener failed`, err); }
    }
  },
  has(type) { return (listeners.get(type)?.size ?? 0) > 0; },
};
