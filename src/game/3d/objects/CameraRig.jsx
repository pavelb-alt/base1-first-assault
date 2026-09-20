import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { CAMERA, BASES, MAP } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { input, clearInput, bindInput } from '@/game/3d/input';
import { combat } from '@/game/3d/combat';
const cameraAnchor=new THREE.Vector3(),cameraRay=new THREE.Vector3();

export function CameraRig() {
  const { camera, gl } = useThree();

  const strategicTarget = useRef(new THREE.Vector3(...CAMERA.strategic.initialTarget));
  const strategicDistance = useRef(CAMERA.strategic.initialDistance);
  const thirdPersonYaw = useRef(0);
  const thirdPersonPitch = useRef(CAMERA.thirdPerson.initialPitch);

  // --- Possess / release handlers -------------------------------------------
  useEffect(() => {
    const onPossess = () => {
      const eligible = combat.units.filter(u => u.team === 'friendly' && u.alive && u.weapon && u.bodyRef.current);
      if (eligible.length === 0) {
        EventBus.emit('no-eligible-soldier');
        return;
      }
      const unit = eligible[Math.floor(Math.random() * eligible.length)];
      clearInput();
      gameState.possessedSoldierId = unit.id;
      const p = unit.bodyRef.current.translation();
      gameState.soldierPosition.set(p.x, p.y, p.z);
      gameState.mode = 'third_person';
      const pos = gameState.soldierPosition;
      const enemy = BASES.enemy.position;
      const dx = enemy[0] - pos.x;
      const dz = enemy[2] - pos.z;
      // Camera looks toward enemy base
      thirdPersonYaw.current = Math.atan2(dx, dz);
      // Soldier faces enemy base (model forward is +Z) — include ID so only the possessed soldier applies it
      EventBus.emit('set-soldier-rotation', { id: unit.id, rotation: Math.atan2(dx, dz) });
      EventBus.emit('mode-changed', 'third_person');
      // Stay in the trusted click/keydown gesture; retry is available on canvas click.
      gl.domElement.requestPointerLock?.()?.catch?.(() => {});
    };

    const onRelease = () => {
      clearInput();
      gameState.mode = 'strategic';
      gameState.selectedSoldierId = null;
      gameState.possessedSoldierId = null;
      // Re-center strategic camera on the soldier's current position
      strategicTarget.current.copy(gameState.soldierPosition);
      EventBus.emit('mode-changed', 'strategic');
      if (document.pointerLockElement) document.exitPointerLock();
    };

    const onResetCamera=()=>{strategicTarget.current.fromArray(CAMERA.strategic.initialTarget);strategicDistance.current=CAMERA.strategic.initialDistance;};
    EventBus.on('reset-camera',onResetCamera);
    EventBus.on('possess-soldier', onPossess);
    EventBus.on('release-soldier', onRelease);
    return () => {
      EventBus.off('reset-camera',onResetCamera);
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

  useEffect(() => bindInput(gl.domElement), [gl]);

  // --- Per-frame camera update ----------------------------------------------
  useFrame((_state, delta) => {
    if (gameState.paused) return;
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
          thirdPersonPitch.current + input.mouseDelta.y * CAMERA.thirdPerson.mouseSensitivity * (input.rightMouseDown ? CAMERA.ads.sensitivityMult : 1),
          CAMERA.thirdPerson.minPitch,
          CAMERA.thirdPerson.maxPitch,
        );
        input.mouseDelta.x = 0;
        input.mouseDelta.y = 0;
      }
      gameState.cameraYaw = thirdPersonYaw.current;

      // Follow the soldier — ADS tightens the rig when right-click is held
      const pos = gameState.soldierPosition;
      const yaw = thirdPersonYaw.current;
      const pitch = thirdPersonPitch.current;
      const aiming = input.rightMouseDown;
      const ads = CAMERA.ads;
      const tp = CAMERA.thirdPerson;
      const d = aiming ? ads.distance : tp.distance;
      const h = aiming ? ads.height : tp.height;
      const targetFov = aiming ? ads.fov : 60;
      if (Math.abs(camera.fov - targetFov) > 0.1) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, delta * 10);
        camera.updateProjectionMatrix();
      }

      camera.position.set(
        pos.x - d * Math.sin(yaw) * Math.cos(pitch) - (aiming ? ads.shoulder : tp.shoulder) * Math.cos(yaw),
        pos.y + h + d * Math.sin(pitch),
        pos.z - d * Math.cos(yaw) * Math.cos(pitch) + (aiming ? ads.shoulder : tp.shoulder) * Math.sin(yaw),
      );
      // Keep the possessed camera on the near side of trench walls/ground.
      if(combat.physics) {
        cameraAnchor.set(pos.x,pos.y+1.4,pos.z);
        cameraRay.subVectors(camera.position,cameraAnchor);
        const distance=cameraRay.length();cameraRay.normalize();
        const {world,rapier}=combat.physics;
        const hit=world.castRay(new rapier.Ray(cameraAnchor,cameraRay),distance,true,undefined,undefined,undefined,undefined,
          collider=>!combat.byBody.has(collider.parent()?.handle));
        if(hit)camera.position.copy(cameraAnchor).addScaledVector(cameraRay,Math.max(0.15,hit.timeOfImpact-0.2));
      }
      camera.lookAt(
        camera.position.x + Math.sin(yaw) * Math.cos(pitch),
        camera.position.y - Math.sin(pitch),
        camera.position.z + Math.cos(yaw) * Math.cos(pitch),
      );
      camera.updateMatrixWorld(true);
    }
  }, -1);

  return null;
}