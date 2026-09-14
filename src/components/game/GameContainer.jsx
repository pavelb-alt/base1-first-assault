import { forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import Game from '@/game/main';
import { EventBus } from '@/game/EventBus';

/**
 * Engine-agnostic mount point for whichever flavor `@/game/main` points at
 * (2D/Phaser or 3D/React Three Fiber).
 *
 * Both flavors honor the same contract: the engine module default-exports a
 * React component `Game({ onReady })` that renders the running game inside
 * this #game-container div, calls onReady(handle) once the engine is live
 * (2D: the Phaser.Game; 3D: the R3F root state), and emits
 * 'current-scene-ready' on the EventBus when the scene is ready.
 *
 * @typedef {object} GameContainerProps
 * @property {string=} className
 * @property {(scene: unknown) => void=} currentActiveScene
 *
 * Memoized on purpose: overlay state in the page around it (HUD timers,
 * score, toasts) can re-render many times a second, and without memo every
 * one of those renders would cascade through the engine mount — in 3D that
 * re-reconciles the whole R3F scene graph and visibly stutters gameplay.
 */

/** @type {import('react').NamedExoticComponent<GameContainerProps & import('react').RefAttributes<unknown>>} */
export const GameContainer = memo(forwardRef(function GameContainer(props, ref) {
  const { className = '', currentActiveScene } = props;
  const game = useRef(null);
  const activeScene = useRef(null);
  const onSceneReady = useRef(currentActiveScene);

  useEffect(() => {
    onSceneReady.current = currentActiveScene;
  }, [currentActiveScene]);

  useImperativeHandle(ref, () => ({
    /** 2D: the Phaser.Game instance. 3D: the R3F root state ({ gl, scene, camera, ... }). */
    get game() {
      return game.current;
    },
    /** Whatever the active scene emitted with 'current-scene-ready'. */
    get scene() {
      return activeScene.current;
    }
  }), []);

  // Subscribe in a layout effect so the listener exists before either engine
  // finishes booting (both emit asynchronously, after mount).
  useLayoutEffect(() => {
    const handleSceneReady = (scene) => {
      activeScene.current = scene;

      if (typeof onSceneReady.current === 'function') {
        onSceneReady.current(scene);
      }
    };

    EventBus.on('current-scene-ready', handleSceneReady);

    return () => {
      EventBus.off('current-scene-ready', handleSceneReady);
    };
  }, []);

  return (
    <div id="game-container" className={['game-container', className].filter(Boolean).join(' ')}>
      <Game onReady={(handle) => { game.current = handle; }} />
    </div>
  );
}));
