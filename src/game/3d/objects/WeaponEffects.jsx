import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { combat } from '@/game/3d/combat';
import { gameState } from '@/game/3d/world';
import { LIGHTING } from '@/game/config';

const FLASH_CAPACITY = 128;
const IMPACT_CAPACITY = 128;
const SPARK_CAPACITY = 384;
const FLASH_LIFE = 0.1;
const IMPACT_LIFE = 0.14;
const SPARK_LIFE = 0.24;
const flashGeometry = new THREE.ConeGeometry(0.12, 0.38, 6);
flashGeometry.rotateX(Math.PI / 2); // cone points along the shot, not back into the gun
flashGeometry.translate(0, 0, 0.17);
const flashGlowGeometry = new THREE.SphereGeometry(0.2, 8, 6);
const impactGeometry = new THREE.SphereGeometry(0.14, 8, 6);
const sparkGeometry = new THREE.TetrahedronGeometry(0.055, 0);
const flashMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff3c5').multiplyScalar(LIGHTING.muzzleRadiance), toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
const glowMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb34c').multiplyScalar(LIGHTING.muzzleRadiance * 0.55), toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
const impactMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2c6').multiplyScalar(LIGHTING.muzzleRadiance * 0.85), toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
const sparkMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffbc58').multiplyScalar(LIGHTING.muzzleRadiance * 0.7), toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
const forward = new THREE.Vector3(0, 0, 1);
const up = new THREE.Vector3(0, 1, 0);
const side = new THREE.Vector3();
const direction = new THREE.Vector3();
const sparkDirection = new THREE.Vector3();
const fadeColor = new THREE.Color();
const transform = new THREE.Object3D();

function createSlots(capacity) {
  return Array.from({ length: capacity }, () => ({
    active: false, age: 0, position: new THREE.Vector3(), velocity: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, 1),
  }));
}

export function WeaponEffects() {
  const flashMesh = useRef();
  const glowMesh = useRef();
  const impactMesh = useRef();
  const sparkMesh = useRef();
  const state = useRef({ flashes: createSlots(FLASH_CAPACITY), impacts: createSlots(IMPACT_CAPACITY), sparks: createSlots(SPARK_CAPACITY), flashCursor: 0, impactCursor: 0, sparkCursor: 0 });
  useEffect(() => {
    for (const mesh of [flashMesh, glowMesh, impactMesh, sparkMesh]) mesh.current.count = 0;
  }, []);

  useFrame((_, delta) => {
    if (gameState.paused) return;
    const pool = state.current;
    for (const effect of combat.muzzleEffects) {
      const slot = pool.flashes[pool.flashCursor++ % FLASH_CAPACITY];
      slot.active = true; slot.age = 0; slot.position.fromArray(effect.position); slot.direction.fromArray(effect.direction).normalize();
    }
    combat.muzzleEffects.length = 0;
    for (const effect of combat.impactEffects) {
      const burst = pool.impacts[pool.impactCursor++ % IMPACT_CAPACITY];
      burst.active = true; burst.age = 0; burst.position.fromArray(effect.position);
      direction.fromArray(effect.direction).normalize();
      side.crossVectors(direction, up);
      if (side.lengthSq() < 0.001) side.set(1, 0, 0); else side.normalize();
      for (let i = 0; i < 4; i++) {
        const slot = pool.sparks[pool.sparkCursor++ % SPARK_CAPACITY];
        slot.active = true; slot.age = 0; slot.position.copy(burst.position);
        slot.velocity.copy(direction).multiplyScalar(-2.7).addScaledVector(side, (i - 1.5) * 2.1).addScaledVector(up, 1.3 + (i % 2) * 1.1);
      }
    }
    combat.impactEffects.length = 0;

    let flashCount = 0;
    for (const slot of pool.flashes) {
      if (!slot.active) continue;
      const fade = 1 - slot.age / FLASH_LIFE;
      transform.position.copy(slot.position);
      transform.quaternion.setFromUnitVectors(forward, slot.direction);
      transform.scale.setScalar(Math.max(0.05, fade)); transform.updateMatrix();
      flashMesh.current.setMatrixAt(flashCount, transform.matrix);
      glowMesh.current.setMatrixAt(flashCount, transform.matrix);
      fadeColor.setScalar(Math.max(0.06, fade));
      flashMesh.current.setColorAt(flashCount, fadeColor);
      glowMesh.current.setColorAt(flashCount++, fadeColor);
      // Draw every newly queued flash at least once, even on a slow frame.
      slot.age += delta;
      if (slot.age >= FLASH_LIFE) slot.active = false;
    }
    let impactCount = 0;
    for (const slot of pool.impacts) {
      if (!slot.active) continue;
      const progress = slot.age / IMPACT_LIFE;
      transform.position.copy(slot.position); transform.quaternion.identity();
      transform.scale.setScalar(1 + progress * 2); transform.updateMatrix();
      impactMesh.current.setMatrixAt(impactCount, transform.matrix);
      fadeColor.setScalar(Math.max(0.03, 1 - progress));
      impactMesh.current.setColorAt(impactCount++, fadeColor);
      slot.age += delta;
      if (slot.age >= IMPACT_LIFE) slot.active = false;
    }
    let sparkCount = 0;
    for (const slot of pool.sparks) {
      if (!slot.active) continue;
      transform.position.copy(slot.position);
      sparkDirection.copy(slot.velocity).normalize();
      transform.quaternion.setFromUnitVectors(forward, sparkDirection);
      const fade = Math.max(0.05, 1 - slot.age / SPARK_LIFE);
      transform.scale.set(0.8, 0.8, fade * 2.8); transform.updateMatrix();
      sparkMesh.current.setMatrixAt(sparkCount, transform.matrix);
      fadeColor.setScalar(fade);
      sparkMesh.current.setColorAt(sparkCount++, fadeColor);
      slot.velocity.y -= 10 * delta; slot.position.addScaledVector(slot.velocity, delta);
      slot.age += delta;
      if (slot.age >= SPARK_LIFE) slot.active = false;
    }
    flashMesh.current.count = flashCount; glowMesh.current.count = flashCount;
    impactMesh.current.count = impactCount; sparkMesh.current.count = sparkCount;
    if (flashCount) { flashMesh.current.instanceMatrix.needsUpdate = true; glowMesh.current.instanceMatrix.needsUpdate = true; flashMesh.current.instanceColor.needsUpdate = true; glowMesh.current.instanceColor.needsUpdate = true; }
    if (impactCount) { impactMesh.current.instanceMatrix.needsUpdate = true; impactMesh.current.instanceColor.needsUpdate = true; }
    if (sparkCount) { sparkMesh.current.instanceMatrix.needsUpdate = true; sparkMesh.current.instanceColor.needsUpdate = true; }
  });

  return <>
    <instancedMesh ref={flashMesh} args={[flashGeometry, flashMaterial, FLASH_CAPACITY]} frustumCulled={false} />
    <instancedMesh ref={glowMesh} args={[flashGlowGeometry, glowMaterial, FLASH_CAPACITY]} frustumCulled={false} />
    <instancedMesh ref={impactMesh} args={[impactGeometry, impactMaterial, IMPACT_CAPACITY]} frustumCulled={false} />
    <instancedMesh ref={sparkMesh} args={[sparkGeometry, sparkMaterial, SPARK_CAPACITY]} frustumCulled={false} />
  </>;
}