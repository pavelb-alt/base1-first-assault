// Campaign progression + per-mission live stats.
// - missionStats: live counters for the current mission, fed by gameEvents. Read-only for UI.
// - progression: persisted campaign progress (unlocked levels, best results per level).
import { useSyncExternalStore } from 'react';
import { gameEvents } from '@/game/gameEvents';

const STORAGE_KEY = 'base1.progress.v1';
export const TOTAL_LEVELS = 5;

// ---------------------------------------------------------------------------
// Live mission stats
// ---------------------------------------------------------------------------
const freshStats = () => ({
  level: 1,
  startedAt: 0,           // performance.now() ms
  endedAt: 0,
  enemiesKilled: 0,       // by any friendly source
  playerKills: 0,
  playerShots: 0,
  playerHits: 0,
  playerDamageDealt: 0,
  playerDamageTaken: 0,
  friendlyLosses: 0,
  towersBuilt: 0,
  scrapEarned: 0,
  wavesSurvived: 0,
  baseHealth: 100,
  killStreak: 0,          // current player streak (resets when the player's unit takes lethal damage)
  bestStreak: 0,
});

export const missionStats = freshStats();

export function resetMissionStats(level = 1) {
  Object.assign(missionStats, freshStats(), { level, startedAt: performance.now() });
}
export function missionElapsedSeconds() {
  if (!missionStats.startedAt) return 0;
  return ((missionStats.endedAt || performance.now()) - missionStats.startedAt) / 1000;
}
export function missionAccuracy() {
  return missionStats.playerShots ? missionStats.playerHits / missionStats.playerShots : 0;
}

gameEvents.on('shot', e => { if (e.player) missionStats.playerShots++; });
gameEvents.on('damage', e => {
  if (e.player) { missionStats.playerHits++; missionStats.playerDamageDealt += e.amount; }
  if (e.playerTarget) {
    missionStats.playerDamageTaken += e.amount;
    if (e.killed) missionStats.killStreak = 0;
  }
});
gameEvents.on('kill', e => {
  if (e.targetTeam === 'enemy') missionStats.enemiesKilled++;
  if (e.targetTeam === 'friendly') missionStats.friendlyLosses++;
  if (e.player && e.targetTeam === 'enemy') {
    missionStats.playerKills++;
    missionStats.killStreak++;
    missionStats.bestStreak = Math.max(missionStats.bestStreak, missionStats.killStreak);
  }
});
gameEvents.on('tower-built', () => { missionStats.towersBuilt++; });
gameEvents.on('scrap', e => { if (e.amount > 0) missionStats.scrapEarned += e.amount; });
gameEvents.on('wave-start', e => { missionStats.wavesSurvived = Math.max(missionStats.wavesSurvived, e.wave - 1); });
gameEvents.on('base-damage', e => { if (e.team === 'friendly') missionStats.baseHealth = e.health; });

// ---------------------------------------------------------------------------
// Persisted campaign progress
// ---------------------------------------------------------------------------
const freshProgress = () => ({ unlockedLevel: 1, levels: {} }); // levels[id] = { stars, bestTime, bestKills, completed }

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...freshProgress(), ...JSON.parse(raw) } : freshProgress();
  } catch { return freshProgress(); }
}
let progress = typeof window === 'undefined' ? freshProgress() : load();
const listeners = new Set();
function save() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* storage unavailable */ }
  for (const fn of listeners) fn(progress);
}

// Stars: 1 = completed, 2 = base health >= 50, 3 = base health >= 90.
export function starsFor(result, baseHealth) {
  if (result !== 'victory') return 0;
  return 1 + (baseHealth >= 50 ? 1 : 0) + (baseHealth >= 90 ? 1 : 0);
}

export const progression = {
  get: () => progress,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  isUnlocked: level => level <= progress.unlockedLevel,
  /** Call once when a level is cleared or lost. Returns { stars, newRecord }. */
  recordMissionResult(level, result) {
    missionStats.endedAt = performance.now();
    const stars = starsFor(result, missionStats.baseHealth);
    const prev = progress.levels[level] ?? { stars: 0, bestTime: null, bestKills: 0, completed: false };
    const time = missionElapsedSeconds();
    const next = {
      stars: Math.max(prev.stars, stars),
      completed: prev.completed || result === 'victory',
      bestTime: result === 'victory' ? (prev.bestTime == null ? time : Math.min(prev.bestTime, time)) : prev.bestTime,
      bestKills: Math.max(prev.bestKills, missionStats.playerKills),
    };
    const newRecord = stars > prev.stars || (result === 'victory' && (prev.bestTime == null || time < prev.bestTime));
    progress = { ...progress, levels: { ...progress.levels, [level]: next },
      unlockedLevel: result === 'victory' ? Math.max(progress.unlockedLevel, Math.min(TOTAL_LEVELS, level + 1)) : progress.unlockedLevel };
    save();
    return { stars, newRecord };
  },
  reset() { progress = freshProgress(); save(); },
};

export function useProgression() {
  return useSyncExternalStore(progression.subscribe, progression.get, progression.get);
}
