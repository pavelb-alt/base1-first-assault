import * as THREE from 'three';
import { combat } from '@/game/3d/combat';
import { COMBAT } from '@/game/config';
import { AIM } from '@/game/3d/weapons';
import { random } from '@/game/3d/random';
import { battle, recordRemoval } from '@/game/3d/battleMetrics';

const direction = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
const coverPoint = new THREE.Vector3();
const coverHits = [];
const pathDirection = new THREE.Vector3();
const cameraOrigin = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();
const spreadRight = new THREE.Vector3();
const spreadUp = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);

export function unitForCollider(collider) {
  const handle = collider.parent()?.handle;
  return combat.byBody.get(handle);
}
// Same cover/faction rules for camera aim, muzzle clearance, and swept flight.
export function trace(origin, dir, distance, shooter) {
  const context = combat.physics;
  if (!context || distance < 0) return null;
  const ray = new context.rapier.Ray(origin, dir);
  const result = context.world.castRay(ray, distance, true, undefined, undefined, undefined,
    shooter?.bodyRef?.current, collider => {
      const unit = unitForCollider(collider);
      return !unit || (unit.alive && unit.team !== shooter?.team);
    });
  let hit = result ? { distance: result.timeOfImpact, unit: unitForCollider(result.collider), point: ray.pointAt(result.timeOfImpact) } : null;
  // Base decorations have no movement colliders: ray-test them without changing navigation.
  raycaster.set(origin, dir); raycaster.near = 0; raycaster.far = distance;
  // Most rounds are nowhere near a base. Reject its cached world bounds
  // before traversing decorative meshes; retain exact cover hits nearby.
  for (const cover of context.cover) {
    if (!cover.bounds.containsPoint(origin) &&
      (!raycaster.ray.intersectBox(cover.bounds, coverPoint) || coverPoint.distanceToSquared(origin) > distance * distance)) continue;
    coverHits.length = 0;
    raycaster.intersectObject(cover.object, true, coverHits);
    const visual = coverHits[0];
    if (visual && (!hit || visual.distance < hit.distance)) hit = { distance: visual.distance, unit: null, point: visual.point };
  }
  coverHits.length = 0;
  return hit;
}

const sightOrigin = new THREE.Vector3();
const sightTarget = new THREE.Vector3();
const sightDirection = new THREE.Vector3();
export function clearShot(shooter, origin, target) {
  sightDirection.subVectors(target,origin);
  const distance=sightDirection.length();
  if(distance<0.001)return true;
  const hit=trace(origin,sightDirection.divideScalar(distance),distance,shooter);
  return !hit || !!hit.unit;
}
export function canSeeTarget(shooter,target) {
  const a=shooter.bodyRef.current.translation(),b=target.bodyRef.current.translation();
  sightOrigin.set(a.x,a.y+shooter.aimHeight,a.z);
  sightTarget.set(b.x,b.y+target.aimHeight,b.z);
  return clearShot(shooter,sightOrigin,sightTarget);
}

export function cameraAim(camera, shooter, out) {
  camera.updateMatrixWorld(true);
  raycaster.setFromCamera(center, camera);
  cameraOrigin.copy(raycaster.ray.origin);
  cameraDirection.copy(raycaster.ray.direction);
  const hit = trace(cameraOrigin, cameraDirection, AIM.distance, shooter);
  return out.copy(cameraOrigin).addScaledVector(cameraDirection, hit ? hit.distance : AIM.distance);
}

export function applyImpact(hit, shot) {
  const target = hit.unit;
  // Physics hits are plain coordinates; mesh hits are Three vectors. Shots
  // likewise arrive as arrays at the muzzle and vectors during pooled flight.
  if (combat.impactEffects.length < 256) combat.impactEffects.push({
    position: [hit.point.x, hit.point.y, hit.point.z],
    direction: Array.isArray(shot.direction) ? [...shot.direction] : [shot.direction.x, shot.direction.y, shot.direction.z],
  });
  combat.stats.impactBursts++;
  if (target && target.alive && target.team !== shot.team) {
    const damage = Math.min(target.health, shot.damage);
    target.health -= damage;
    if (target.health === 0) {
      target.alive = false;
      target.playDeathAnimation = true;
      recordRemoval(target, 'death');
      if (shot.player) battle.playerKills++;
    }
    combat.stats.hits++; combat.stats.damage += damage;
    battle.hits[shot.team]++;
    if (shot.player) battle.playerDamage += damage;
  } else if (!target) combat.stats.coverHits++;
  combat.lastImpact = { team: shot.team, shooterId: shot.shooterId, targetId: target?.id ?? null, targetTeam: target?.team ?? null, cover: !target, point: { x: hit.point.x, y: hit.point.y, z: hit.point.z } };
}

// Only enqueue WORLD positions and a WORLD direction. No target-ID lookup, no homing,
// and no gun/character transform in ProjectileManager.
export function fireShot(shooter, origin, aimPoint, clearanceOrigin = origin, player = false) {
  if (!shooter?.alive || !combat.physics) return false;
  direction.subVectors(aimPoint, origin);
  if (direction.lengthSq() < AIM.minDistance ** 2) return false;
  direction.normalize();
  // AI aim is imperfect; possession uses the player's actual crosshair. The
  // weapon's health, damage, rate, range and projectile physics never change.
  if (!player && shooter.profile?.aiSpread) {
    spreadRight.crossVectors(direction, worldUp);
    if (spreadRight.lengthSq() < 0.0001) spreadRight.set(1, 0, 0);
    spreadRight.normalize(); spreadUp.crossVectors(spreadRight, direction).normalize();
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * Math.tan(shooter.profile.aiSpread);
    direction.addScaledVector(spreadRight, Math.cos(angle) * radius).addScaledVector(spreadUp, Math.sin(angle) * radius).normalize();
  }
  const shot = { origin: origin.toArray(), direction: direction.toArray(), team: shooter.team,
    shooterId: shooter.id, shooter, player, damage: shooter.profile?.damage ?? COMBAT.projectileDamage };
  combat.stats.shots++; battle.shots[shooter.team]++; if (player) combat.stats.playerShots++;
  if (combat.muzzleEffects.length < 128) combat.muzzleEffects.push({ position: [...shot.origin], direction: [...shot.direction] });
  combat.stats.muzzleFlashes++;
  combat.lastShot = { origin: [...shot.origin], direction: [...shot.direction], aimPoint: aimPoint.toArray(), team: shot.team, shooterId: shot.shooterId, weaponId: shooter.weaponId ?? null };
  // A long barrel must not poke through cover and spawn its bullet on the far side.
  pathDirection.subVectors(origin, clearanceOrigin);
  const length = pathDirection.length();
  const obstruction = length > AIM.minDistance ? trace(clearanceOrigin, pathDirection.normalize(), length, shooter) : null;
  if (obstruction) applyImpact(obstruction, shot);
  else {
    // Only immediate muzzle obstruction matters here. The flight sweep still
    // checks every travelled segment against moving units and cover.
    const path = trace(origin, direction, Math.min(AIM.minDistance, origin.distanceTo(aimPoint)), shooter);
    if (path && path.distance < AIM.minDistance) applyImpact(path, shot);
    else combat.pendingProjectiles.push(shot);
  }
  return true;
}