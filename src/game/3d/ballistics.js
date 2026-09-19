import * as THREE from 'three';
import { combat } from '@/game/3d/combat';
import { COMBAT } from '@/game/config';
import { AIM } from '@/game/3d/weapons';

const direction = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
const pathDirection = new THREE.Vector3();
const cameraOrigin = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();

export function unitForCollider(collider) {
  const handle = collider.parent()?.handle;
  return combat.units.find(u => u.bodyRef.current?.handle === handle);
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
  const visual = raycaster.intersectObjects(context.cover, true)[0];
  if (visual && (!hit || visual.distance < hit.distance)) hit = { distance: visual.distance, unit: null, point: visual.point };
  return hit;
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
  if (target && target.alive && target.team !== shot.team) {
    target.health = Math.max(0, target.health - shot.damage);
    if (target.health === 0) target.alive = false;
    combat.stats.hits++; combat.stats.damage += shot.damage;
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
  const shot = { origin: origin.toArray(), direction: direction.toArray(), team: shooter.team,
    shooterId: shooter.id, shooter, damage: COMBAT.projectileDamage };
  combat.stats.shots++; if (player) combat.stats.playerShots++;
  combat.lastShot = { origin: [...shot.origin], direction: [...shot.direction], aimPoint: aimPoint.toArray(), team: shot.team, shooterId: shot.shooterId, weaponId: shooter.weaponId ?? null };
  // A long barrel must not poke through cover and spawn its bullet on the far side.
  pathDirection.subVectors(origin, clearanceOrigin);
  const length = pathDirection.length();
  const obstruction = length > AIM.minDistance ? trace(clearanceOrigin, pathDirection.normalize(), length, shooter) : null;
  if (obstruction) applyImpact(obstruction, shot);
  else {
    // Check the entire muzzle-to-aim path now; flight still collides per segment,
    // so moving units/cover are resolved at impact, never damaged early.
    const path = trace(origin, direction, origin.distanceTo(aimPoint), shooter);
    if (path && path.distance < AIM.minDistance) applyImpact(path, shot);
    else combat.pendingProjectiles.push(shot);
  }
  return true;
}