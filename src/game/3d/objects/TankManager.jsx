import { useRef, useReducer, useCallback, useEffect, useMemo, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { EventBus } from '@/game/EventBus';
import { TANK, TANK_DELIVERY, CARGO_SHIP, BALANCE, FRONT, MAP } from '@/game/config';
import { tankState } from '@/game/3d/objects/tankState';
import { cargoShipState } from '@/game/3d/objects/cargoShipState';
import { gameState } from '@/game/3d/world';
import { combat, findNearestEnemy } from '@/game/3d/combat';
import { battle, recordRemoval } from '@/game/3d/battleMetrics';
import { fireShot, canSeeTarget } from '@/game/3d/ballistics';
import { TankVisual } from '@/game/3d/objects/TankVisual';

useGLTF.preload(CARGO_SHIP.modelUrl);



// --- Scratch vectors (no per-frame allocation) ------------------------------
const _muzzle = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();

// --- Tank entity (inside Physics) -------------------------------------------
const TankEntity = function TankEntity({ id, zone, onDespawn }) {
  const bodyRef = useRef();
  const groupRef = useRef();
  const explosionRef = useRef();
  const combatEntryRef = useRef(null);
  const cooldown = useRef(0);
  const deathTimer = useRef(0);
  const hasDied = useRef(false);
  const sectorIndex = zone.x < -22.5 ? 0 : zone.x < 22.5 ? 1 : 2;
  const explosionMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff8833', transparent: true, opacity: 0 }), []);

  // Body activation and combat registration
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setTranslation({ x: zone.x, y: 0.5, z: zone.z }, true);

    const profile = BALANCE.units.tank;
    const entry = {
      id, team: 'friendly', type: 'tank', sectorIndex, squadId: `tank-${id}`,
      profile, bodyRef, aimHeight: 1.0, heading: TANK.initialFacing,
      cooldown: 0, aiTarget: null,
      health: profile.health, maxHealth: profile.health,
      alive: true, bornAt: battle.elapsed, targetScan: 0,
    };
    combat.units.push(entry);
    combat.byBody.set(body.handle, entry);
    combatEntryRef.current = entry;

    return () => {
      entry.alive = false;
      if (combat.byBody.get(body.handle) === entry) combat.byBody.delete(body.handle);
      const idx = combat.units.indexOf(entry);
      if (idx >= 0) combat.units.splice(idx, 1);
      combatEntryRef.current = null;
    };
  }, [id, zone, sectorIndex]);

  useFrame((_state, delta) => {
    const body = bodyRef.current;
    const group = groupRef.current;
    if (!body || !group) return;
    if (gameState.paused) return;

    const entry = combatEntryRef.current;
    if (!entry) return;

    // --- Death animation: explosion sphere scales up and fades --------------
    if (!entry.alive) {
      if (!hasDied.current) {
        hasDied.current = true;
        recordRemoval(entry, 'death');
        if (group) group.visible = false;
        if (explosionRef.current) {
          explosionRef.current.visible = true;
          explosionMat.opacity = 0.85;
        }
      }
      deathTimer.current += delta;
      const t = Math.min(1, deathTimer.current / 2);
      if (explosionRef.current) {
        explosionRef.current.scale.setScalar(1 + t * 4);
        explosionMat.opacity = 0.85 * (1 - t);
      }
      if (deathTimer.current >= 2) { onDespawn(id); return; }
      return;
    }

    const pos = body.translation();
    const frontlineZ = FRONT.rows[2]; // z=14 — defensive hold line

    // --- Drive to frontline if not there yet --------------------------------
    if (pos.z > frontlineZ + 2) {
      body.setLinvel({ x: 0, y: 0, z: -TANK.moveSpeed }, true);
      group.rotation.y = TANK.initialFacing; // face -Z
    } else {
      // Hold position at the frontline
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);

      // --- Scan for enemies and fire -----------------------------------------
      const enemy = findNearestEnemy(entry, entry.profile.range, canSeeTarget);
      if (enemy) {
        const ep = enemy.bodyRef.current.translation();
        // Face enemy
        group.rotation.y = Math.atan2(ep.x - pos.x, ep.z - pos.z);

        // Fire cannon if cooldown elapsed
        cooldown.current -= delta;
        if (cooldown.current <= 0) {
          const yaw = group.rotation.y;
          _muzzle.set(
            pos.x + Math.sin(yaw) * 1.5,
            pos.y + 1.0,
            pos.z + Math.cos(yaw) * 1.5
          );
          _aim.set(ep.x, ep.y + 0.9, ep.z);
          fireShot(entry, _muzzle, _aim);
          cooldown.current = entry.profile.cooldown;
        }
      }
    }
  });

  return (
    <RigidBody ref={bodyRef} colliders={false} lockRotations canSleep={false} name="friendly-tank" ccd>
      <CuboidCollider
        args={[TANK.colliderHalfWidth, TANK.colliderHalfHeight, TANK.colliderHalfDepth]}
        position={[0, TANK.colliderY, 0]}
      />
      <group ref={groupRef} visible={true}>
        <TankVisual explosionRef={explosionRef} explosionMatRef={explosionMat} />
      </group>
    </RigidBody>
  );
};

// --- Tank delivery ship (visual only, outside Physics) ----------------------
const _shipDir = new THREE.Vector3();
function moveToward(pos, tx, ty, tz, step) {
  _shipDir.set(tx - pos.x, ty - pos.y, tz - pos.z);
  const dist = _shipDir.length();
  if (dist <= step) { pos.set(tx, ty, tz); return true; }
  pos.addScaledVector(_shipDir, 1 / dist * step);
  return false;
}

function TankDeliveryShip({ shipId, zone, onLand, onComplete }) {
  const groupRef = useRef();
  const phase = useRef('approach');
  const unloadTimer = useRef(0);
  const landed = useRef(false);
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
          if (!landed.current) {
            landed.current = true;
            onLand();
          }
        }
        break;
      }
      case 'unload': {
        unloadTimer.current += delta;
        if (unloadTimer.current >= CARGO_SHIP.landingPause) {
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

// --- Tank delivery manager (outside Physics) --------------------------------
export function TankDeliveryManager() {
  const shipsRef = useRef([]);
  const deliveryTimer = useRef(-TANK_DELIVERY.startDelay);
  const [, publish] = useReducer(n => n + 1, 0);

  useEffect(() => {
    const reset = () => {
      shipsRef.current = [];
      deliveryTimer.current = -TANK_DELIVERY.startDelay;
      publish();
    };
    EventBus.on('reset-game', reset);
    return () => EventBus.off('reset-game', reset);
  }, []);

  useFrame((_, delta) => {
    if (gameState.paused) return;

    deliveryTimer.current += delta;
    if (deliveryTimer.current < TANK_DELIVERY.interval) return;
    deliveryTimer.current = 0;

    // Only launch if under the tank population cap
    const activeTanks = combat.units.filter(u => u.team === 'friendly' && u.type === 'tank' && u.alive).length;
    if (activeTanks >= TANK_DELIVERY.maxAlive) return;

    // Find a free landing zone (shared with soldier delivery ships)
    const zone = CARGO_SHIP.landingZones.find(z => !cargoShipState.occupiedZones.has(z.id));
    if (!zone) return;

    cargoShipState.occupiedZones.add(zone.id);
    cargoShipState.activeShipCount++;
    const shipId = tankState.nextShipId++;
    shipsRef.current.push({ id: shipId, zone });
    publish();
  });

  const handleComplete = useCallback(shipId => {
    const ship = shipsRef.current.find(s => s.id === shipId);
    if (ship) {
      cargoShipState.occupiedZones.delete(ship.zone.id);
      cargoShipState.activeShipCount--;
    }
    shipsRef.current = shipsRef.current.filter(s => s.id !== shipId);
    publish();
  }, []);

  return (
    <>
      {shipsRef.current.map(ship => (
        <Suspense key={ship.id} fallback={null}>
          <TankDeliveryShip
            shipId={ship.id}
            zone={ship.zone}
            onLand={() => {
              tankState.pendingSpawns.push({ id: tankState.nextTankId++, zone: ship.zone });
              tankState.firstTankDelivered = true;
            }}
            onComplete={handleComplete}
          />
        </Suspense>
      ))}
    </>
  );
}

// --- Tank entity manager (inside Physics) -----------------------------------
export function TankEntityManager() {
  const tanksRef = useRef([]);
  const [, publish] = useReducer(n => n + 1, 0);

  useEffect(() => {
    const reset = () => {
      tanksRef.current = [];
      publish();
      EventBus.emit('tank-count-changed', 0);
    };
    EventBus.on('reset-game', reset);
    return () => EventBus.off('reset-game', reset);
  }, []);

  useFrame((_, delta) => {
    if (gameState.paused) return;
    // Consume pending spawns (discrete event, not per-frame)
    let spawned = false;
    while (tankState.pendingSpawns.length > 0 && tanksRef.current.length < TANK_DELIVERY.maxAlive) {
      const spawn = tankState.pendingSpawns.shift();
      tanksRef.current.push(spawn);
      spawned = true;
    }
    if (spawned) {
      publish();
      EventBus.emit('tank-count-changed', tanksRef.current.length);
    }
  });

  const handleDespawn = useCallback(id => {
    tanksRef.current = tanksRef.current.filter(t => t.id !== id);
    publish();
    EventBus.emit('tank-count-changed', tanksRef.current.length);
  }, []);

  return (
    <>
      {tanksRef.current.map(tank => (
        <TankEntity key={tank.id} id={tank.id} zone={tank.zone} onDespawn={handleDespawn} />
      ))}
    </>
  );
}