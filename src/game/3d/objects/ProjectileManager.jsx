import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { COMBAT } from '@/game/config';
import { AIM } from '@/game/3d/weapons';
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
  const projectiles = useRef(Array.from({ length: AIM.poolSize }, () => ({ active: false, position: new THREE.Vector3(), direction: new THREE.Vector3(), lifetime: 0 })));
  const meshes = useRef([]);
  useEffect(() => {
    const cover = []; scene.traverse(o => { if (o.userData.shotCover) cover.push(o); });
    combat.physics = { world, rapier, cover }; combat.projectiles = projectiles.current;
    const reset = () => {
      combat.pendingProjectiles.length = 0;
      projectiles.current.forEach((p,i) => { p.active = false; if (meshes.current[i]) meshes.current[i].visible = false; });
      combat.stats = { shots: 0, playerShots: 0, hits: 0, coverHits: 0, damage: 0 };
      combat.lastShot = null; combat.lastImpact = null;
    };
    EventBus.on('reset-game', reset);
    return () => { EventBus.off('reset-game', reset); reset(); combat.physics = null; combat.projectiles = []; };
  }, [world, rapier, scene]);

  useFrame((_state, delta) => {
    if (gameState.paused) return;
    while (combat.pendingProjectiles.length) {
      const req = combat.pendingProjectiles.shift();
      const slot = projectiles.current.find(p => !p.active);
      if (!slot) continue;
      Object.assign(slot, { active: true, shooter: req.shooter, shooterId: req.shooterId, team: req.team, damage: req.damage, lifetime: 0 });
      slot.position.fromArray(req.origin); slot.direction.fromArray(req.direction);
    }
    for (let i = 0; i < projectiles.current.length; i++) {
      const p = projectiles.current[i];
      if (p.active) {
        const dt = Math.min(delta, Math.max(0, COMBAT.projectileLifetime - p.lifetime));
        const distance = COMBAT.projectileSpeed * dt;
        const hit = trace(p.position, p.direction, distance, p.shooter);
        if (hit) { applyImpact(hit, p); p.active = false; }
        else { p.position.addScaledVector(p.direction, distance); p.lifetime += delta; if (p.lifetime >= COMBAT.projectileLifetime) p.active = false; }
      }
      const mesh = meshes.current[i];
      if (mesh) {
        mesh.visible = p.active;
        if (p.active) {
          mesh.position.copy(p.position);
          mesh.quaternion.setFromUnitVectors(BOLT_FORWARD, p.direction);
          mesh.material = p.team === 'friendly' ? friendlyMaterial : enemyMaterial;
        }
      }
    }
  });
  return <>{projectiles.current.map((_,i) => <mesh key={i} ref={el => { meshes.current[i] = el; }} geometry={boltGeometry} material={friendlyMaterial} visible={false} />)}</>;
}