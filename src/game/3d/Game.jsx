import { Canvas } from '@react-three/fiber';
import { GameScene } from '@/game/3d/scenes/GameScene';

/**
 * 3D (React Three Fiber) flavor of the engine contract. The Canvas creates
 * and owns the WebGL context and sizes itself to the #game-container div.
 *
 * @param {{ onReady?: (state: import('@react-three/fiber').RootState) => void }} props
 */
export default function Game({ onReady }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.1, far: 1200, position: [0, 350, 270] }}
      onCreated={(state) => {
        if (typeof onReady === 'function') onReady(state);
      }}
    >
      <GameScene />
    </Canvas>
  );
}