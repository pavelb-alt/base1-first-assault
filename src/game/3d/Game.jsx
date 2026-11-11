import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping } from 'three';
import { GameScene } from '@/game/3d/scenes/GameScene';
import { RenderBudget } from '@/game/3d/RenderBudget';
import { renderQuality, dprCeiling } from '@/game/3d/vfx/quality';
import { PERFORMANCE, LIGHTING } from '@/game/config';

/**
 * 3D (React Three Fiber) flavor of the engine contract. The Canvas creates
 * and owns the WebGL context and sizes itself to the #game-container div.
 * Canvas props are captured once: quality changes are applied live by
 * RenderBudget (pixel ratio) and the scene components (shadows, post stack),
 * so the canvas and its WebGL context are never recreated.
 *
 * @param {{ onReady?: (state: import('@react-three/fiber').RootState) => void }} props
 */
export default function Game({ onReady }) {
  const [initialDpr] = useState(() => dprCeiling(renderQuality.get().preset));
  return (
    <Canvas
      // PCF with per-preset shadow.radius: never switch shadow type at runtime
      // (that would force every material to recompile).
      shadows={PERFORMANCE.shadows ? 'percentage' : false}
      dpr={initialDpr}
      gl={{ antialias: PERFORMANCE.antialias, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, toneMappingExposure: LIGHTING.exposure }}
      camera={{ fov: 55, near: 0.1, far: 1200, position: [0, 350, 270] }}
      onCreated={(state) => {
        if (typeof onReady === 'function') onReady(state);
      }}
    >
      <RenderBudget />
      <GameScene />
    </Canvas>
  );
}
