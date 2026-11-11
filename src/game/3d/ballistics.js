import * as THREE from 'three';
import { combat } from '@/game/3d/combat';
import { COMBAT, TOWER_DEFENSE, TANK } from '@/game/config';
import { visitNearby } from '@/game/3d/spatial';
import { AIM } from '@/game/3d/weapons';
import { random } from '@/game/3d/random';
import { battle, recordRemoval } from '@/game/3d/battleMetrics';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { gameEvents } from '@/game/gameEvents';
import { gameState } from '@/game/3d/world';

// True when this unit is the one the player is directly controlling.
export function isPlayerUnit(u) {
  if (!u || u.team !== 'friendly') return false;
  if (u.type === 'soldier') return u.id === gameState.possessedSoldierId;
  const st = gameState.controlledStation;
  return !!st && st.type === u.type && st.id === u.id;
}

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
  if (gameEvents.has('impact')) gameEvents.emit('impact', { team: shot.team, player: !!shot.player, cover: !target, x: hit.point.x, y: hit.point.y, z: hit.point.z });
  if (target && target.alive && target.team !== shot.team) damageUnit(target, shot.damage, shot);
  else if (!target) combat.stats.coverHits++;
  combat.lastImpact = { team: shot.team, shooterId: shot.shooterId, targetId: target?.id ?? null, targetTeam: target?.team ?? null, cover: !target, point: { x: hit.point.x, y: hit.point.y, z: hit.point.z } };
}

// Area damage with distance falloff (artillery shells). Friendly fire is off.
export function applySplash(shooter, x, z, radius, damage, player = false) {
  const shot = { team: shooter.team, shooterId: shooter.id, shooter, player, damage };
  let hits = 0;
  visitNearby(x, z, radius, (u, _p, d2) => {
    if (u.team === shooter.team || !u.alive || u.seated) return;
    damageUnit(u, damage * (1 - 0.6 * Math.sqrt(d2) / radius), shot);
    hits++;
  });
  return hits;
}

function damageUnit(target, amount, shot) {
  {
    let damage = Math.min(target.health, amount);
    // Cover aura: friendly infantry near a tank take reduced damage
    if (target.team === 'friendly' && target.type !== 'tank' && target.type !== 'artillery' && target.bodyRef?.current) {
      const tp = target.bodyRef.current.translation();
      let hasCover = false;
      visitNearby(tp.x, tp.z, TANK.coverAuraRadius, (u) => {
        if (u.team === 'friendly' && u.type === 'tank' && u.alive) hasCover = true;
      });
      if (hasCover) damage *= TANK.coverDamageReduction;
    }
    target.health -= damage;
    const killed = target.health <= 0;
    if (gameEvents.has('damage') || (killed && gameEvents.has('kill'))) {
      const tp = target.bodyRef?.current?.translation();
      const sp = shot.shooter?.bodyRef?.current?.translation?.();
      const ev = { team: shot.team, targetTeam: target.team, targetType: target.type, amount: damage, player: !!shot.player,
        playerTarget: isPlayerUnit(target), killed, x: tp?.x ?? 0, y: (tp?.y ?? 0) + (target.aimHeight ?? 1), z: tp?.z ?? 0,
        fromX: sp?.x ?? (Array.isArray(shot.origin) ? shot.origin[0] : tp?.x ?? 0), fromZ: sp?.z ?? (Array.isArray(shot.origin) ? shot.origin[2] : tp?.z ?? 0) };
      gameEvents.emit('damage', ev);
      if (killed) gameEvents.emit('kill', { team: shot.team, targetTeam: target.team, targetType: target.type, player: !!shot.player, x: ev.x, y: ev.y, z: ev.z });
    }
    if (killed) {
      target.health = 0;
      target.alive = false;
      target.playDeathAnimation = true;
      recordRemoval(target, 'death');
      if (shot.player) battle.playerKills++;
      // Tower defense: award scrap when an enemy is killed
      if (target.team === 'enemy') {
        const reward = TOWER_DEFENSE.scrapRewards[target.type] ?? 10;
        towerDefenseState.addScrap(reward);
      }
    }
    combat.stats.hits++; combat.stats.damage += damage;
    battle.hits[shot.team]++;
    if (shot.player) battle.playerDamage += damage;
  }
}

// Only enqueue WORLD positions and a WORLD direction. No target-ID lookup, no homing,
// and no gun/character transform in ProjectileManager.
export function fireShot(shooter, origin, aimPoint, clearanceOrigin = origin, player = false) {
  if (!shooter?.alive || !combat.physics) return false;
  // Player and AI shots both travel from the muzzle toward the aim point.
  // For the player, cameraAim() already resolved the crosshair ray to a world
  // hit point, so this converges exactly with what the player is aiming at.
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
  if (gameEvents.has('shot')) gameEvents.emit('shot', { team: shooter.team, kind: shooter.type ?? 'soldier', player: !!player, x: shot.origin[0], y: shot.origin[1], z: shot.origin[2] });
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