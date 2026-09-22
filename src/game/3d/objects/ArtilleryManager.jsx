import { useRef, useReducer, useCallback, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { ARTILLERY, BALANCE } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { combat, findNearestEnemy } from '@/game/3d/combat';
import { battle, recordRemoval } from '@/game/3d/battleMetrics';
import { applySplash } from '@/game/3d/ballistics';
import { random } from '@/game/3d/random';
import { terrainHeight } from '@/game/3d/terrain';
import { artilleryState, launchShell } from '@/game/3d/objects/artilleryState';
import { explosionRequests } from '@/game/3d/objects/BattlefieldExplosions';
import { SupportDelivery } from '@/game/3d/objects/TankManager';
import { ArtilleryVisual } from '@/game/3d/objects/ArtilleryVisual';

const _muzzle = new THREE.Vector3();
const _target = new THREE.Vector3();
const [, py, pz] = ARTILLERY.barrelPivot;

// --- One self-propelled gun (inside Physics) ---------------------------------
function ArtilleryEntity({ id, zone, onDespawn }) {
  const bodyRef = useRef(), groupRef = useRef(), barrelRef = useRef(), recoilRef = useRef(), explosionRef = useRef();
  const entryRef = useRef(null);
  const cooldown = useRef(2), recoil = useRef(0), elevation = useRef(ARTILLERY.travelElevation);
  const deathTimer = useRef(0), died = useRef(false);
  const explosionMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff8833', transparent: true, opacity: 0 }), []);

  useEffect(() => {
    const body = bodyRef.current;
    body.setTranslation({ x: zone.x, y: terrainHeight(zone.x, zone.z), z: zone.z }, true);
    const profile = BALANCE.units.artillery;
    const entry = {
      id, team: 'friendly', type: 'artillery', sectorIndex: zone.x < -22.5 ? 0 : zone.x < 22.5 ? 1 : 2,
      squadId: `artillery-${id}`, profile, bodyRef, aimHeight: 1.2, heading: ARTILLERY.initialFacing,
      cooldown: 0, aiTarget: null, shotsFired: 0, health: profile.health, maxHealth: profile.health,
      alive: true, bornAt: battle.elapsed, targetScan: 0,
    };
    combat.units.push(entry);
    combat.byBody.set(body.handle, entry);
    entryRef.current = entry;
    return () => {
      entry.alive = false;
      if (combat.byBody.get(body.handle) === entry) combat.byBody.delete(body.handle);
      const i = combat.units.indexOf(entry);
      if (i >= 0) combat.units.splice(i, 1);
    };
  }, [id, zone]);

  useFrame((_, delta) => {
    const body = bodyRef.current, group = groupRef.current, entry = entryRef.current;
    if (!body || !group || !entry || gameState.paused) return;

    if (!entry.alive) {
      if (!died.current) {
        died.current = true;
        recordRemoval(entry, 'death');
        group.children[0].visible = false;
        explosionRef.current.visible = true;
      }
      deathTimer.current += delta;
      const t = Math.min(1, deathTimer.current / 2);
      explosionRef.current.scale.setScalar(1 + t * 4);
      explosionMat.opacity = 0.85 * (1 - t);
      if (deathTimer.current >= 2) onDespawn(id);
      return;
    }

    const pos = body.translation();
    cooldown.current -= delta;
    recoil.current = Math.max(0, recoil.current - delta * 1.4);

    // Indirect fire: no line of sight needed, only range and a minimum safe distance.
    const enemy = findNearestEnemy(entry, entry.profile.range);
    let firing = false;
    if (enemy) {
      const ep = enemy.bodyRef.current.translation();
      const dist = Math.hypot(ep.x - pos.x, ep.z - pos.z);
      if (dist >= ARTILLERY.minRange) {
        firing = true;
        group.rotation.y = Math.atan2(ep.x - pos.x, ep.z - pos.z);
        if (cooldown.current <= 0 && elevation.current > ARTILLERY.fireElevation - 0.05) {
          const yaw = group.rotation.y, el = elevation.current, reach = pz + Math.cos(el) * ARTILLERY.barrelLength;
          _muzzle.set(pos.x + Math.sin(yaw) * reach, pos.y + py + Math.sin(el) * ARTILLERY.barrelLength, pos.z + Math.cos(yaw) * reach);
          const a = random() * Math.PI * 2, r = Math.sqrt(random()) * ARTILLERY.scatter;
          _target.set(ep.x + Math.cos(a) * r, terrainHeight(ep.x, ep.z), ep.z + Math.sin(a) * r);
          if (launchShell(entry, _muzzle, _target)) {
            entry.shotsFired++;
            battle.shots.friendly++;
            cooldown.current = entry.profile.cooldown;
            recoil.current = 1;
            if (combat.muzzleEffects.length < 128) combat.muzzleEffects.push({
              position: _muzzle.toArray(), direction: [Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)],
            });
          }
        }
      }
    }
    if (!firing && pos.z > ARTILLERY.holdZ) {
      const z = Math.max(ARTILLERY.holdZ, pos.z - ARTILLERY.moveSpeed * delta);
      body.setNextKinematicTranslation({ x: pos.x, y: terrainHeight(pos.x, z), z });
      group.rotation.y = ARTILLERY.initialFacing;
    }

    const goal = firing ? ARTILLERY.fireElevation : ARTILLERY.travelElevation;
    elevation.current += (goal - elevation.current) * (1 - Math.exp(-3 * delta));
    barrelRef.current.rotation.x = -elevation.current;
    recoilRef.current.position.z = -ARTILLERY.recoil * recoil.current * recoil.current;
  });

  return (
    <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false} lockRotations canSleep={false} name="friendly-artillery">
      <CuboidCollider args={[ARTILLERY.colliderHalfWidth, ARTILLERY.colliderHalfHeight, ARTILLERY.colliderHalfDepth]} position={[0, ARTILLERY.colliderY, 0]} />
      <group ref={groupRef}>
        <ArtilleryVisual barrelRef={barrelRef} recoilRef={recoilRef} explosionRef={explosionRef} explosionMat={explosionMat} />
      </group>
    </RigidBody>
  );
}

// --- Artillery units (inside Physics) ----------------------------------------
export function ArtilleryEntityManager() {
  const unitsRef = useRef([]);
  const [, publish] = useReducer(n => n + 1, 0);
  useEffect(() => {
    const reset = () => { unitsRef.current = []; artilleryState.reset(); publish(); EventBus.emit('artillery-count-changed', 0); };
    EventBus.on('reset-game', reset);
    return () => EventBus.off('reset-game', reset);
  }, []);
  useFrame(() => {
    if (gameState.paused || !artilleryState.pendingSpawns.length) return;
    while (artilleryState.pendingSpawns.length && unitsRef.current.length < ARTILLERY.delivery.maxAlive)
      unitsRef.current.push(artilleryState.pendingSpawns.shift());
    artilleryState.pendingSpawns.length = 0;
    publish();
    EventBus.emit('artillery-count-changed', unitsRef.current.length);
  });
  const handleDespawn = useCallback(id => {
    unitsRef.current = unitsRef.current.filter(u => u.id !== id);
    publish();
    EventBus.emit('artillery-count-changed', unitsRef.current.length);
  }, []);
  return <>{unitsRef.current.map(u => <ArtilleryEntity key={u.id} id={u.id} zone={u.zone} onDespawn={handleDespawn} />)}</>;
}

// --- Pooled arcing shells with splash damage ----------------------------------
const shellGeometry = new THREE.SphereGeometry(0.28, 8, 6);
const shellMaterial = new THREE.MeshBasicMaterial({ color: ARTILLERY.shellColor, toneMapped: false });
const _obj = new THREE.Object3D();
export function ArtilleryShells() {
  const ref = useRef();
  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    let count = 0;
    for (const s of artilleryState.shells) {
      if (!s.active) continue;
      if (!gameState.paused) s.t += delta / ARTILLERY.shellFlightTime;
      if (s.t >= 1) {
        s.active = false;
        artilleryState.impacts++;
        applySplash(s.shooter, s.to.x, s.to.z, ARTILLERY.splashRadius, s.shooter.profile.damage);
        explosionRequests.push([s.to.x, s.to.z, 1.6]);
        continue;
      }
      _obj.position.lerpVectors(s.from, s.to, s.t);
      _obj.position.y += s.apex * 4 * s.t * (1 - s.t);
      _obj.scale.setScalar(1);
      _obj.updateMatrix();
      mesh.setMatrixAt(count++, _obj.matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[shellGeometry, shellMaterial, ARTILLERY.maxShells]} frustumCulled={false} raycast={() => null} />;
}

const landArtillery = zone => artilleryState.pendingSpawns.push({ id: artilleryState.nextId++, zone });
export function ArtilleryDeliveryManager() {
  return <SupportDelivery unitType="artillery" delivery={ARTILLERY.delivery} onLand={landArtillery} />;
}