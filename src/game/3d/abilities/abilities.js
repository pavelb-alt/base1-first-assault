import { ABILITIES, BASE, BASES, MAP } from '@/game/config';
import { EventBus } from '@/game/EventBus';
import { gameEvents } from '@/game/gameEvents';
import { gameState } from '@/game/3d/world';
import { combat } from '@/game/3d/combat';
import { battle } from '@/game/3d/battleMetrics';
import { applySplash } from '@/game/3d/ballistics';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { requestReinforcements, reinforcementCapacity } from '@/game/3d/waves';
import { explosionRequests } from '@/game/3d/objects/BattlefieldExplosions';

export const ABILITY_IDS = ['orbital', 'reinforce', 'repair'];
// Which abilities need a ground target.
export const TARGETED = { orbital: true, reinforce: false, repair: true };

// Commander ability runtime: cooldowns in battle time, queued orbital strikes, VFX pulses.
export const abilityState = {
  readyAt: { orbital: 0, reinforce: 0, repair: 0 },
  strikes: [],   // { x, z, radius, detonateAt, startedAt }
  pulses: [],    // { x, z, radius, color, startedAt, life }
  used: { orbital: 0, reinforce: 0, repair: 0 },
};

// Orbital strikes have no physical shooter; this registry-free entry carries team/kill credit.
const orbitalShooter = { id: 'orbital-strike', team: 'friendly', type: 'orbital', profile: { damage: ABILITIES.orbital.damage }, bodyRef: { current: null }, alive: true };

export function resetAbilities() {
  for (const id of ABILITY_IDS) abilityState.readyAt[id] = 0;
  abilityState.strikes.length = 0;
  abilityState.pulses.length = 0;
  EventBus.emit('abilities-changed');
}

export function abilityStatus(id) {
  const cfg = ABILITIES[id];
  const remaining = Math.max(0, abilityState.readyAt[id] - battle.elapsed);
  return { id, name: cfg.name, key: cfg.label, cost: cfg.cost, cooldown: cfg.cooldown, remaining,
    ready: remaining <= 0, affordable: towerDefenseState.scrap >= cfg.cost, targeted: !!TARGETED[id], radius: cfg.radius ?? null, used: abilityState.used[id] };
}
export const getAbilities = () => ABILITY_IDS.map(abilityStatus);

// Why an ability can't be used right now (null = usable).
export function abilityProblem(id) {
  const cfg = ABILITIES[id];
  if (!cfg) return 'Unknown ability';
  if (gameState.paused || battle.gameOver || gameState.preparing) return 'Unavailable';
  const s = abilityStatus(id);
  if (!s.ready) return `${cfg.name} recharging (${Math.ceil(s.remaining)}s)`;
  if (!s.affordable) return `Not enough scrap (${cfg.cost} needed)`;
  if (id === 'reinforce' && reinforcementCapacity() < 2) return 'Force at full strength: no room for reinforcements';
  return null;
}

function repair(x, z) {
  const cfg = ABILITIES.repair;
  let healed = 0;
  for (const u of combat.units) {
    if (u.team !== 'friendly' || !u.alive || !u.bodyRef?.current) continue;
    const p = u.bodyRef.current.translation();
    if (Math.hypot(p.x - x, p.z - z) > cfg.radius) continue;
    const before = u.health;
    u.health = Math.min(u.maxHealth, u.health + u.maxHealth * cfg.heal);
    if (u.health > before) healed++;
  }
  const fb = BASES.friendly.position;
  let baseRepaired = 0;
  if (Math.hypot(fb[0] - x, fb[2] - z) <= cfg.radius + BASE.breachRadius && !battle.gameOver) {
    const before = battle.baseHealth.friendly;
    battle.baseHealth.friendly = Math.min(BASE.health, before + cfg.baseRepair);
    baseRepaired = battle.baseHealth.friendly - before;
    if (baseRepaired > 0) gameEvents.emit('base-repair', { team: 'friendly', amount: baseRepaired, health: battle.baseHealth.friendly });
  }
  return { healed, baseRepaired };
}

// Activate an ability. Targeted abilities need world x/z. Returns { ok, problem?, ... }.
export function activateAbility(id, x, z) {
  const problem = abilityProblem(id);
  if (problem) return { ok: false, problem };
  const cfg = ABILITIES[id];
  if (TARGETED[id]) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, problem: 'Pick a target on the ground' };
    x = Math.max(-MAP.HALF, Math.min(MAP.HALF, x)); z = Math.max(-MAP.HALF, Math.min(MAP.HALF, z));
  }
  if (!towerDefenseState.trySpend(cfg.cost)) return { ok: false, problem: `Not enough scrap (${cfg.cost} needed)` };
  abilityState.readyAt[id] = battle.elapsed + cfg.cooldown;
  abilityState.used[id]++;
  const now = battle.elapsed;
  let result = {};
  if (id === 'orbital') {
    abilityState.strikes.push({ x, z, radius: cfg.radius, startedAt: now, detonateAt: now + cfg.telegraph });
  } else if (id === 'reinforce') {
    requestReinforcements(cfg.squad);
    result = { squad: cfg.squad };
  } else if (id === 'repair') {
    result = repair(x, z);
    abilityState.pulses.push({ x, z, radius: cfg.radius, color: cfg.color, startedAt: now, life: 1.1 });
  }
  gameEvents.emit('ability-used', { id, name: cfg.name, x: x ?? null, z: z ?? null, cost: cfg.cost, ...result });
  EventBus.emit('abilities-changed');
  return { ok: true, ...result };
}

// Per-frame update (driven by TacticalOverlay). Detonates telegraphed strikes.
export function updateAbilities() {
  const now = battle.elapsed;
  for (let i = abilityState.strikes.length - 1; i >= 0; i--) {
    const s = abilityState.strikes[i];
    if (now < s.detonateAt) continue;
    abilityState.strikes.splice(i, 1);
    const hits = applySplash(orbitalShooter, s.x, s.z, s.radius, ABILITIES.orbital.damage, true);
    // A central blast plus a ring of secondary detonations reads as one huge impact.
    explosionRequests.push([s.x, s.z, 3]);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2;
      explosionRequests.push([s.x + Math.cos(a) * s.radius * 0.55, s.z + Math.sin(a) * s.radius * 0.55, 1.4]);
    }
    gameEvents.emit('explosion', { x: s.x, y: 0, z: s.z, size: 3.2, kind: 'shell', player: true, source: 'orbital' });
    gameEvents.emit('orbital-impact', { x: s.x, z: s.z, radius: s.radius, hits });
    abilityState.pulses.push({ x: s.x, z: s.z, radius: s.radius * 1.3, color: ABILITIES.orbital.color, startedAt: now, life: 0.8 });
  }
  for (let i = abilityState.pulses.length - 1; i >= 0; i--) {
    if (now - abilityState.pulses[i].startedAt > abilityState.pulses[i].life) abilityState.pulses.splice(i, 1);
  }
}
