import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DepthOfField } from '@react-three/postprocessing';
import { Vector3 } from 'three';
import { gameState } from '@/game/3d/world';
import { LIGHTING } from '@/game/config';

const forward = new Vector3();

// Follow the camera's ground-plane focus, not a fixed point in the world.
// Keeping the playable ground sharp at every strategy zoom is more important
// than blurring nearby enemies; only the far background softens.
export function BattlefieldDepthOfField() {
  const effect = useRef(null);
  useFrame(({ camera }) => {
    if (!effect.current) return;
    const strategic = gameState.mode === 'strategic';
    camera.getWorldDirection(forward);
    const groundDistance = forward.y < -0.05 ? camera.position.y / -forward.y : 90;
    const focus = strategic ? Math.max(10, groundDistance) : LIGHTING.thirdPersonFocus;
    const range = strategic ? Math.max(LIGHTING.strategicFocusRange, focus * 1.15) : LIGHTING.thirdPersonFocusRange;
    effect.current.cocMaterial.focusDistance = focus;
    effect.current.cocMaterial.focusRange = range;
  });
  return <DepthOfField ref={effect} focusDistance={90} focusRange={110}
    bokehScale={LIGHTING.depthOfFieldStrength} resolutionScale={0.4} />;
}