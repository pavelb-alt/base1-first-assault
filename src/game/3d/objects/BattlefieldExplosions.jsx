import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { dressingNoise } from '@/game/3d/dressing/groundAppearance';
import { terrainHeight } from '@/game/3d/terrain';
import { EXPLOSIONS as E, CINEMATIC as C, PERFORMANCE } from '@/game/config';
import { blastLayer } from '@/game/3d/objects/blastMaterial';

export const explosionVisuals = { bursts: 0, smoke: 0, fire: 0, debris: 0 };
// Gameplay blasts (artillery shells) queue [x, z, power]; drained each frame.
export const explosionRequests = [];
const debrisGeometry = new THREE.TetrahedronGeometry(0.1);
const debrisMaterial = new THREE.MeshStandardMaterial({ color: '#685343', roughness: 1 });
const transform = new THREE.Object3D();
const dark = new THREE.Color('#51483e'), dust = new THREE.Color('#b8a080');
const hot = new THREE.Color('#fff0b0'), cooling = new THREE.Color('#ee6020'), tint = new THREE.Color();
function slots(n) {
  return Array.from({ length: n }, () => ({ active: false, age: 0, life: 1, size: 1, dust: false,
    position: new THREE.Vector3(), velocity: new THREE.Vector3() }));
}

export function BattlefieldExplosions() {
  const smokeMesh = useRef(), fireMesh = useRef(), debrisMesh = useRef(), glow = useRef();
  const layers = useMemo(() => ({ smoke: blastLayer(C.smokeCapacity), fire: blastLayer(C.fireCapacity, true) }), []);
  const pool = useMemo(() => ({ smoke: slots(C.smokeCapacity), fire: slots(C.fireCapacity), debris: slots(C.debrisCapacity),
    smokeCursor: 0, fireCursor: 0, debrisCursor: 0, timer: E.minInterval, noise: 80000, glowAge: 1 }), []);
  // Independent indexed visual noise keeps particle count changes out of combat RNG.
  const noise = () => dressingNoise(pool.noise++);
  useEffect(() => {
    const reset = () => {
      for (const kind of ['smoke', 'fire', 'debris']) for (const p of pool[kind]) p.active = false;
      pool.timer = E.minInterval; pool.glowAge = 1; pool.noise = 80000; explosionRequests.length = 0;
      Object.assign(explosionVisuals, { bursts: 0, smoke: 0, fire: 0, debris: 0 });
    };
    reset(); EventBus.on('reset-game', reset);
    return () => { EventBus.off('reset-game', reset); layers.smoke.dispose(); layers.fire.dispose(); };
  }, [pool, layers]);

  const emit = (kind, x, y, z, vx, vy, vz, size, life, isDust = false) => {
    const p = pool[kind][pool[`${kind}Cursor`]++ % pool[kind].length];
    p.active = true; p.age = 0; p.life = life; p.size = size; p.dust = isDust;
    p.position.set(x, y, z); p.velocity.set(vx, vy, vz);
  };
  const burst = (x, z, power) => {
      const y = terrainHeight(x, z) + 0.25;
      for (let i = 0; i < Math.ceil(7 * PERFORMANCE.ambientParticleScale); i++) {
        const a = noise() * Math.PI * 2;
        emit('fire', x + Math.cos(a) * .6, y + .25 + noise(), z + Math.sin(a) * .6,
          Math.cos(a) * 1.4, 1.5 + noise() * 2, Math.sin(a) * 1.4, power * (.7 + noise()), C.fireLife * (.65 + noise() * .35));
      }
      for (let i = 0; i < Math.ceil(9 * PERFORMANCE.ambientParticleScale); i++) {
        const a = noise() * Math.PI * 2;
        emit('smoke', x + Math.cos(a) * .7, y + .5, z + Math.sin(a) * .7,
          Math.cos(a) * 1.2 + .6, 1.1 + noise() * 1.8, Math.sin(a) * 1.2,
          power * (.7 + noise() * .8), C.smokeLife * (.8 + noise() * .2));
      }
      const dustCount = Math.ceil(12 * PERFORMANCE.ambientParticleScale);
      for (let i = 0; i < dustCount; i++) {
        const a = i / dustCount * Math.PI * 2, speed = 2.8 + noise() * 2;
        emit('smoke', x, y, z, Math.cos(a) * speed, .1, Math.sin(a) * speed,
          power * (.6 + noise() * .4), C.dustLife, true);
      }
      for (let i = 0; i < Math.ceil(24 * PERFORMANCE.ambientParticleScale); i++) {
        const a = noise() * Math.PI * 2, speed = 2 + noise() * 6;
        emit('debris', x, y, z, Math.cos(a) * speed, 4 + noise() * 7, Math.sin(a) * speed,
          .5 + noise() * 1.2, 1.5);
      }
      glow.current.position.set(x, y + 1.5, z); pool.glowAge = 0;
      explosionVisuals.bursts++;
      EventBus.emit('battlefield-explosion', { position: [x, y, z] });
  };
  useFrame((_, delta) => {
    if (gameState.paused) return;
    const dt = Math.min(delta, 0.08);
    pool.timer -= dt;
    if (pool.timer <= 0) {
      pool.timer = E.minInterval + noise() * (E.maxInterval - E.minInterval);
      burst((noise() * 2 - 1) * E.areaX, E.areaZMin + noise() * (E.areaZMax - E.areaZMin), 0.8 + noise() * 0.6);
    }
    while (explosionRequests.length) { const [x, z, power] = explosionRequests.shift(); burst(x, z, power); }
    pool.glowAge += dt; glow.current.intensity = Math.max(0, 1 - pool.glowAge / .3) * 45;
    for (const kind of ['smoke', 'fire', 'debris']) {
      const mesh = kind === 'smoke' ? smokeMesh.current : kind === 'fire' ? fireMesh.current : debrisMesh.current;
      const data = layers[kind]?.geometry.attributes;
      let count = 0;
      for (const p of pool[kind]) {
        if (!p.active) continue;
        p.age += dt;
        if (p.age >= p.life) { p.active = false; continue; }
        const t = p.age / p.life;
        if (kind === 'debris') p.velocity.y -= 16 * dt;
        else p.velocity.multiplyScalar(Math.exp(-dt * (p.dust ? 1 : .25)));
        p.position.addScaledVector(p.velocity, dt);
        if (kind === 'debris' && p.position.y < terrainHeight(p.position.x, p.position.z)) { p.active = false; continue; }
        transform.position.copy(p.position);
        const scale = p.size * (kind === 'debris' ? 1 - t * .7 : kind === 'fire' ? .45 + t * 2.4 : .35 + Math.sqrt(t) * 2.3);
        transform.scale.set(scale, p.dust ? scale * .38 : scale, scale);
        transform.rotation.set(p.age * 3, p.age * 5, 0); transform.updateMatrix();
        mesh.setMatrixAt(count, transform.matrix);
        if (data) {
          if (kind === 'fire') tint.copy(hot).lerp(cooling, t);
          else tint.copy(p.dust ? dust : dark).lerp(dust, t * .5);
          const fade = Math.min(1, t * (kind === 'fire' ? 30 : 16)) * Math.pow(1 - t, kind === 'fire' ? 1.3 : .8);
          data.particleTint.setXYZW(count, tint.r, tint.g, tint.b, fade * (p.dust ? .28 : kind === 'fire' ? .95 : .58));
          data.particleAge.setX(count, p.age + p.size * 7);
        }
        count++;
      }
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
      if (data) { data.particleTint.needsUpdate = true; data.particleAge.needsUpdate = true; }
      explosionVisuals[kind] = count;
    }
  });
  return <group name="Cinematic shellfire">
    <instancedMesh name="Rolling blast smoke" ref={smokeMesh} args={[layers.smoke.geometry, layers.smoke.material, C.smokeCapacity]} frustumCulled={false} count={0} />
    <instancedMesh name="Hot blast cores" ref={fireMesh} args={[layers.fire.geometry, layers.fire.material, C.fireCapacity]} frustumCulled={false} count={0} />
    <instancedMesh name="Shell debris" ref={debrisMesh} args={[debrisGeometry, debrisMaterial, C.debrisCapacity]} frustumCulled={false} count={0} />
    <pointLight ref={glow} color="#ffab4c" intensity={0} distance={13} decay={2} />
  </group>;
}