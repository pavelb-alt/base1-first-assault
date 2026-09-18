import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { CAMERA, BASES, MAP } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { input } from '@/game/3d/input';

export function CameraRig() {
  const { camera, gl } = useThree();

  const strategicTarget = useRef(new THREE.Vector3(...CAMERA.strategic.initialTarget));
  const strategicDistance = useRef(CAMERA.strategic.initialDistance);
  const thirdPersonYaw = useRef(0);
  const thirdPersonPitch = useRef(CAMERA.thirdPerson.initialPitch);

  // --- Possess / release handlers -------------------------------------------
  useEffect(() => {
    const onPossess = () => {
      gameState.mode = 'third_person';
      const pos = gameState.soldierPosition;
      const enemy = BASES.enemy.position;
      const dx = enemy[0] - pos.x;
      const dz = enemy[2] - pos.z;
      // Camera looks toward enemy base
      thirdPersonYaw.current = Math.atan2(dx, dz);
      // Soldier faces enemy base
      EventBus.emit('set-soldier-rotation', Math.atan2(dx, -dz));
      EventBus.emit('mode-changed', 'third_person');
      // Request pointer lock (slight delay so React processes the mode change first)
      setTimeout(() => { gl.domElement.requestPointerLock?.(); }, 50);
    };

    const onRelease = () => {
      gameState.mode = 'strategic';
      gameState.selected = false;
      // Re-center strategic camera on the soldier's current position
      strategicTarget.current.copy(gameState.soldierPosition);
      EventBus.emit('mode-changed', 'strategic');
      if (document.pointerLockElement) document.exitPointerLock();
    };

    EventBus.on('possess-soldier', onPossess);
    EventBus.on('release-soldier', onRelease);
    return () => {
      EventBus.off('possess-soldier', onPossess);
      EventBus.off('release-soldier', onRelease);
    };
  }, [gl]);

  // --- Tab / Escape to release ----------------------------------------------
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (gameState.mode === 'third_person') EventBus.emit('release-soldier');
      }
      if (e.code === 'Escape' && gameState.mode === 'third_person') {
        EventBus.emit('release-soldier');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // --- Pointer-lock loss safety ---------------------------------------------
  useEffect(() => {
    const onPLC = () => {
      if (!document.pointerLockElement && gameState.mode === 'third_person') {
        input.keys = {};
      }
    };
    document.addEventListener('pointerlockchange', onPLC);
    return () => document.removeEventListener('pointerlockchange', onPLC);
  }, []);

  // --- Per-frame camera update ----------------------------------------------
  useFrame((_state, delta) => {
    if (gameState.mode === 'strategic') {
      // WASD pan
      const keys = input.keys;
      const pan = CAMERA.strategic.panSpeed * delta;
      if (keys.KeyW) strategicTarget.current.z -= pan;
      if (keys.KeyS) strategicTarget.current.z += pan;
      if (keys.KeyA) strategicTarget.current.x -= pan;
      if (keys.KeyD) strategicTarget.current.x += pan;

      // Clamp to map
      const h = MAP.HALF;
      strategicTarget.current.x = THREE.MathUtils.clamp(strategicTarget.current.x, -h, h);
      strategicTarget.current.z = THREE.MathUtils.clamp(strategicTarget.current.z, -h, h);

      // Wheel zoom
      if (input.wheelDelta !== 0) {
        strategicDistance.current = THREE.MathUtils.clamp(
          strategicDistance.current + input.wheelDelta * 0.02,
          CAMERA.strategic.minDistance,
          CAMERA.strategic.maxDistance,
        );
        input.wheelDelta = 0;
      }

      // Position camera at fixed angle above target
      const angle = CAMERA.strategic.angle;
      const dist = strategicDistance.current;
      camera.position.set(
        strategicTarget.current.x,
        dist * Math.sin(angle),
        strategicTarget.current.z + dist * Math.cos(angle),
      );
      camera.lookAt(strategicTarget.current);
    } else {
      // Third-person: process mouse look
      if (input.mouseDelta.x !== 0 || input.mouseDelta.y !== 0) {
        thirdPersonYaw.current -= input.mouseDelta.x * CAMERA.thirdPerson.mouseSensitivity;
        thirdPersonPitch.current = THREE.MathUtils.clamp(
          thirdPersonPitch.current - input.mouseDelta.y * CAMERA.thirdPerson.mouseSensitivity,
          CAMERA.thirdPerson.minPitch,
          CAMERA.thirdPerson.maxPitch,
        );
        input.mouseDelta.x = 0;
        input.mouseDelta.y = 0;
      }
      gameState.cameraYaw = thirdPersonYaw.current;

      // Follow the soldier
      const pos = gameState.soldierPosition;
      const yaw = thirdPersonYaw.current;
      const pitch = thirdPersonPitch.current;
      const d = CAMERA.thirdPerson.distance;
      const h = CAMERA.thirdPerson.height;

      camera.position.set(
        pos.x - d * Math.sin(yaw) * Math.cos(pitch),
        pos.y + h + d * Math.sin(pitch),
        pos.z - d * Math.cos(yaw) * Math.cos(pitch),
      );
      camera.lookAt(pos.x, pos.y + 1, pos.z);
    }
  });

  return null;
}