import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { COMBAT } from '@/game/config';
import { combat } from '@/game/3d/combat';

const POOL_SIZE = 50;

export function ProjectileManager() {
  const projectiles = useRef(
    Array.from({ length: POOL_SIZE }, () => ({
      active: false,
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      targetId: null,
      damage: 0,
      lifetime: 0,
    }))
  );
  const meshRefs = useRef([]);

  // Reset on game reset
  useEffect(() => {
    const onReset = () => {
      combat.pendingProjectiles.length = 0;
      for (const p of projectiles.current) p.active = false;
    };
    EventBus.on('reset-game', onReset);
    return () => EventBus.off('reset-game', onReset);
  }, []);

  useFrame((_state, delta) => {
    // Spawn new projectiles from the queue
    while (combat.pendingProjectiles.length > 0) {
      const req = combat.pendingProjectiles.shift();
      const slot = projectiles.current.find((p) => !p.active);
      if (!slot) break; // pool full

      slot.active = true;
      slot.position.set(req.origin[0], req.origin[1], req.origin[2]);
      slot.targetId = req.targetId;
      slot.damage = req.damage;
      slot.lifetime = 0;

      // Calculate initial direction toward target
      const target = combat.units.find((u) => u.id === req.targetId && u.alive);
      if (target && target.bodyRef.current) {
        const tPos = target.bodyRef.current.translation();
        slot.direction.set(
          tPos.x - slot.position.x,
          tPos.y - slot.position.y,
          tPos.z - slot.position.z
        ).normalize();
      } else {
        slot.direction.set(0, 0, -1);
      }
    }

    // Update active projectiles
    for (const proj of projectiles.current) {
      if (!proj.active) continue;

      proj.lifetime += delta;
      if (proj.lifetime > COMBAT.projectileLifetime) {
        proj.active = false;
        continue;
      }

      // Check if target still alive
      const target = combat.units.find((u) => u.id === proj.targetId && u.alive);
      if (!target || !target.bodyRef.current) {
        proj.active = false;
        continue;
      }

      // Move projectile
      proj.position.addScaledVector(proj.direction, COMBAT.projectileSpeed * delta);

      // Check hit
      const tPos = target.bodyRef.current.translation();
      const dx = tPos.x - proj.position.x;
      const dy = tPos.y - proj.position.y;
      const dz = tPos.z - proj.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < 1.0) {
        target.health -= proj.damage;
        if (target.health <= 0) {
          target.alive = false;
        }
        proj.active = false;
      }
    }

    // Update mesh positions
    for (let i = 0; i < projectiles.current.length; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const proj = projectiles.current[i];
      mesh.visible = proj.active;
      if (proj.active) {
        mesh.position.copy(proj.position);
      }
    }
  });

  return (
    <>
      {Array.from({ length: POOL_SIZE }).map((_, i) => (
        <mesh key={i} ref={(el) => { meshRefs.current[i] = el; }} visible={false}>
          <sphereGeometry args={[0.2, 8, 8]} />
          <meshStandardMaterial color="#ffd700" emissive="#ff6600" emissiveIntensity={0.8} />
        </mesh>
      ))}
    </>
  );
}