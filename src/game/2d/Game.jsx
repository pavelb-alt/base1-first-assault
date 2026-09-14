import { useLayoutEffect, useRef } from 'react';
import StartGame from '@/game/2d/main';

/**
 * 2D (Phaser) flavor of the engine contract: mounts the Phaser game into the
 * #game-container div rendered by GameContainer and tears it down on unmount.
 * Renders no DOM of its own.
 *
 * @param {{ onReady?: (game: import('phaser').Game) => void }} props
 */
export default function Game({ onReady }) {
  const gameRef = useRef(null);

  useLayoutEffect(() => {
    if (!gameRef.current) {
      // The id must match the div rendered by GameContainer.
      gameRef.current = StartGame('game-container');
      if (typeof onReady === 'function') {
        onReady(gameRef.current);
      }
    }

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
    // Mount-once effect; onReady is intentionally captured at mount.
  }, []);

  return null;
}
