import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PERFORMANCE } from '@/game/config';

// Resolution is visual-only; never slow simulation or input to meet the budget.
// Slow recovery and a wide dead band prevent constant resolution oscillation.
export function RenderBudget() {
  const setDpr = useThree(state => state.setDpr);
  const budget = useRef({ seconds: 0, frames: 0, healthy: 0, dpr: PERFORMANCE.maxDpr });
  useFrame((_, delta) => {
    if (!window.game?.ready || delta > 0.5) return;
    const b = budget.current;
    b.seconds += delta;
    b.frames++;
    if (b.seconds < 2) return;
    const fps = b.frames / b.seconds;
    let next = b.dpr;
    if (fps < PERFORMANCE.targetFps) {
      next = Math.max(PERFORMANCE.minDpr, b.dpr - 0.1);
      b.healthy = 0;
    } else if (fps > PERFORMANCE.targetFps + 12) {
      b.healthy += b.seconds;
      if (b.healthy >= 12) {
        next = Math.min(PERFORMANCE.maxDpr, b.dpr + 0.05);
        b.healthy = 0;
      }
    } else b.healthy = 0;
    b.seconds = 0;
    b.frames = 0;
    if (next !== b.dpr) { b.dpr = next; setDpr(next); }
  });
  return null;
}