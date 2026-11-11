// Audio director: subscribes to gameEvents / EventBus, polls game state at 4 Hz
// and decides music theme + intensity, ambience, gates (pause muffle, video
// mute, low-health tunnel) and the heartbeat. Never mutates gameplay state.
import { EventBus } from '@/game/EventBus';
import { gameEvents } from '@/game/gameEvents';
import { gameState } from '@/game/3d/world';
import { combat } from '@/game/3d/combat';
import { skyBattle } from '@/game/3d/objects/skyBattleState';
import { cargoShipState } from '@/game/3d/objects/cargoShipState';
import { engine, listener, updateGates } from '@/game/audio/engine';
import {
  activity, onShot, onImpact, onDamage, onKill, onExplosion, onArtilleryFire, onScrap, onTowerBuilt,
  onBaseDamage, onWaveStart, playStinger, playHeartbeat, updateShells, updateSky,
} from '@/game/audio/sfx';
import { setMusicTheme, setMusicIntensity, setMusicAftermath } from '@/game/audio/music';
import { setAmbience, setBattleDensity, setSkyEngine, setCargoDrone } from '@/game/audio/ambience';
import { playUi } from '@/game/audio/ui';

const dir = {
  intensity: 0.15, waveBoost: 0, baseBoost: 0, aftermath: false,
  killRate: 0, shotRate: 0, farRate: 0, playerRate: 0, hurtRate: 0,
  hbNext: 0, lastStinger: 0, alive: 0, lowHealthWas: false,
};
export const directorState = dir;

const live = () => engine.ready && !engine.videoActive;
// Wrappers created once (not per event)
const h = {
  shot: (e) => { if (live()) onShot(e); },
  impact: (e) => { if (live()) onImpact(e); },
  damage: (e) => { if (live()) onDamage(e); },
  kill: (e) => { if (live()) onKill(e); },
  explosion: (e) => { if (live()) onExplosion(e); },
  artillery: (e) => { if (live()) onArtilleryFire(e); },
  scrap: (e) => { if (live()) onScrap(e); },
  tower: (e) => { if (live()) onTowerBuilt(e); },
  base: (e) => { if (live()) { onBaseDamage(e); if (e.team === 'friendly') dir.baseBoost = 0.35; } },
  wave: () => { dir.waveBoost = 0.3; dir.aftermath = false; setMusicAftermath(false); if (live()) onWaveStart(); },
};

function stinger(kind) {
  if (!engine.ready) return;
  const t = engine.ctx.currentTime;
  if (t - dir.lastStinger < 3) return;
  dir.lastStinger = t;
  playStinger(kind);
}

// --- video detection --------------------------------------------------------
let videos = null;
function detectVideo() {
  if (typeof document === 'undefined') return false;
  if (!videos) videos = document.getElementsByTagName('video'); // live collection
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    // any visible, unfinished video = cinematic on screen (even if paused / buffering)
    if (!v.ended && v.offsetWidth > 0) return true;
  }
  return false;
}

// --- 4 Hz state poll ------------------------------------------------------------
const POLL = 0.25;
function poll() {
  const video = detectVideo();
  const paused = engine.sceneMounted && !!gameState.paused;
  let gatesDirty = false;
  if (video !== engine.videoActive) { engine.videoActive = video; gatesDirty = true; }
  if (paused !== engine.paused) { engine.paused = paused; gatesDirty = true; }

  // themes
  const level = gameState.currentLevel || 1;
  const theme = video ? null : engine.sceneMounted ? level : 'menu';
  setMusicTheme(theme);
  setAmbience(video ? null : engine.sceneMounted ? level : 'menu');
  if (!engine.ready) { return; }

  // activity → rates (EMA over ~2 s)
  const k = 0.12, inv = 1 / POLL;
  dir.shotRate += (activity.shots * inv - dir.shotRate) * k;
  dir.farRate += (activity.farShots * inv - dir.farRate) * 0.25;
  dir.killRate += (activity.kills * inv - dir.killRate) * k;
  dir.playerRate += ((activity.playerShots + activity.playerKills * 4) * inv - dir.playerRate) * 0.2;
  dir.hurtRate += (activity.hurt * inv - dir.hurtRate) * 0.2;
  activity.shots = activity.farShots = activity.kills = activity.playerKills = activity.playerShots = activity.explosions = activity.hurt = 0;

  if (engine.sceneMounted) {
    let alive = 0;
    const units = combat.units;
    for (let i = 0; i < units.length; i++) { const u = units[i]; if (u.alive && u.team === 'enemy') alive++; }
    dir.alive = alive;
    dir.waveBoost *= 0.93; dir.baseBoost *= 0.95;
    let target = 0.08 + Math.min(0.45, alive / 28 * 0.45) + Math.min(0.18, dir.killRate * 0.05)
      + Math.min(0.12, dir.playerRate * 0.015) + Math.min(0.1, dir.hurtRate * 0.1) + dir.waveBoost + dir.baseBoost;
    if (alive === 0) target = Math.min(target, 0.18); // breathe between waves
    target = Math.max(0, Math.min(1, target));
    dir.intensity += (target - dir.intensity) * (target > dir.intensity ? 0.14 : 0.035);
    setMusicIntensity(dir.intensity);
    setBattleDensity(dir.farRate);
    updateSkyEngine();
    setCargoDrone(Math.min(0.22, (cargoShipState.activeShipCount || 0) * 0.07));
    updateHealth();
  } else {
    engine.lowHealth = 0;
  }
  if (gatesDirty || engine.lowHealth > 0 || dir.lowHealthWas) { updateGates(); dir.lowHealthWas = engine.lowHealth > 0; }
}

function updateSkyEngine() {
  const ships = skyBattle.ships;
  if (!skyBattle.initialized || !ships || !ships.length) { setSkyEngine(0, 0, 400); return; }
  let best = 1e9, bx = 0, bz = 0;
  for (let i = 0; i < ships.length; i++) {
    const s = ships[i]; if (!s.alive) continue;
    const dx = s.position.x - listener.x, dy = s.position.y - listener.y, dz = s.position.z - listener.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) { best = d; bx = dx; bz = dz; }
  }
  const d = Math.sqrt(best);
  const near = Math.max(0, 1 - d / 80);
  const hd = Math.sqrt(bx * bx + bz * bz) || 1;
  const pan = ((bx * listener.rx + bz * listener.rz) / hd) * 0.7;
  setSkyEngine(near * near * 0.22, pan, 350 + near * 2600);
}

function updateHealth() {
  let ratio = 1;
  if (gameState.mode === 'third_person' && !gameState.paused) {
    try {
      const u = window.game?.getControlledUnit?.();
      if (u && u.maxHealth > 0 && u.health > 0) ratio = u.health / u.maxHealth;
    } catch { /* ignore */ }
  }
  const low = ratio < 0.3;
  engine.lowHealth = low ? Math.min(1, (1 - ratio / 0.3)) * 0.55 + 0.15 : 0;
  if (!low || engine.videoActive) { dir.hbNext = 0; return; }
  const t = engine.ctx.currentTime;
  const interval = 0.55 + (ratio / 0.3) * 0.4;
  if (dir.hbNext < t) dir.hbNext = t + 0.05;
  while (dir.hbNext < t + POLL + 0.1) {
    playHeartbeat(dir.hbNext - t, 0.32 + (1 - ratio / 0.3) * 0.25);
    dir.hbNext += interval;
  }
}

// --- per-frame hook from the R3F bridge -------------------------------------------
export function audioFrame() {
  if (!live() || engine.paused) return;
  updateShells();
  updateSky();
}
export function setSceneMounted(v) {
  engine.sceneMounted = !!v;
  if (!v) { listener.valid = false; engine.paused = false; engine.lowHealth = 0; updateGates(); }
  poll();
}

// --- init -----------------------------------------------------------------------
let started = false;
export function initDirector() {
  if (started) return;
  started = true;
  gameEvents.on('shot', h.shot);
  gameEvents.on('impact', h.impact);
  gameEvents.on('damage', h.damage);
  gameEvents.on('kill', h.kill);
  gameEvents.on('explosion', h.explosion);
  gameEvents.on('artillery-fire', h.artillery);
  gameEvents.on('scrap', h.scrap);
  gameEvents.on('tower-built', h.tower);
  gameEvents.on('base-damage', h.base);
  gameEvents.on('wave-start', h.wave);

  EventBus.on('game-over', (result) => {
    dir.aftermath = true; setMusicAftermath(true);
    stinger(result === 'victory' ? 'victory' : 'defeat');
  });
  EventBus.on('level-transition', () => { dir.aftermath = true; setMusicAftermath(true); stinger('victory'); });
  EventBus.on('level-changed', () => { dir.aftermath = false; setMusicAftermath(false); dir.intensity = 0.15; poll(); });
  EventBus.on('reset-game', () => { dir.aftermath = false; setMusicAftermath(false); dir.intensity = 0.15; dir.waveBoost = dir.baseBoost = 0; });
  EventBus.on('pause-game', () => setTimeout(poll, 0));
  EventBus.on('resume-game', () => setTimeout(poll, 0));
  EventBus.on('mode-changed', (mode) => { if (live() && engine.sceneMounted) playUi(mode === 'third_person' ? 'open' : 'close'); });
  EventBus.on('soldier-error', () => { if (live()) playUi('error'); });
  EventBus.on('no-eligible-soldier', () => { if (live()) playUi('error'); });

  if (typeof document !== 'undefined') {
    // react instantly when a cinematic starts/stops (media events don't bubble; capture does)
    const kick = () => setTimeout(poll, 0);
    for (const ev of ['play', 'playing', 'pause', 'ended', 'emptied']) document.addEventListener(ev, kick, true);
  }
  setInterval(poll, POLL * 1000);
}
