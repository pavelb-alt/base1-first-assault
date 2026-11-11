import { useEffect, useState } from 'react';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';

// Current campaign level (1 day … 5 city) as React state for visual components.
export function useLevel() {
  const [level, setLevel] = useState(gameState.currentLevel);
  useEffect(() => {
    const update = () => setLevel(gameState.currentLevel);
    EventBus.on('level-changed', update);
    return () => EventBus.off('level-changed', update);
  }, []);
  return level;
}
