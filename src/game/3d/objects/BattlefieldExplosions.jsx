import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { random } from '@/game/3d/random';
import { EXPLOSIONS } from '@/game/config';

// Purely cosmetic WW1-style ambient shellfire — no gameplay effect, no combat coupling.
const flashGeometry = new THREE.SphereGeometry(1, 10, 8);
const smokeGeometry = new THREE.SphereGeometry(1, 8, 6);
const debrisGeometry = new THREE.TetrahedronGeometry(0.09, 0);
const flashMaterial = new THREE.MeshBasicMaterial({ color: EXPLOSIONS.flashColor, toneMapped: false, transparent: true });
const smokeMaterial = new THREE.MeshBasicMaterial({ color: EXPLOSIONS.smokeColor, transparent: true, depthWrite: false });
const debrisMaterial = new THREE.MeshStandardMaterial({ color: EXPLOSIONS.debrisColor });
const transform = new THREE.Object3D();

function createSlots(capacity, extra) {
  return Array.from({ length: capacity }, () => ({ active: false, age: 0, position: new THREE.Vector3(), ...extra?.() }));
}

export function BattlefieldExplosions() {
  const flashMesh = useRef();
  const smokeMesh = useRef();
  const debrisMesh = useRef();
  const state = useRef({
    flashes: createSlots(EXPLOSIONS.flashCapacity),
    smokes: createSlots(EXPLOSIONS.smokeCapacity, () => ({ scale: 1, drift: new THREE.Vector3() })),
    debris: createSlots(EXPLOSIONS.debrisCapacity, () => ({ velocity: new THREE.Vector3() })),
    flashCursor: 0, smokeCursor: 0, debrisCursor: 0,
    timer: EXPLOSIONS.minInterval + random() * (EXPLOSIONS.maxInterval - EXPLOSIONS.minInterval),
  });

  useFrame((_frame, delta) => {
    const pool = state.current;
    if (gameState.paused) return;

    pool.timer -= delta;
    if (pool.timer <= 0) {
      pool.timer = EXPLOSIONS.minInterval + random() * (EXPLOSIONS.maxInterval - EXPLOSIONS.minInterval);
      const x = (random() * 2 - 1) * EXPLOSIONS.areaX;
      const z = EXPLOSIONS.areaZMin + random() * (EXPLOSIONS.areaZMax - EXPLOSIONS.areaZMin);
      const flash = pool.flashes[pool.flashCursor++ % EXPLOSIONS.flashCapacity];
      flash.active = true; flash.age = 0; flash.position.set(x, 0.15, z);
      for (let i = 0; i < 3; i++) {
        const smoke = pool.smokes[pool.smokeCursor++ % EXPLOSIONS.smokeCapacity];
        smoke.active = true; smoke.age = 0; smoke.scale = 0.6 + i * 0.3;
        smoke.position.set(x + (random() - 0.5) * 1.2, 0.3, z + (random() - 0.5) * 1.2);
        smoke.drift.set((random() - 0.5) * 0.6, 1.4 + i * 0.4, (random() - 0.5) * 0.6);
      }
      for (let i = 0; i < 14; i++) {
        const chunk = pool.debris[pool.debrisCursor++ % EXPLOSIONS.debrisCapacity];
        const angle = random() * Math.PI * 2;
        const speed = 2.5 + random() * 4;
        chunk.active = true; chunk.age = 0; chunk.position.set(x, 0.1, z);
        chunk.velocity.set(Math.cos(angle) * speed, 3 + random() * 4, Math.sin(angle) * speed);
      }
      EventBus.emit('battlefield-explosion', { position: [x, 0.15, z] });
    }

    let flashCount = 0;
    for (const slot of pool.flashes) {
      if (!slot.active) continue;
      slot.age += delta;
      if (slot.age >= EXPLOSIONS.flashLife) { slot.active = false; continue; }
      const t = slot.age / EXPLOSIONS.flashLife;
      transform.position.copy(slot.position);
      transform.scale.setScalar(1 + t * 5);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      flashMesh.current.setMatrixAt(flashCount++, transform.matrix);
    }
    flashMesh.current.count = flashCount;
    if (flashCount) flashMesh.current.instanceMatrix.needsUpdate = true;

    let smokeCount = 0;
    for (const slot of pool.smokes) {
      if (!slot.active) continue;
      slot.age += delta;
      if (slot.age >= EXPLOSIONS.smokeLife) { slot.active = false; continue; }
      slot.position.addScaledVector(slot.drift, delta);
      const t = slot.age / EXPLOSIONS.smokeLife;
      transform.position.copy(slot.position);
      transform.scale.setScalar(slot.scale * (0.5 + t * 2.2));
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      smokeMesh.current.setMatrixAt(smokeCount++, transform.matrix);
    }
    smokeMesh.current.count = smokeCount;
    if (smokeCount) smokeMesh.current.instanceMatrix.needsUpdate = true;

    let debrisCount = 0;
    for (const slot of pool.debris) {
      if (!slot.active) continue;
      slot.age += delta;
      if (slot.age >= EXPLOSIONS.debrisLife || slot.position.y < -1) { slot.active = false; continue; }
      slot.velocity.y -= 14 * delta;
      slot.position.addScaledVector(slot.velocity, delta);
      transform.position.copy(slot.position);
      transform.scale.setScalar(1 - slot.age / EXPLOSIONS.debrisLife * 0.5);
      transform.rotation.set(slot.age * 22, slot.age * 17, 0);
      transform.updateMatrix();
      debrisMesh.current.setMatrixAt(debrisCount++, transform.matrix);
    }
    debrisMesh.current.count = debrisCount;
    if (debrisCount) debrisMesh.current.instanceMatrix.needsUpdate = true;
  // Keep automatic scene rendering enabled: a positive priority takes it over.
  }, 0);

  return <>
    <instancedMesh ref={flashMesh} args={[flashGeometry, flashMaterial, EXPLOSIONS.flashCapacity]} frustumCulled={false} />
    <instancedMesh ref={smokeMesh} args={[smokeGeometry, smokeMaterial, EXPLOSIONS.smokeCapacity]} frustumCulled={false} />
    <instancedMesh ref={debrisMesh} args={[debrisGeometry, debrisMaterial, EXPLOSIONS.debrisCapacity]} frustumCulled={false} />
  </>;
}