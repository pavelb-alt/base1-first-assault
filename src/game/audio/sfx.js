// Gameplay sound effects: positional weapon/impact/death/explosion voices and
// non-positional player feedback. Every handler culls by distance and rate
// limits BEFORE touching Web Audio, so 1000+ shots/s cost a few multiplies each.
import { engine, bus, sp, spatial, playBuffer, limiter, allow, duckMusic } from '@/game/audio/engine';
import { getSound } from '@/game/audio/sounds';
import { artilleryState } from '@/game/3d/objects/artilleryState';
import { skyBattle } from '@/game/3d/objects/skyBattleState';
import { ARTILLERY } from '@/game/config';

const R = Math.random;
const jitter = (amt) => 1 - amt + R() * amt * 2;

// Activity counters read (and decayed) by the director for music intensity and
// the distant-battle bed. Plain numbers, no allocation.
export const activity = { shots: 0, farShots: 0, kills: 0, playerKills: 0, playerShots: 0, explosions: 0, hurt: 0 };

// ---------------------------------------------------------------------------
// Weapon profiles
const mk = (snd, gain, ref, max, gap, burst = 3, rate = 1) => ({ snd, gain, ref, max, rate, lim: limiter(gap, burst), plim: limiter(0.03, 2) });
const SHOT = {
  soldier: mk('rifle', 0.3, 3, 75, 0.028),
  quadshell: mk('plasma', 0.26, 3, 75, 0.034),
  spider403: mk('needle', 0.22, 3, 65, 0.03),
  eyedrone: mk('zap', 0.2, 3.5, 80, 0.04),
  trilobite: mk('growl', 0.42, 5, 100, 0.07, 2),
  tank: mk('tank', 0.62, 8, 170, 0.1, 2),
  'tower-mg': mk('tower_mg', 0.32, 4, 90, 0.035),
  'tower-cannon': mk('tower_cannon', 0.5, 6, 140, 0.09, 2),
  'tower-frost': mk('tower_frost', 0.28, 4, 80, 0.06),
};
const PLAYER_SHOT = {
  soldier: { snd: 'rifle_player', gain: 0.5, wet: 0.2, duck: 0 },
  tank: { snd: 'tank', gain: 0.9, wet: 0.35, duck: 0.35 },
  'tower-mg': { snd: 'tower_mg', gain: 0.55, wet: 0.18, duck: 0 },
  'tower-cannon': { snd: 'tower_cannon', gain: 0.75, wet: 0.3, duck: 0.2 },
  'tower-frost': { snd: 'tower_frost', gain: 0.5, wet: 0.25, duck: 0 },
};

export function onShot(e) {
  if (!engine.ready) return;
  activity.shots++;
  const kind = e.kind;
  if (e.player) {
    activity.playerShots++;
    const ps = PLAYER_SHOT[kind] || PLAYER_SHOT.soldier;
    const prof = SHOT[kind] || SHOT.soldier;
    if (!allow(prof.plim, engine.ctx.currentTime)) return;
    playBuffer(getSound(ps.snd), bus.sfx, ps.gain, (R() - 0.5) * 0.06, jitter(0.03), 20000, ps.wet, 100, 'sfx');
    if (ps.duck) duckMusic(ps.duck, 0.01, 0.15, 0.6);
    return;
  }
  const p = SHOT[kind] || SHOT.soldier;
  const g = spatial(e.x, e.y, e.z, p.ref, p.max) * p.gain;
  if (g < 0.006) { activity.farShots++; return; }
  // closer shots are allowed at a much higher rate than distant ones
  if (!allow(p.lim, engine.ctx.currentTime, 0.35 + sp.dist / 16)) { activity.farShots += 0.6; return; }
  playBuffer(getSound(p.snd), bus.sfx, g, sp.pan, p.rate * jitter(0.06), sp.cutoff, sp.wet * 0.7, g, 'sfx');
}

// ---------------------------------------------------------------------------
// Impacts / damage
const limCover = limiter(0.03, 3), limBody = limiter(0.035, 3), limTick = limiter(0.045, 2), limKill = limiter(0.07, 2), limHurt = limiter(0.11, 1);
const METAL = { tank: 1, artillery: 1, tower: 1 };
let killStreak = 0, lastKill = 0;

export function onImpact(e) {
  if (!engine.ready || !e.cover) return;
  const g = spatial(e.x, e.y, e.z, 2, e.player ? 60 : 35) * (e.player ? 0.38 : 0.2);
  if (g < 0.006) return;
  if (!allow(limCover, engine.ctx.currentTime, e.player ? 0.4 : 0.5 + sp.dist / 10)) return;
  playBuffer(getSound('imp_cover'), bus.sfx, g, sp.pan, jitter(0.15), sp.cutoff, sp.wet * 0.5, g * (e.player ? 3 : 1), 'sfx');
}

export function onDamage(e) {
  if (!engine.ready) return;
  const t = engine.ctx.currentTime;
  if (e.player && e.targetTeam !== 'friendly') {
    if (e.killed) {
      if (t - lastKill < 1.6) killStreak++; else killStreak = 0;
      lastKill = t;
      if (allow(limKill, t)) playBuffer(getSound('kill_confirm'), bus.gameMix, 0.36, 0, 1 + Math.min(killStreak, 5) * 0.06, 20000, 0.05, 90, 'ui');
    } else if (allow(limTick, t)) {
      playBuffer(getSound('hit_tick'), bus.gameMix, 0.16, 0, jitter(0.04), 20000, 0, 80, 'ui');
    }
  }
  if (e.playerTarget) {
    activity.hurt++;
    if (allow(limHurt, t)) {
      const amt = Math.min(1.3, Math.max(0.5, (e.amount || 10) / 18));
      playBuffer(getSound('hurt'), bus.gameMix, 0.42 * amt, (R() - 0.5) * 0.2, jitter(0.06), 20000, 0, 95, 'ui');
    }
    return;
  }
  // body hit at the target
  const snd = METAL[e.targetType] ? 'imp_metal' : e.targetTeam === 'enemy' ? 'imp_chitin' : 'imp_flesh';
  const g = spatial(e.x, e.y, e.z, 2.5, 40) * (e.player ? 0.32 : 0.2);
  if (g < 0.006 || !allow(limBody, t, 0.5 + sp.dist / 10)) return;
  playBuffer(getSound(snd), bus.sfx, g, sp.pan, jitter(0.12), sp.cutoff, sp.wet * 0.4, g, 'sfx');
}

// ---------------------------------------------------------------------------
// Deaths
const DEATH = { quadshell: 'death_quadshell', spider403: 'death_spider403', eyedrone: 'death_eyedrone', trilobite: 'death_trilobite' };
const limScreech = limiter(0.12, 2), limSoldierDeath = limiter(0.15, 2), limVehicle = limiter(0.3, 2);

export function onKill(e) {
  if (!engine.ready) return;
  activity.kills++;
  if (e.player) activity.playerKills++;
  const t = engine.ctx.currentTime, tt = e.targetType;
  if (tt === 'tank' || tt === 'artillery') {
    const g = spatial(e.x, e.y, e.z, 10, 220) * 0.85;
    if (g < 0.006 || !allow(limVehicle, t)) return;
    playBuffer(getSound('vehicle_destroyed'), bus.sfx, g, sp.pan, jitter(0.05), sp.cutoff, sp.wet, 50 + g, 'sfx');
    duckMusic(Math.min(0.45, g * 0.6), 0.03, 0.6, 1.2);
    return;
  }
  if (e.targetTeam === 'enemy') {
    const big = tt === 'trilobite';
    const g = spatial(e.x, e.y, e.z, big ? 6 : 3.5, big ? 120 : 80) * (big ? 0.5 : 0.3);
    if (g < 0.006 || !allow(limScreech, t, big ? 0.3 : 0.6 + sp.dist / 20)) return;
    playBuffer(getSound(DEATH[tt] || DEATH.quadshell), bus.sfx, g, sp.pan, jitter(0.08), sp.cutoff, sp.wet * 0.8, g * (big ? 4 : 1.5), 'sfx');
    return;
  }
  const g = spatial(e.x, e.y, e.z, 3, 45) * 0.32;
  if (g < 0.006 || !allow(limSoldierDeath, t)) return;
  playBuffer(getSound('death_soldier'), bus.sfx, g, sp.pan, jitter(0.08), sp.cutoff, sp.wet * 0.5, g, 'sfx');
}

// ---------------------------------------------------------------------------
// Explosions, artillery, whistles
const recentShells = new Float64Array(8 * 3); // x, z, time ring
let shellCursor = 0;
const limExplosion = limiter(0.08, 3), limRumble = limiter(0.35, 2), limArtyFire = limiter(0.1, 3), limWhistle = limiter(0.2, 3);

function rumble(x, y, z, gainScale, delay) {
  const g = spatial(x, y, z, 30, 420) * gainScale;
  if (g < 0.01 || !allow(limRumble, engine.ctx.currentTime)) return;
  playBuffer(getSound('rumble'), bus.sfx, g, sp.pan * 0.6, jitter(0.08), 700, sp.wet * 0.6 + 0.1, g * 0.5, 'sfx', delay);
}

function isDuplicateOfShell(x, z, t) {
  for (let i = 0; i < 8; i++) {
    const o = i * 3;
    if (t - recentShells[o + 2] < 0.35) { const dx = recentShells[o] - x, dz = recentShells[o + 1] - z; if (dx * dx + dz * dz < 9) return true; }
  }
  return false;
}

export function onExplosion(e) {
  if (!engine.ready) return;
  const t = engine.ctx.currentTime;
  const kind = e.kind;
  if (kind === 'ambient' && isDuplicateOfShell(e.x, e.z, t)) return;
  if (kind === 'shell') {
    const o = shellCursor * 3; recentShells[o] = e.x; recentShells[o + 1] = e.z; recentShells[o + 2] = t; shellCursor = (shellCursor + 1) % 8;
  }
  activity.explosions++;
  let snd = 'exp_med', gain = 0.72, ref = 8, max = 260;
  if (kind === 'shell' || kind === 'vehicle') { snd = 'exp_big'; gain = 0.95; ref = 10; max = 300; }
  else if (kind === 'tower-splash') { snd = 'exp_small'; gain = 0.42; ref = 5; max = 130; }
  const g = spatial(e.x, e.y || 0, e.z, ref, max) * gain;
  if (g >= 0.006 && allow(limExplosion, t)) {
    playBuffer(getSound(snd), bus.sfx, g, sp.pan, jitter(0.07), Math.max(sp.cutoff, 900), sp.wet, 40 + g * 10, 'sfx');
    if (g > 0.15) duckMusic(Math.min(0.5, g * 0.55), 0.02, 0.35, 1.0);
  }
  if (kind !== 'tower-splash') {
    const d = sp.dist;
    rumble(e.x, e.y || 0, e.z, kind === 'shell' ? 0.5 : 0.35, Math.min(0.8, d / 140));
  }
}

export function onArtilleryFire(e) {
  if (!engine.ready) return;
  const t = engine.ctx.currentTime;
  if (e.player) {
    playBuffer(getSound('artillery'), bus.sfx, 1.0, 0, jitter(0.03), 20000, 0.4, 100, 'sfx');
    duckMusic(0.45, 0.01, 0.4, 1.2);
    return;
  }
  const g = spatial(e.x, e.y, e.z, 10, 300) * 0.8;
  if (g < 0.006 || !allow(limArtyFire, t)) return;
  playBuffer(getSound('artillery'), bus.sfx, g, sp.pan, jitter(0.06), Math.max(900, sp.cutoff), sp.wet, 40 + g * 10, 'sfx');
  rumble(e.x, e.y, e.z, 0.3, Math.min(0.6, sp.dist / 160));
}

const WHISTLE_LEN = 1.6;
const whistled = new Uint8Array(128);
export function updateShells() {
  if (!engine.ready) return;
  const shells = artilleryState.shells, flight = ARTILLERY.shellFlightTime || 2.4;
  const lead = 1 - WHISTLE_LEN / flight;
  for (let i = 0; i < shells.length && i < 128; i++) {
    const s = shells[i];
    if (!s.active) { whistled[i] = 0; continue; }
    if (whistled[i] || s.t < lead) continue;
    whistled[i] = 1;
    const remaining = (1 - s.t) * flight;
    if (remaining < 0.35) continue;
    const g = spatial(s.to.x, 0, s.to.z, 12, 110) * 0.3;
    if (g < 0.006 || !allow(limWhistle, engine.ctx.currentTime)) continue;
    const rate = Math.min(1.6, Math.max(0.9, WHISTLE_LEN / remaining));
    playBuffer(getSound('whistle'), bus.sfx, g, sp.pan, rate, sp.cutoff, sp.wet * 0.5, 30 + g * 10, 'sfx');
  }
}

// ---------------------------------------------------------------------------
// Sky battle — far overhead lasers & bursts (very quiet)
let skyBolts = null, skyExps = null, skyFrame = 0;
const limLaser = limiter(0.14, 2), limSkyExp = limiter(0.5, 1);
export function updateSky() {
  if (!engine.ready || !skyBattle.initialized) return;
  if ((++skyFrame & 1) !== 0) return; // every other frame is plenty
  const bolts = skyBattle.bolts, exps = skyBattle.explosions;
  if (!skyBolts || skyBolts.length !== bolts.length) skyBolts = new Uint8Array(bolts.length);
  if (!skyExps || skyExps.length !== exps.length) skyExps = new Uint8Array(exps.length);
  const t = engine.ctx.currentTime;
  for (let i = 0; i < bolts.length; i++) {
    const b = bolts[i], was = skyBolts[i];
    skyBolts[i] = b.active ? 1 : 0;
    if (!b.active || was) continue;
    const g = spatial(b.position.x, b.position.y, b.position.z, 20, 150) * 0.1;
    if (g < 0.004 || !allow(limLaser, t)) continue;
    playBuffer(getSound('sky_laser'), bus.sfx, g, sp.pan, jitter(0.15) * (b.team === 'enemy' ? 0.8 : 1.05), sp.cutoff * 0.5, 0.35, g * 0.2, 'sfx');
  }
  for (let i = 0; i < exps.length; i++) {
    const x = exps[i], was = skyExps[i];
    skyExps[i] = x.active ? 1 : 0;
    if (!x.active || was) continue;
    const g = spatial(x.position.x, x.position.y, x.position.z, 25, 220) * 0.32;
    if (g < 0.005 || !allow(limSkyExp, t)) continue;
    playBuffer(getSound('exp_small'), bus.sfx, g, sp.pan, jitter(0.1) * 0.7, 1400, 0.5, g, 'sfx');
  }
}

// ---------------------------------------------------------------------------
// Player feedback / game-flow stingers (non-positional, crisp: bypass health LP)
const limScrap = limiter(0.08, 2), limKlaxon = limiter(3.5, 1), limObjective = limiter(2, 1), limHorn = limiter(2, 1);

export function playHeartbeat(delay, gain) {
  playBuffer(getSound('heartbeat'), bus.gameMix, gain, 0, 1, 20000, 0, 99, 'ui', delay);
}
export function onScrap(e) {
  if (!engine.ready || !(e.amount > 0)) return;
  if (!allow(limScrap, engine.ctx.currentTime)) return;
  playBuffer(getSound('scrap'), bus.gameMix, 0.13, 0, jitter(0.02) * (e.amount >= 50 ? 1.12 : 1), 20000, 0.05, 60, 'ui');
}
export function onTowerBuilt(e) {
  if (!engine.ready) return;
  const g = Math.max(0.25, spatial(e.x, 0, e.z, 10, 200)) * 0.6;
  playBuffer(getSound('tower_deploy'), bus.sfx, g, sp.pan, jitter(0.03), Math.max(2500, sp.cutoff), sp.wet * 0.6 + 0.1, 80, 'sfx');
}
export function onBaseDamage(e) {
  if (!engine.ready) return;
  const t = engine.ctx.currentTime;
  if (e.team === 'friendly') {
    if (!allow(limKlaxon, t)) return;
    playBuffer(getSound('klaxon'), bus.gameMix, 0.3, 0, 1, 20000, 0.35, 98, 'ui');
    duckMusic(0.3, 0.05, 1.5, 1.2);
  } else if (allow(limObjective, t)) {
    playBuffer(getSound('objective'), bus.gameMix, 0.26, 0, 1, 20000, 0.3, 70, 'ui');
  }
}
export function onWaveStart(e) {
  if (!engine.ready || !allow(limHorn, engine.ctx.currentTime)) return;
  if (e?.boss || e?.final) {
    // Boss / final wave: a deeper, longer horn with an alarm underneath.
    playBuffer(getSound('horn'), bus.gameMix, 0.62, 0, 0.72, 20000, 0.55, 97, 'ui');
    playBuffer(getSound('klaxon'), bus.gameMix, 0.18, 0, 0.85, 20000, 0.4, 96, 'ui', 0.45);
    duckMusic(0.75, 0.15, 2.6, 2.6);
    return;
  }
  playBuffer(getSound('horn'), bus.gameMix, 0.5, 0, 1, 20000, 0.45, 97, 'ui');
  duckMusic(0.55, 0.15, 1.6, 2.0);
}
export function onBossDefeated() {
  if (!engine.ready) return;
  playBuffer(getSound('objective'), bus.gameMix, 0.4, 0, 0.9, 20000, 0.45, 99, 'ui');
  duckMusic(0.5, 0.1, 1.5, 1.5);
}
export function playStinger(kind) {
  if (!engine.ready) return;
  playBuffer(getSound(kind === 'victory' ? 'victory' : 'defeat'), bus.gameMix, 0.55, 0, 1, 20000, 0.5, 120, 'ui');
  duckMusic(0.9, 0.3, 4, 3);
}
