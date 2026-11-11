// UI-only preferences owned by the shell (kept out of settings.js so other systems
// never depend on them). Persisted to localStorage.
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'base1.ui.v1';
const DEFAULTS = {
  unlockAllMissions: false, // developer: play any mission from Mission Select
  hintsCollapsed: false,    // in-game controls hint panel
};

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

let current = typeof window === 'undefined' ? { ...DEFAULTS } : load();
const listeners = new Set();

export const uiPrefs = {
  get: () => current,
  set(patch) {
    current = { ...current, ...patch };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* storage unavailable */ }
    for (const fn of listeners) fn(current);
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

export function useUiPrefs() {
  return useSyncExternalStore(uiPrefs.subscribe, uiPrefs.get, uiPrefs.get);
}
