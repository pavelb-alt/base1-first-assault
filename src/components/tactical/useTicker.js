import { useEffect, useReducer } from 'react';

// Re-render every `ms` while `active` — for countdowns, cooldowns and polled module state.
export function useTicker(ms = 200, active = true) {
  const [tick, bump] = useReducer(n => n + 1, 0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(bump, ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return tick;
}

export const TOWER_ORDER = ['mg', 'cannon', 'frost'];
export const fmtSeconds = s => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.ceil(s)}s`);
