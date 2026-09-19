import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { COMBAT, BALANCE } from '@/game/config';
import { battle } from '@/game/3d/battleMetrics';
import { combat } from '@/game/3d/combat';
import { gameState } from '@/game/3d/world';
import { trace, applyImpact } from '@/game/3d/ballistics';

const boltGeometry = new THREE.CapsuleGeometry(0.05, 0.1, 4, 6); // ~25% original thickness
boltGeometry.rotateX(Math.PI / 2); // align along Z (direction of travel)
const friendlyMaterial = new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#3b82f6', emissiveIntensity: 0.6, toneMapped: false });
const enemyMaterial = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 0.6, toneMapped: false });
const BOLT_FORWARD = new THREE.Vector3(0, 0, 1);
export function ProjectileManager() {
  const { world, rapier } = useRapier();
  const scene = useThree(s => s.scene);
  const pool = useRef(null);
  const friendlyMesh = useRef();
  const enemyMesh = useRef();
  if (!pool.current) {
    const capacity = BALANCE.projectilePoolPerTeam;
    pool.current = { slots: Array.from({ length: capacity * 2 }, () => ({ active: false, position: new THREE.Vector3(), direction: new THREE.Vector3(), lifetime: 0 })),
      active: new Set(), free: { friendly: [], enemy: [] }, transform: new THREE.Object3D() };
    for (let i = 0; i < capacity; i++) { pool.current.free.friendly.push(i); pool.current.free.enemy.push(i + capacity); }
  }
  useEffect(() => {
    const cover = []; scene.traverse(o => { if (o.userData.shotCover) cover.push(o); });
    combat.physics = { world, rapier, cover }; combat.projectiles = pool.current.slots;
    if (friendlyMesh.current) { friendlyMesh.current.count = 0; friendlyMesh.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
    if (enemyMesh.current) { enemyMesh.current.count = 0; enemyMesh.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
    const reset = () => {
      combat.pendingProjectiles.length = 0;
      const p = pool.current; p.active.clear(); p.free.friendly.length = 0; p.free.enemy.length = 0;
      p.slots.forEach((shot, i) => { shot.active = false; shot.shooter = null;
        p.free[i < BALANCE.projectilePoolPerTeam ? 'friendly' : 'enemy'].push(i); });
      if (friendlyMesh.current) friendlyMesh.current.count = 0;
      if (enemyMesh.current) enemyMesh.current.count = 0;
      combat.stats = { shots: 0, playerShots: 0, hits: 0, coverHits: 0, damage: 0 };
      combat.lastShot = null; combat.lastImpact = null;
    };
    EventBus.on('reset-game', reset);
    return () => { EventBus.off('reset-game', reset); reset(); combat.physics = null; combat.projectiles = []; };
  }, [world, rapier, scene]);

  useFrame((_state, delta) => {
    if (gameState.paused) return;
    const poolState = pool.current;
    for (const req of combat.pendingProjectiles) {
      const index = poolState.free[req.team].pop();
      if (index === undefined) { battle.projectileOverflow++; continue; }
      const slot = poolState.slots[index];
      Object.assign(slot, { active: true, shooter: req.shooter, shooterId: req.shooterId, team: req.team, damage: req.damage, player: req.player, lifetime: 0 });
      slot.position.fromArray(req.origin); slot.direction.fromArray(req.direction);
      poolState.active.add(index);
    }
    combat.pendingProjectiles.length = 0;
    let friendlyCount = 0, enemyCount = 0;
    for (const index of poolState.active) {
      const p = poolState.slots[index];
      const dt = Math.min(delta, Math.max(0, COMBAT.projectileLifetime - p.lifetime));
      const distance = COMBAT.projectileSpeed * dt;
      const hit = trace(p.position, p.direction, distance, p.shooter);
      if (hit) { applyImpact(hit, p); p.active = false; }
      else { p.position.addScaledVector(p.direction, distance); p.lifetime += delta; if (p.lifetime >= COMBAT.projectileLifetime) p.active = false; }
      if (!p.active) {
        poolState.active.delete(index); poolState.free[p.team].push(index); p.shooter = null;
        continue;
      }
      const mesh = p.team === 'friendly' ? friendlyMesh.current : enemyMesh.current;
      const at = p.team === 'friendly' ? friendlyCount++ : enemyCount++;
      poolState.transform.position.copy(p.position);
      poolState.transform.quaternion.setFromUnitVectors(BOLT_FORWARD, p.direction);
      poolState.transform.updateMatrix();
      mesh.setMatrixAt(at, poolState.transform.matrix);
    }
    friendlyMesh.current.count = friendlyCount; enemyMesh.current.count = enemyCount;
    friendlyMesh.current.instanceMatrix.needsUpdate = true; enemyMesh.current.instanceMatrix.needsUpdate = true;
  });
  return <>
    <instancedMesh ref={friendlyMesh} args={[boltGeometry, friendlyMaterial, BALANCE.projectilePoolPerTeam]} frustumCulled={false} />
    <instancedMesh ref={enemyMesh} args={[boltGeometry, enemyMaterial, BALANCE.projectilePoolPerTeam]} frustumCulled={false} />
  </>;
}