import { Canvas } from '@react-three/fiber';
import { GameScene } from '@/game/3d/scenes/GameScene';

/**
 * 3D (React Three Fiber) flavor of the engine contract. The Canvas creates
 * and owns the WebGL context and sizes itself to the #game-container div.
 * Keep this single Canvas mounted for the life of the game — repeatedly
 * mounting/unmounting Canvases leaks WebGL contexts.
 *
 * @param {{ onReady?: (state: import('@react-three/fiber').RootState) => void }} props
 */
export default function Game({ onReady }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 60, near: 0.1, far: 1000, position: [0, 4, 8] }}
      onCreated={(state) => {
        if (typeof onReady === 'function') {
          onReady(state);
        }
      }}
    >
      {/* Same slate background as the 2D (Phaser) flavor. */}
      <color attach="background" args={['#0f172a']} />
      <GameScene />
    </Canvas>
  );
}
