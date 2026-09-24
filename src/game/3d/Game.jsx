import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping } from 'three';
import { GameScene } from '@/game/3d/scenes/GameScene';
import { PERFORMANCE, LIGHTING } from '@/game/config';

/**
 * 3D (React Three Fiber) flavor of the engine contract. The Canvas creates
 * and owns the WebGL context and sizes itself to the #game-container div.
 *
 * @param {{ onReady?: (state: import('@react-three/fiber').RootState) => void }} props
 */
export default function Game({ onReady }) {
  return (
    <Canvas
      shadows={PERFORMANCE.shadows ? 'soft' : false}
      dpr={[PERFORMANCE.minDpr, PERFORMANCE.maxDpr]}
      gl={{ antialias: PERFORMANCE.antialias, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, toneMappingExposure: LIGHTING.exposure }}
      camera={{ fov: 55, near: 0.1, far: 1200, position: [0, 350, 270] }}
      onCreated={(state) => {
        if (typeof onReady === 'function') onReady(state);
      }}
    >
      <GameScene />
    </Canvas>
  );
}