import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer } from 'three';
import { PERFORMANCE } from '@/game/config';
import { gameState } from '@/game/3d/world';

// Only visual animation is throttled. Movement, targeting, physics and shots
// still run at their original cadence, including for distant/offscreen units.
export function useUnitVisuals(animations, model, groupRef, bodyRef, active, team, id, slot) {
  const state = useMemo(() => {
    const meshes = [];
    model.traverse(node => { if (node.isMesh) meshes.push(node); });
    return { mixer: new AnimationMixer(), actions: {}, meshes, shadows: null };
  }, [animations, model]);
  const visualFrame = useRef(true);
  const elapsed = useRef((slot % PERFORMANCE.farAnimationHz) / PERFORMANCE.farAnimationHz ** 2);

  useLayoutEffect(() => {
    const root = groupRef.current;
    const cached = {};
    for (const clip of animations) {
      Object.defineProperty(state.actions, clip.name, {
        configurable: true, enumerable: true,
        get: () => cached[clip.name] || (cached[clip.name] = state.mixer.clipAction(clip, root)),
      });
    }
    return () => {
      state.mixer.stopAllAction();
      state.mixer.uncacheRoot(root);
      for (const name of Object.keys(state.actions)) delete state.actions[name];
    };
  }, [animations, groupRef, state]);

  useFrame(({ camera }, delta) => {
    visualFrame.current = false;
    if (!active || gameState.paused || !bodyRef.current) return;
    const position = bodyRef.current.translation();
    const distanceSq = camera.position.distanceToSquared(position);
    const controlled = team === 'friendly' && gameState.possessedSoldierId === id;
    const shadows = controlled || distanceSq < PERFORMANCE.unitShadowDistance ** 2;
    if (state.shadows !== shadows) {
      for (const mesh of state.meshes) mesh.castShadow = shadows;
      state.shadows = shadows;
    }
    const interval = controlled ? 0 : 1 / (distanceSq < PERFORMANCE.nearAnimationDistance ** 2
      ? PERFORMANCE.nearAnimationHz : PERFORMANCE.farAnimationHz);
    elapsed.current += delta;
    if (elapsed.current < interval) return;
    state.mixer.update(elapsed.current);
    elapsed.current = 0;
    visualFrame.current = true;
  });
  return { actions: state.actions, visualFrame };
}