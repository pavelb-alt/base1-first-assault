import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { combat } from '@/game/3d/combat';
import { gameState } from '@/game/3d/world';

const FLASH_CAPACITY = 96;
const SPARK_CAPACITY = 192;
const TRACER_CAPACITY = 256;
const FLASH_LIFE = 0.055;
const SPARK_LIFE = 0.16;
const TRACER_LIFE = 0.1;
const flashGeometry = new THREE.ConeGeometry(0.065, 0.22, 5);
flashGeometry.rotateX(-Math.PI / 2);
const sparkGeometry = new THREE.TetrahedronGeometry(0.035, 0);
const tracerGeometry = new THREE.CylinderGeometry(0.025, 0.025, 1, 4);
const flashMaterial = new THREE.MeshBasicMaterial({ color: '#fff0a8', toneMapped: false, transparent: true });
const sparkMaterial = new THREE.MeshBasicMaterial({ color: '#ffb43c', toneMapped: false, transparent: true });
const tracerFriendlyMat = new THREE.MeshBasicMaterial({ color: '#60a5fa', toneMapped: false, transparent: true });
const tracerEnemyMat = new THREE.MeshBasicMaterial({ color: '#f87171', toneMapped: false, transparent: true });
const forward = new THREE.Vector3(0, 0, 1);
const up = new THREE.Vector3(0, 1, 0);
const side = new THREE.Vector3();
const direction = new THREE.Vector3();
const transform = new THREE.Object3D();
const tracerStart = new THREE.Vector3();
const tracerEnd = new THREE.Vector3();
const tracerMid = new THREE.Vector3();
const tracerDir = new THREE.Vector3();
const tracerScale = new THREE.Vector3(1, 1, 1);
const tracerQuat = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);

function createSlots(capacity) {
  return Array.from({ length: capacity }, () => ({
    active: false, age: 0, position: new THREE.Vector3(), velocity: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, 1),
  }));
}
function createTracerSlots(capacity) {
  return Array.from({ length: capacity }, () => ({
    active: false, age: 0, start: new THREE.Vector3(), end: new THREE.Vector3(), team: 'friendly',
  }));
}

export function WeaponEffects() {
  const flashMesh = useRef();
  const sparkMesh = useRef();
  const tracerFriendlyMesh = useRef();
  const tracerEnemyMesh = useRef();
  const state = useRef({ flashes: createSlots(FLASH_CAPACITY), sparks: createSlots(SPARK_CAPACITY), tracers: createTracerSlots(TRACER_CAPACITY), flashCursor: 0, sparkCursor: 0, tracerCursor: 0 });

  useFrame((_frame, delta) => {
    if (gameState.paused) return;
    const pool = state.current;
    for (const effect of combat.muzzleEffects.splice(0)) {
      const slot = pool.flashes[pool.flashCursor++ % FLASH_CAPACITY];
      slot.active = true; slot.age = 0; slot.position.fromArray(effect.position); slot.direction.fromArray(effect.direction);
    }
    for (const effect of combat.tracerEffects.splice(0)) {
      const slot = pool.tracers[pool.tracerCursor++ % TRACER_CAPACITY];
      slot.active = true; slot.age = 0; slot.start.fromArray(effect.start); slot.end.fromArray(effect.end); slot.team = effect.team;
    }
    for (const effect of combat.impactEffects.splice(0)) {
      direction.fromArray(effect.direction).normalize();
      side.crossVectors(direction, up);
      if (side.lengthSq() < 0.001) side.set(1, 0, 0); else side.normalize();
      for (let i = 0; i < 3; i++) {
        const slot = pool.sparks[pool.sparkCursor++ % SPARK_CAPACITY];
        const spread = i - 1;
        slot.active = true; slot.age = 0; slot.position.fromArray(effect.position);
        slot.velocity.copy(direction).multiplyScalar(-1.7).addScaledVector(side, spread * 2.1).addScaledVector(up, 1.2 + (i % 2) * 0.7);
      }
    }

    let flashCount = 0;
    for (const slot of pool.flashes) {
      if (!slot.active) continue;
      slot.age += delta;
      if (slot.age >= FLASH_LIFE) { slot.active = false; continue; }
      transform.position.copy(slot.position); transform.quaternion.setFromUnitVectors(forward, slot.direction);
      transform.scale.setScalar(1 - slot.age / FLASH_LIFE * 0.35); transform.updateMatrix();
      flashMesh.current.setMatrixAt(flashCount++, transform.matrix);
    }
    let sparkCount = 0;
    for (const slot of pool.sparks) {
      if (!slot.active) continue;
      slot.age += delta;
      if (slot.age >= SPARK_LIFE) { slot.active = false; continue; }
      slot.velocity.y -= 8 * delta; slot.position.addScaledVector(slot.velocity, delta);
      transform.position.copy(slot.position); transform.scale.setScalar(1 - slot.age / SPARK_LIFE); transform.rotation.set(slot.age * 28, slot.age * 19, 0); transform.updateMatrix();
      sparkMesh.current.setMatrixAt(sparkCount++, transform.matrix);
    }
    let friendlyTracerCount = 0, enemyTracerCount = 0;
    for (const slot of pool.tracers) {
      if (!slot.active) continue;
      slot.age += delta;
      if (slot.age >= TRACER_LIFE) { slot.active = false; continue; }
      tracerStart.copy(slot.start); tracerEnd.copy(slot.end);
      tracerMid.addVectors(tracerStart, tracerEnd).multiplyScalar(0.5);
      tracerDir.subVectors(tracerEnd, tracerStart);
      const len = tracerDir.length();
      if (len < 0.01) continue;
      tracerDir.divideScalar(len);
      tracerQuat.setFromUnitVectors(yAxis, tracerDir);
      const fade = 1 - slot.age / TRACER_LIFE;
      tracerScale.set(1, len, 1);
      transform.position.copy(tracerMid);
      transform.quaternion.copy(tracerQuat);
      transform.scale.copy(tracerScale);
      transform.updateMatrix();
      const mesh = slot.team === 'friendly' ? tracerFriendlyMesh.current : tracerEnemyMesh.current;
      const idx = slot.team === 'friendly' ? friendlyTracerCount++ : enemyTracerCount++;
      mesh.setMatrixAt(idx, transform.matrix);
    }
    tracerFriendlyMesh.current.count = friendlyTracerCount;
    tracerEnemyMesh.current.count = enemyTracerCount;
    if (friendlyTracerCount) tracerFriendlyMesh.current.instanceMatrix.needsUpdate = true;
    if (enemyTracerCount) tracerEnemyMesh.current.instanceMatrix.needsUpdate = true;
    flashMesh.current.count = flashCount; sparkMesh.current.count = sparkCount;
    if (flashCount) flashMesh.current.instanceMatrix.needsUpdate = true;
    if (sparkCount) sparkMesh.current.instanceMatrix.needsUpdate = true;
  // Keep automatic scene rendering enabled: a positive priority takes it over.
  }, 0);

  return <>
    <instancedMesh ref={flashMesh} args={[flashGeometry, flashMaterial, FLASH_CAPACITY]} frustumCulled={false} />
    <instancedMesh ref={sparkMesh} args={[sparkGeometry, sparkMaterial, SPARK_CAPACITY]} frustumCulled={false} />
    <instancedMesh ref={tracerFriendlyMesh} args={[tracerGeometry, tracerFriendlyMat, TRACER_CAPACITY]} frustumCulled={false} />
    <instancedMesh ref={tracerEnemyMesh} args={[tracerGeometry, tracerEnemyMat, TRACER_CAPACITY]} frustumCulled={false} />
  </>;
}