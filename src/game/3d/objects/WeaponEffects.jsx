import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { combat } from '@/game/3d/combat';
import { gameState } from '@/game/3d/world';

const FLASH_CAPACITY = 96;
const SPARK_CAPACITY = 192;
const FLASH_LIFE = 0.055;
const SPARK_LIFE = 0.16;
const flashGeometry = new THREE.ConeGeometry(0.065, 0.22, 5);
flashGeometry.rotateX(-Math.PI / 2);
const sparkGeometry = new THREE.TetrahedronGeometry(0.035, 0);
const flashMaterial = new THREE.MeshBasicMaterial({ color: '#fff0a8', toneMapped: false, transparent: true });
const sparkMaterial = new THREE.MeshBasicMaterial({ color: '#ffb43c', toneMapped: false, transparent: true });
const forward = new THREE.Vector3(0, 0, 1);
const up = new THREE.Vector3(0, 1, 0);
const side = new THREE.Vector3();
const direction = new THREE.Vector3();
const transform = new THREE.Object3D();

function createSlots(capacity) {
  return Array.from({ length: capacity }, () => ({
    active: false, age: 0, position: new THREE.Vector3(), velocity: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, 1),
  }));
}

export function WeaponEffects() {
  const flashMesh = useRef();
  const sparkMesh = useRef();
  const state = useRef({ flashes: createSlots(FLASH_CAPACITY), sparks: createSlots(SPARK_CAPACITY), flashCursor: 0, sparkCursor: 0 });

  useFrame((_frame, delta) => {
    if (gameState.paused) return;
    const pool = state.current;
    for (const effect of combat.muzzleEffects.splice(0)) {
      const slot = pool.flashes[pool.flashCursor++ % FLASH_CAPACITY];
      slot.active = true; slot.age = 0; slot.position.fromArray(effect.position); slot.direction.fromArray(effect.direction);
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
    flashMesh.current.count = flashCount; sparkMesh.current.count = sparkCount;
    if (flashCount) flashMesh.current.instanceMatrix.needsUpdate = true;
    if (sparkCount) sparkMesh.current.instanceMatrix.needsUpdate = true;
  }, 1);

  return <>
    <instancedMesh ref={flashMesh} args={[flashGeometry, flashMaterial, FLASH_CAPACITY]} frustumCulled={false} />
    <instancedMesh ref={sparkMesh} args={[sparkGeometry, sparkMaterial, SPARK_CAPACITY]} frustumCulled={false} />
  </>;
}