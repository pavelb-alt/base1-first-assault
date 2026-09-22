import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { ARTILLERY, BALANCE, TANK } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { combat, findNearestEnemy } from '@/game/3d/combat';
import { battle, recordRemoval } from '@/game/3d/battleMetrics';
import { random } from '@/game/3d/random';
import { terrainHeight } from '@/game/3d/terrain';
import { artilleryState } from '@/game/3d/objects/artilleryState';
import { ArtilleryVisual } from '@/game/3d/objects/ArtilleryVisual';

const tipForward = ARTILLERY.pivot[2] + Math.cos(ARTILLERY.barrelPitch) * (ARTILLERY.barrelLength + 0.4);
const tipHeight = ARTILLERY.pivot[1] + Math.sin(ARTILLERY.barrelPitch) * (ARTILLERY.barrelLength + 0.4);

// Indirect-fire vehicle: holds behind friendly lines, lobs shells, no line of sight needed.
export function ArtilleryEntity({ id, zone, onDespawn }) {
  const bodyRef = useRef(), groupRef = useRef(), recoilRef = useRef(), explosionRef = useRef();
  const entryRef = useRef(null), cooldown = useRef(2 + id % 3), deathTimer = useRef(0), died = useRef(false);
  const explosionMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff8833', transparent: true, opacity: 0 }), []);
  const sectorIndex = zone.x < -22.5 ? 0 : zone.x < 22.5 ? 1 : 2;

  useEffect(() => {
    const body = bodyRef.current;
    body.setTranslation({ x: zone.x, y: 0.7, z: zone.z }, true);
    const profile = BALANCE.units.artillery;
    const entry = { id, team: 'friendly', type: 'artillery', sectorIndex, squadId: `artillery-${id}`, profile, bodyRef,
      aimHeight: 1.2, heading: TANK.initialFacing, cooldown: 0, shotsFired: 0, health: profile.health, maxHealth: profile.health,
      alive: true, bornAt: battle.elapsed, targetScan: 0 };
    combat.units.push(entry); combat.byBody.set(body.handle, entry); entryRef.current = entry;
    return () => {
      entry.alive = false;
      if (combat.byBody.get(body.handle) === entry) combat.byBody.delete(body.handle);
      const i = combat.units.indexOf(entry); if (i >= 0) combat.units.splice(i, 1);
    };
  }, [id, zone, sectorIndex]);

  useFrame((_, delta) => {
    const body = bodyRef.current, group = groupRef.current, entry = entryRef.current;
    if (!body || !group || !entry || gameState.paused) return;
    if (!entry.alive) {
      if (!died.current) {
        died.current = true; recordRemoval(entry, 'death'); group.visible = false;
        explosionRef.current.visible = true; explosionMat.opacity = 0.85;
        const p = body.translation(); artilleryState.blasts.push([p.x, p.y, p.z]);
      }
      deathTimer.current += delta;
      const t = Math.min(1, deathTimer.current / 2);
      explosionRef.current.scale.setScalar(1 + t * 4); explosionMat.opacity = 0.85 * (1 - t);
      if (deathTimer.current >= 2) onDespawn(id);
      return;
    }
    if (recoilRef.current) recoilRef.current.position.z *= Math.exp(-delta * 3);
    const pos = body.translation();
    cooldown.current -= delta;
    if (pos.z > ARTILLERY.holdZ) {
      body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: Math.max(ARTILLERY.holdZ, pos.z - ARTILLERY.moveSpeed * delta) });
      group.rotation.y = TANK.initialFacing;
      return;
    }
    const enemy = findNearestEnemy(entry, ARTILLERY.range);
    if (!enemy?.bodyRef.current) return;
    const ep = enemy.bodyRef.current.translation();
    const want = Math.atan2(ep.x - pos.x, ep.z - pos.z);
    let diff = want - group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    group.rotation.y += diff * Math.min(1, delta * 2);
    if (cooldown.current > 0 || Math.abs(diff) > 0.08) return;
    cooldown.current = ARTILLERY.cooldown;
    const yaw = group.rotation.y;
    const from = [pos.x + Math.sin(yaw) * tipForward, pos.y - ARTILLERY.colliderY + tipHeight, pos.z + Math.cos(yaw) * tipForward];
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * ARTILLERY.aimSpread;
    const tx = ep.x + Math.cos(a) * r, tz = ep.z + Math.sin(a) * r;
    const dist = Math.hypot(tx - from[0], tz - from[2]);
    artilleryState.shells.push({ from, to: [tx, terrainHeight(tx, tz), tz], age: 0,
      duration: 1 + dist / ARTILLERY.shellSpeed, apex: ARTILLERY.apexBase + dist * ARTILLERY.apexPerMeter,
      damage: ARTILLERY.damage, shooterId: id });
    if (combat.muzzleEffects.length < 128) combat.muzzleEffects.push({ position: from, direction: [Math.sin(yaw) * 0.8, 0.6, Math.cos(yaw) * 0.8] });
    combat.stats.shots++; battle.shots.friendly++; entry.shotsFired++;
    if (recoilRef.current) recoilRef.current.position.z = -0.7;
  });

  return (
    <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false} lockRotations canSleep={false} name="friendly-artillery">
      <CuboidCollider args={[ARTILLERY.colliderHalfWidth, ARTILLERY.colliderHalfHeight, ARTILLERY.colliderHalfDepth]} position={[0, 0, 0]} />
      <group ref={groupRef} position={[0, -ARTILLERY.colliderY, 0]}>
        <ArtilleryVisual ref={recoilRef} explosionRef={explosionRef} explosionMat={explosionMat} />
      </group>
    </RigidBody>
  );
}