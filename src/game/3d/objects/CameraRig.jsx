import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { CAMERA, BASES, MAP, DIRECT_CONTROL } from '@/game/config';
import { enterStation, exitStation } from '@/game/3d/stationControl';
import { selection } from '@/game/3d/commands';
import { random } from '@/game/3d/random';
const thirdPersonRig = () => gameState.controlledStation ? (gameState.controlledStation.type === 'tower' ? DIRECT_CONTROL.towerCamera : DIRECT_CONTROL.camera) : CAMERA.thirdPerson;
import { gameState } from '@/game/3d/world';
import { input, clearInput, bindInput } from '@/game/3d/input';
import { combat } from '@/game/3d/combat';
import { settings } from '@/game/settings';
import { cameraView, cameraJuice, stepCameraFeedback, installCameraFeedback, resetCameraFeedback } from '@/game/3d/feedback/cameraFeedback';
const cameraAnchor=new THREE.Vector3(),cameraRay=new THREE.Vector3();
// Scratch vectors for transition blending (avoid per-frame allocations)
const _stratPos=new THREE.Vector3(),_tpPos=new THREE.Vector3();
const _stratLook=new THREE.Vector3(),_tpLook=new THREE.Vector3();
const _viewDir=new THREE.Vector3();
const BASE_FOV = 60;
// Zoomed FOV while holding right mouse on a station (soldier ADS uses CAMERA.ads).
const STATION_ZOOM_FOV = { tank: 42, artillery: 48, tower: 45 };
// FOV spring: slightly under-damped so ADS in/out lands with a tiny punch.
const FOV_STIFFNESS = 140, FOV_DAMPING = 2 * Math.sqrt(140) * 0.72;
// Head-bob while the possessed soldier runs (metres / radians per second).
const BOB = { rate: 10.5, vertical: 0.035, lateral: 0.022, roll: 0.004 };
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const isMoving = keys => { for (const k of MOVE_KEYS) if (keys[k]) return true; return false; };
const motionScale = () => { const s = settings.get().screenShake; return Number.isFinite(s) ? Math.max(0, Math.min(1, s)) : 1; };

// Applies camera-local shake (rotations + translation) after lookAt. Roll and
// translation dominate so the crosshair ray (camera centre) barely moves.
function applyShake(camera, j, rotScale, posScale) {
  if (j.shakeYaw || j.shakePitch || j.shakeRoll) {
    camera.rotateY(j.shakeYaw * rotScale);
    camera.rotateX(j.shakePitch * rotScale);
    camera.rotateZ(j.shakeRoll);
  }
  if (j.shakeX || j.shakeY) {
    camera.translateX(j.shakeX * posScale);
    camera.translateY(j.shakeY * posScale);
  }
}

export function CameraRig() {
  const { camera, gl } = useThree();

  const strategicTarget = useRef(new THREE.Vector3(...CAMERA.strategic.initialTarget));
  const strategicDistance = useRef(CAMERA.strategic.initialDistance);
  const thirdPersonYaw = useRef(0);
  const thirdPersonPitch = useRef(CAMERA.thirdPerson.initialPitch);
  const transition = useRef(null); // { startPos: Vector3, startLook: Vector3, duration, elapsed }
  const fov = useRef({ value: null, velocity: 0, strategic: null }); // spring state; strategic = FOV to restore on release
  const bob = useRef({ phase: 0, amount: 0 });

  useEffect(() => installCameraFeedback(), []);

  // --- Possess / release handlers -------------------------------------------
  useEffect(() => {
    const onPossess = (requested) => {
      if (gameState.mode !== 'strategic' || gameState.paused || gameState.preparing || gameState.transitioning) return;
      const eligible = combat.units.filter(u => u.team === 'friendly' && u.alive && u.bodyRef.current && (u.weapon || ['tank','artillery'].includes(u.type)));
      const chosen = requested?.type ? eligible.find(u => u.type === requested.type && u.id === requested.id) : eligible.find(u => u === selection.unit);
      const soldiers = eligible.filter(u => u.type === 'soldier');
      const unit = chosen ?? (!requested?.type ? soldiers[Math.floor(random() * soldiers.length)] : null);
      if (!unit) { EventBus.emit('no-eligible-soldier'); return; }
      clearInput();
      gameState.possessedSoldierId = unit.type === 'soldier' ? unit.id : null;
      if (unit.type !== 'soldier' && !enterStation(unit.type,unit.id)) return;
      const p = unit.bodyRef.current.translation();
      gameState.soldierPosition.set(p.x, p.y, p.z);
      // Don't switch mode yet — start smooth camera transition
      const pos = gameState.soldierPosition;
      const enemy = BASES.enemy.position;
      const dx = enemy[0] - pos.x;
      const dz = enemy[2] - pos.z;
      thirdPersonYaw.current = Math.atan2(dx, dz);
      thirdPersonPitch.current = CAMERA.thirdPerson.initialPitch;
      if (unit.type === 'soldier') EventBus.emit('set-soldier-rotation', { id: unit.id, rotation: Math.atan2(dx, dz) });
      resetCameraFeedback();
      if (fov.current.strategic === null) fov.current.strategic = camera.fov;
      // Capture current camera state as the transition start point
      transition.current = {
        startPos: camera.position.clone(),
        startLook: strategicTarget.current.clone(),
        direction: 'possess',
        duration: 1.4,
        elapsed: 0,
      };
      gameState.transitioning = true;
    };

    const onRelease = () => {
      exitStation();
      clearInput();
      // Capture current third-person lookAt as the transition start point
      const yaw = thirdPersonYaw.current;
      const pitch = thirdPersonPitch.current;
      _tpLook.set(
        camera.position.x + Math.sin(yaw) * Math.cos(pitch),
        camera.position.y - Math.sin(pitch),
        camera.position.z + Math.cos(yaw) * Math.cos(pitch),
      );
      // Re-center strategic camera target on the soldier's current position
      strategicTarget.current.copy(gameState.soldierPosition);
      gameState.selectedSoldierId = null;
      gameState.possessedSoldierId = null;
      // Start smooth camera transition back up to strategic view
      resetCameraFeedback();
      transition.current = {
        startPos: camera.position.clone(),
        startLook: _tpLook.clone(),
        startFov: camera.fov,
        direction: 'release',
        duration: 1.2,
        elapsed: 0,
      };
      gameState.transitioning = true;
      if (document.pointerLockElement) document.exitPointerLock();
    };

    const onResetCamera=()=>{transition.current=null;gameState.transitioning=false;strategicTarget.current.fromArray(CAMERA.strategic.initialTarget);strategicDistance.current=CAMERA.strategic.initialDistance;};
    const onFrameLanding=()=>{strategicTarget.current.set(0,0,56);strategicDistance.current=45;};
    EventBus.on('reset-camera',onResetCamera);
    EventBus.on('frame-landing-area',onFrameLanding);
    EventBus.on('possess-unit', onPossess);
    EventBus.on('possess-soldier', onPossess);
    EventBus.on('release-soldier', onRelease);
    return () => {
      EventBus.off('reset-camera',onResetCamera);
      EventBus.off('frame-landing-area',onFrameLanding);
      EventBus.off('possess-unit', onPossess);
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
    const dt = Math.min(delta, 0.1);
    stepCameraFeedback(dt);
    const j = cameraJuice;
    cameraView.camera = camera;

    // --- Smooth camera transition (possess or release) ------------------------
    if (transition.current) {
      const tr = transition.current;
      tr.elapsed += delta;
      const t = Math.min(1, tr.elapsed / tr.duration);
      // Ease-out cubic: fast start, gentle arrival
      const ease = 1 - Math.pow(1 - t, 3);

      // Strategic camera position
      const angle = CAMERA.strategic.angle;
      const dist = strategicDistance.current;
      _stratPos.set(
        strategicTarget.current.x,
        dist * Math.sin(angle),
        strategicTarget.current.z + dist * Math.cos(angle),
      );

      // Third-person camera position
      const pos = gameState.soldierPosition;
      const yaw = thirdPersonYaw.current;
      const pitch = thirdPersonPitch.current;
      const tp = thirdPersonRig();
      _tpPos.set(
        pos.x - tp.distance * Math.sin(yaw) * Math.cos(pitch) - tp.shoulder * Math.cos(yaw),
        pos.y + tp.height + tp.distance * Math.sin(pitch),
        pos.z - tp.distance * Math.cos(yaw) * Math.cos(pitch) + tp.shoulder * Math.sin(yaw),
      );

      if (tr.direction === 'release') {
        // Release: third-person → strategic
        camera.position.lerpVectors(tr.startPos, _stratPos, ease);
        _tpLook.set(
          tr.startPos.x + Math.sin(yaw) * Math.cos(pitch),
          tr.startPos.y - Math.sin(pitch),
          tr.startPos.z + Math.cos(yaw) * Math.cos(pitch),
        );
        _stratLook.copy(strategicTarget.current);
        camera.lookAt(_tpLook.lerp(_stratLook, ease));
        // Return the lens to its strategic FOV (ADS/kicks must not leak into RTS view).
        const strategicFov = fov.current.strategic ?? BASE_FOV;
        if (tr.startFov !== undefined && Math.abs(camera.fov - strategicFov) > 0.01) {
          camera.fov = THREE.MathUtils.lerp(tr.startFov, strategicFov, ease);
          camera.updateProjectionMatrix();
        }
        camera.updateMatrixWorld(true);

        if (t >= 1) {
          transition.current = null;
          gameState.transitioning = false;
          gameState.mode = 'strategic';
          fov.current.value = null;
          EventBus.emit('mode-changed', 'strategic');
        }
      } else {
        // Possess: strategic → third-person
        camera.position.lerpVectors(tr.startPos, _tpPos, ease);

        _tpLook.set(
          _tpPos.x + Math.sin(yaw) * Math.cos(pitch),
          _tpPos.y - Math.sin(pitch),
          _tpPos.z + Math.cos(yaw) * Math.cos(pitch),
        );
        _stratLook.copy(tr.startLook);
        camera.lookAt(_stratLook.lerp(_tpLook, ease));
        camera.updateMatrixWorld(true);

        if (t >= 1) {
          transition.current = null;
          gameState.transitioning = false;
          gameState.mode = 'third_person';
          gameState.cameraYaw = thirdPersonYaw.current;
          EventBus.emit('mode-changed', 'third_person');
          gl.domElement.requestPointerLock?.()?.catch?.(() => {});
        }
      }
      camera.getWorldDirection(_viewDir);
      cameraView.yaw = Math.atan2(_viewDir.x, _viewDir.z);
      return;
    }

    if (gameState.mode === 'strategic') {
      if (!gameState.preparing) {
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
      // Gentle shake from big blasts only; translation scales with zoom distance.
      applyShake(camera, j, 1, dist);
      cameraView.focusX = strategicTarget.current.x;
      cameraView.focusZ = strategicTarget.current.z;
      cameraView.yaw = Math.PI; // fixed RTS heading (looking toward -Z)
    } else {
      // Third-person: process mouse look (settings: sensitivity multiplier, invert Y)
      const aimHeld = input.rightMouseDown;
      if (input.mouseDelta.x !== 0 || input.mouseDelta.y !== 0) {
        const prefs = settings.get();
        const userSens = Number.isFinite(prefs.mouseSensitivity) && prefs.mouseSensitivity > 0 ? prefs.mouseSensitivity : 1;
        const sens = CAMERA.thirdPerson.mouseSensitivity * userSens * (aimHeld ? CAMERA.ads.sensitivityMult : 1);
        thirdPersonYaw.current -= input.mouseDelta.x * sens;
        thirdPersonPitch.current = THREE.MathUtils.clamp(
          thirdPersonPitch.current + input.mouseDelta.y * sens * (prefs.invertY ? -1 : 1),
          CAMERA.thirdPerson.minPitch,
          CAMERA.thirdPerson.maxPitch,
        );
        input.mouseDelta.x = 0;
        input.mouseDelta.y = 0;
      }
      gameState.cameraYaw = thirdPersonYaw.current;

      // Follow the soldier — ADS tightens the rig when right-click is held
      const pos = gameState.soldierPosition;
      const station = gameState.controlledStation;
      // Recoil is a recovering view offset: it moves the crosshair ray (real kick)
      // but never permanently drags the player's chosen aim.
      const yaw = thirdPersonYaw.current + j.recoilYaw;
      const pitch = THREE.MathUtils.clamp(thirdPersonPitch.current - j.recoilPitch, CAMERA.thirdPerson.minPitch - 0.1, CAMERA.thirdPerson.maxPitch);
      const aiming = aimHeld && !station;
      const ads = CAMERA.ads;
      const tp = thirdPersonRig();
      const d = aiming ? ads.distance : tp.distance;
      const h = aiming ? ads.height : tp.height;

      // FOV: under-damped spring toward the ADS/zoom/base FOV, plus decaying kicks.
      const targetFov = aiming ? ads.fov : aimHeld && station ? (STATION_ZOOM_FOV[station.type] ?? BASE_FOV) : BASE_FOV;
      const f = fov.current;
      if (f.value === null) { f.value = camera.fov; f.velocity = 0; }
      f.velocity += ((targetFov - f.value) * FOV_STIFFNESS - f.velocity * FOV_DAMPING) * dt;
      f.value += f.velocity * dt;
      const nextFov = f.value + j.fovKick * motionScale();
      if (Math.abs(camera.fov - nextFov) > 0.01) {
        camera.fov = nextFov;
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

      // Subtle run head-bob for the possessed soldier (not while aiming or seated).
      const b = bob.current;
      const running = !station && !aiming && isMoving(input.keys);
      b.amount += ((running ? 1 : 0) - b.amount) * Math.min(1, dt * 6);
      if (b.amount > 0.001) {
        b.phase += dt * BOB.rate;
        const m = b.amount * motionScale();
        camera.translateY((Math.abs(Math.sin(b.phase)) - 0.5) * BOB.vertical * m);
        camera.translateX(Math.sin(b.phase * 0.5) * BOB.lateral * m);
        camera.rotateZ(Math.sin(b.phase * 0.5) * BOB.roll * m);
      } else b.phase = 0;

      // Screen shake (reduced while aiming down sights so precision stays usable).
      applyShake(camera, j, aimHeld ? 0.5 : 1, aimHeld ? 0.6 : 1);
      camera.updateMatrixWorld(true);
      cameraView.yaw = thirdPersonYaw.current;
    }
  }, -1);

  return null;
}