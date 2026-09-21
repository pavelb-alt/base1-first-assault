import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, Frustum, Matrix4, Sphere } from 'three';
import { PERFORMANCE } from '@/game/config';
import { gameState } from '@/game/3d/world';

// One shared frustum calculation per rendered frame, not per soldier.
const viewFrustum = new Frustum();
const viewMatrix = new Matrix4();
const bounds = new Sphere();
let viewTime = -1;
let viewCamera = null;

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

  useFrame(({ camera, clock }, delta) => {
    visualFrame.current = false;
    if (!active || gameState.paused || !bodyRef.current) return;
    const position = bodyRef.current.translation();
    const distanceSq = camera.position.distanceToSquared(position);
    const controlled = team === 'friendly' && gameState.possessedSoldierId === id;
    const shadows = PERFORMANCE.shadows && (controlled || distanceSq < PERFORMANCE.unitShadowDistance ** 2);
    if (state.shadows !== shadows) {
      for (const mesh of state.meshes) mesh.castShadow = shadows;
      state.shadows = shadows;
    }
    // Offscreen movement, shots and physics continue; only invisible posing sleeps.
    if (!controlled) {
      if (viewTime !== clock.elapsedTime || viewCamera !== camera) {
        camera.updateMatrixWorld();
        viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        viewFrustum.setFromProjectionMatrix(viewMatrix);
        viewTime = clock.elapsedTime;
        viewCamera = camera;
      }
      bounds.center.set(position.x, position.y + 2, position.z);
      bounds.radius = 6; // conservative margin for the largest enemy and weapon
      if (!viewFrustum.intersectsSphere(bounds)) {
        elapsed.current = Math.min(elapsed.current + delta, 0.25);
        return;
      }
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