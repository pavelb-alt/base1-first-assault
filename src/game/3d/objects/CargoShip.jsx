import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { CARGO_SHIP, MAP } from '@/game/config';
import { cargoShipState } from '@/game/3d/objects/cargoShipState';
import { gameState } from '@/game/3d/world';

useGLTF.preload(CARGO_SHIP.modelUrl);

// Scratch vector reused for movement direction.
const _dir = new THREE.Vector3();

function moveToward(pos, tx, ty, tz, step) {
  _dir.set(tx - pos.x, ty - pos.y, tz - pos.z);
  const dist = _dir.length();
  if (dist <= step) { pos.set(tx, ty, tz); return true; }
  pos.addScaledVector(_dir, 1 / dist * step);
  return false;
}

function computeSpawnOffsets(slots, zone) {
  return slots.map((slot, i) => {
    const offset = (i - (slots.length - 1) / 2) * CARGO_SHIP.soldierSpacing;
    return {
      index: slot.index,
      spawnOffset: { x: zone.x + CARGO_SHIP.soldierOffset, z: zone.z + offset },
    };
  });
}

export function CargoShip({ shipId, delivery, zone, onComplete }) {
  const groupRef = useRef();
  const phase = useRef('approach');
  const unloadTimer = useRef(0);
  const unloaded = useRef(false);
  const pos = useRef(new THREE.Vector3(zone.x, CARGO_SHIP.cruiseAltitude, MAP.HALF + 30));

  const { scene } = useGLTF(CARGO_SHIP.modelUrl);

  const model = useMemo(() => {
    const clone = cloneSkeleton(scene);
    clone.traverse(node => {
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z);
    const scale = CARGO_SHIP.targetLength / maxDim;
    // Center in X/Z, bottom at y=0 (in parent's unscaled space).
    const offset = new THREE.Vector3(-center.x * scale, -box.min.y * scale, -center.z * scale);
    return { clone, scale, offset };
  }, [scene]);

  useFrame((_, delta) => {
    if (gameState.paused) return;
    const group = groupRef.current;
    if (!group) return;

    const p = pos.current;
    let targetYaw = group.rotation.y;

    switch (phase.current) {
      case 'approach': {
        if (moveToward(p, zone.x, CARGO_SHIP.cruiseAltitude, zone.z, CARGO_SHIP.approachSpeed * delta)) {
          phase.current = 'descend';
        }
        targetYaw = Math.atan2(zone.x - p.x, zone.z - p.z);
        break;
      }
      case 'descend': {
        if (moveToward(p, zone.x, 0, zone.z, CARGO_SHIP.descentSpeed * delta)) {
          phase.current = 'unload';
          unloadTimer.current = 0;
          if (!unloaded.current) {
            unloaded.current = true;
            cargoShipState.firstLanded = true;
            cargoShipState.readyDeliveries.push({
              deliveryId: delivery.deliveryId,
              slots: computeSpawnOffsets(delivery.slots, zone),
            });
          }
        }
        break;
      }
      case 'unload': {
        unloadTimer.current += delta;
        const minUnload = delivery.deliveryId <= 1 ? 3.5 : CARGO_SHIP.landingPause;
        if (unloadTimer.current >= minUnload) {
          phase.current = 'depart';
        }
        break;
      }
      case 'depart': {
        const dz = MAP.HALF + 50;
        if (moveToward(p, zone.x, CARGO_SHIP.cruiseAltitude, dz, CARGO_SHIP.takeoffSpeed * delta)) {
          phase.current = 'done';
          onComplete(shipId);
        }
        targetYaw = Math.atan2(zone.x - p.x, dz - p.z);
        break;
      }
    }

    group.position.copy(p);

    // Smooth yaw toward travel direction (skip during vertical descent / unload).
    if (phase.current === 'approach' || phase.current === 'depart') {
      let diff = targetYaw - group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      group.rotation.y += diff * Math.min(1, delta * 3);
    }
  });

  return (
    <group ref={groupRef}>
      <group position={model.offset} scale={model.scale}>
        <primitive object={model.clone} />
      </group>
    </group>
  );
}