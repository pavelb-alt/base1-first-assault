import { useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import { PERFORMANCE } from '@/game/config';

// One resolution controller. Shadows and bloom remain on at every quality step;
// only GPU pixel cost changes, never simulation, input or combat timing.
export function RenderBudget() {
  const get = useThree(state => state.get);
  const set = useThree(state => state.set);
  const adapt = useCallback(({ factor }) => {
    if (!window.game?.ready) return;
    const state = get();
    const ceiling = state.viewport.initialDpr;
    const dpr = PERFORMANCE.minDpr + factor * (ceiling - PERFORMANCE.minDpr);
    set({ performance: { ...state.performance, current: dpr / ceiling } });
  }, [get, set]);
  return <>
    <PerformanceMonitor factor={1} step={0.1} iterations={8}
      bounds={() => [PERFORMANCE.targetFps, PERFORMANCE.targetFps + 15]}
      onChange={adapt} />
    <AdaptiveDpr />
  </>;
}