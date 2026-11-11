// Player settings — persisted to localStorage, shared by UI, audio, rendering and input.
// Read synchronously anywhere via `settings.get()`; subscribe with `settings.subscribe(fn)`.
// React components can use the `useSettings()` hook.
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'base1.settings.v1';

export const DEFAULT_SETTINGS = {
  // Audio (0..1)
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.9,
  uiVolume: 0.7,
  // Graphics
  quality: 'high',          // 'low' | 'medium' | 'high' | 'ultra'
  postProcessing: true,
  screenShake: 1,           // 0..1 multiplier
  showDamageNumbers: true,
  // Input
  mouseSensitivity: 1,      // multiplier on CAMERA.thirdPerson.mouseSensitivity
  invertY: false,
  // Gameplay
  difficulty: 'normal',     // 'easy' | 'normal' | 'hard'
  showTutorialHints: true,
};

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current = typeof window === 'undefined' ? { ...DEFAULT_SETTINGS } : load();
const listeners = new Set();

export const settings = {
  get: () => current,
  set(patch) {
    current = { ...current, ...patch };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* storage unavailable */ }
    for (const fn of listeners) fn(current);
  },
  reset() { settings.set({ ...DEFAULT_SETTINGS }); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

export function useSettings() {
  return useSyncExternalStore(settings.subscribe, settings.get, settings.get);
}
