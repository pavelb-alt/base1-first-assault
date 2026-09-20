import * as THREE from 'three';
import { SKY_BATTLE } from '@/game/config';
import { random } from '@/game/3d/random';

const MAX_SHIPS = SKY_BATTLE.maxShips;
const MAX_BOLTS = SKY_BATTLE.maxBolts;
const MAX_EXPLOSIONS = SKY_BATTLE.maxExplosions;
const MAX_SMOKE = SKY_BATTLE.maxSmoke;
const MAX_DEBRIS = SKY_BATTLE.maxDebris;

const _desired = new THREE.Vector3();
const _current = new THREE.Vector3();
const _cross = new THREE.Vector3();

export const skyBattle = {
  ships: [], bolts: [], explosions: [], smoke: [], debris: [],
  initialized: false,
  nextBoltIdx: 0, nextExplosionIdx: 0, nextSmokeIdx: 0, nextDebrisIdx: 0,
  destroyed: { friendly: 0, enemy: 0 },
};

function rand(min, max) { return min + random() * (max - min); }

function createShipState(i) {
  const sideSize = MAX_SHIPS / 2;
  const team = i < sideSize ? 'friendly' : 'enemy';
  const local = i % sideSize;
  const typeIndex = i % 3;
  const altitude = SKY_BATTLE.altitudeBands[local % SKY_BATTLE.altitudeBands.length];
  const xOff = (local - (sideSize - 1) / 2) * 9;
  const zBase = team === 'friendly' ? 42 : -42;
  const zOff = (local % 4) * 3;
  const baseHeading = team === 'friendly' ? Math.PI : 0;
  const headingAngle = baseHeading + rand(-0.35, 0.35);
  return {
    id: i, team, type: typeIndex,
    position: new THREE.Vector3(xOff, altitude, zBase + zOff * (team === 'friendly' ? 1 : -1)),
    heading: new THREE.Vector3(Math.sin(headingAngle), 0, Math.cos(headingAngle)),
    bankAngle: 0, health: SKY_BATTLE.shipHealth, maxHealth: SKY_BATTLE.shipHealth,
    alive: true, falling: false, respawnTimer: 0, fireCooldown: rand(0.4, 2),
    targetId: null, speed: rand(SKY_BATTLE.shipSpeedMin, SKY_BATTLE.shipSpeedMax),
    turnRate: rand(SKY_BATTLE.turnRateMin, SKY_BATTLE.turnRateMax), altitude,
    wanderPhase: random() * Math.PI * 2, wanderFreq: rand(0.3, 0.75),
    wreckVelocity: new THREE.Vector3(), wreckSpin: new THREE.Vector3(),
    wreckRotation: new THREE.Vector3(), smokeCooldown: 0, damageSmokeTimer: rand(0, 0.2),
  };
}

function createBoltState() {
  return { position: new THREE.Vector3(), velocity: new THREE.Vector3(), team: 'friendly', active: false, lifetime: 0 };
}
function createExplosionState() {
  return { position: new THREE.Vector3(), age: 0, lifetime: SKY_BATTLE.explosionLifetime, active: false };
}
function createSmokeState() {
  return { position: new THREE.Vector3(), velocity: new THREE.Vector3(), age: 0, lifetime: SKY_BATTLE.smokeLifetime, active: false, size: 1 };
}
function createDebrisState() {
  return { position: new THREE.Vector3(), velocity: new THREE.Vector3(), rotation: new THREE.Vector3(), spin: new THREE.Vector3(), age: 0, lifetime: SKY_BATTLE.debrisLifetime, active: false, size: 1 };
}

export function initSkyBattle() {
  skyBattle.ships = Array.from({ length: MAX_SHIPS }, (_, i) => createShipState(i));
  skyBattle.bolts = Array.from({ length: MAX_BOLTS }, createBoltState);
  skyBattle.explosions = Array.from({ length: MAX_EXPLOSIONS }, createExplosionState);
  skyBattle.smoke = Array.from({ length: MAX_SMOKE }, createSmokeState);
  skyBattle.debris = Array.from({ length: MAX_DEBRIS }, createDebrisState);
  skyBattle.initialized = true;
  skyBattle.nextBoltIdx = skyBattle.nextExplosionIdx = skyBattle.nextSmokeIdx = skyBattle.nextDebrisIdx = 0;
  skyBattle.destroyed.friendly = skyBattle.destroyed.enemy = 0;
}

export function resetSkyBattle() { initSkyBattle(); }

function fireBolt(ship) {
  const bolt = skyBattle.bolts[skyBattle.nextBoltIdx];
  skyBattle.nextBoltIdx = (skyBattle.nextBoltIdx + 1) % MAX_BOLTS;
  bolt.position.copy(ship.position).addScaledVector(ship.heading, 1.8);
  bolt.velocity.copy(ship.heading).multiplyScalar(SKY_BATTLE.boltSpeed);
  bolt.team = ship.team; bolt.active = true; bolt.lifetime = SKY_BATTLE.boltLifetime;
}

function spawnExplosion(position) {
  const exp = skyBattle.explosions[skyBattle.nextExplosionIdx];
  skyBattle.nextExplosionIdx = (skyBattle.nextExplosionIdx + 1) % MAX_EXPLOSIONS;
  exp.position.copy(position); exp.age = 0; exp.active = true;
}

function spawnSmoke(position, velocityScale = 1) {
  const puff = skyBattle.smoke[skyBattle.nextSmokeIdx];
  skyBattle.nextSmokeIdx = (skyBattle.nextSmokeIdx + 1) % MAX_SMOKE;
  puff.position.copy(position);
  puff.velocity.set(rand(-0.8, 0.8), rand(1.4, 2.7), rand(-0.8, 0.8)).multiplyScalar(velocityScale);
  puff.age = 0; puff.lifetime = rand(SKY_BATTLE.smokeLifetime * 0.7, SKY_BATTLE.smokeLifetime); puff.size = rand(0.55, 1.15); puff.active = true;
}

function spawnDebris(position, count) {
  for (let i = 0; i < count; i++) {
    const piece = skyBattle.debris[skyBattle.nextDebrisIdx];
    skyBattle.nextDebrisIdx = (skyBattle.nextDebrisIdx + 1) % MAX_DEBRIS;
    piece.position.copy(position);
    piece.velocity.set(rand(-8, 8), rand(2, 11), rand(-8, 8));
    piece.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    piece.spin.set(rand(-7, 7), rand(-7, 7), rand(-7, 7));
    piece.age = 0; piece.lifetime = rand(1.8, SKY_BATTLE.debrisLifetime); piece.size = rand(0.12, 0.42); piece.active = true;
  }
}

function beginCrash(ship) {
  ship.alive = false; ship.falling = true; ship.targetId = null;
  ship.wreckVelocity.copy(ship.heading).multiplyScalar(ship.speed * 0.55);
  ship.wreckVelocity.y = rand(1.5, 5);
  ship.wreckSpin.set(rand(-3.5, 3.5), rand(-2.5, 2.5), rand(-4.5, 4.5));
  ship.wreckRotation.set(0, Math.atan2(ship.heading.x, ship.heading.z), ship.bankAngle);
  ship.smokeCooldown = 0;
  skyBattle.destroyed[ship.team]++;
  spawnExplosion(ship.position); spawnDebris(ship.position, 12);
}

function finishCrash(ship) {
  ship.position.y = 0.45; ship.falling = false;
  ship.respawnTimer = rand(SKY_BATTLE.respawnDelayMin, SKY_BATTLE.respawnDelayMax);
  spawnExplosion(ship.position); spawnDebris(ship.position, 20);
  for (let i = 0; i < 7; i++) spawnSmoke(ship.position, 0.65);
}

function respawnShip(ship) {
  const angle = random() * Math.PI * 2;
  const dist = SKY_BATTLE.bound - 3;
  ship.position.set(Math.cos(angle) * dist, ship.altitude, Math.sin(angle) * dist);
  ship.heading.set(-Math.cos(angle), 0, -Math.sin(angle)).normalize();
  ship.health = ship.maxHealth; ship.alive = true; ship.falling = false;
  ship.fireCooldown = rand(0.5, 2); ship.targetId = null; ship.bankAngle = 0;
  ship.damageSmokeTimer = rand(0, 0.2);
}

export function updateSkyBattle(delta) {
  const ships = skyBattle.ships;

  for (const ship of ships) {
    if (ship.falling) {
      ship.wreckVelocity.y -= SKY_BATTLE.crashGravity * delta;
      ship.position.addScaledVector(ship.wreckVelocity, delta);
      ship.wreckRotation.addScaledVector(ship.wreckSpin, delta);
      ship.smokeCooldown -= delta;
      if (ship.smokeCooldown <= 0) { spawnSmoke(ship.position); ship.smokeCooldown = 0.075; }
      if (ship.position.y <= 0.45) finishCrash(ship);
      continue;
    }
    if (!ship.alive) {
      ship.respawnTimer -= delta;
      if (ship.respawnTimer <= 0) respawnShip(ship);
      continue;
    }

    let target = ships.find(s => s.id === ship.targetId && s.alive && s.team !== ship.team);
    if (!target) {
      let nearest = null, minDist = Infinity;
      for (const s of ships) {
        if (!s.alive || s.team === ship.team) continue;
        const d = ship.position.distanceToSquared(s.position);
        if (d < minDist) { minDist = d; nearest = s; }
      }
      target = nearest; ship.targetId = target?.id ?? null;
    }
    if (!target) continue;

    _desired.subVectors(target.position, ship.position);
    const dist = _desired.length();
    if (dist < 0.001) continue;
    _desired.divideScalar(dist);
    ship.wanderPhase += delta * ship.wanderFreq;
    _desired.x += Math.sin(ship.wanderPhase + ship.id * 2.1) * 0.18;
    _desired.y += Math.sin(ship.wanderPhase * 0.7 + ship.id) * 0.035;
    _desired.z += Math.cos(ship.wanderPhase + ship.id * 1.7) * 0.18;
    _desired.normalize();

    _current.copy(ship.heading);
    const dot = Math.max(-1, Math.min(1, _current.dot(_desired)));
    const angle = Math.acos(dot);
    const turnAmount = Math.min(angle, ship.turnRate * delta);
    if (angle > 0.001) ship.heading.lerp(_desired, turnAmount / angle).normalize();
    ship.position.addScaledVector(ship.heading, ship.speed * delta);
    ship.position.y = THREE.MathUtils.lerp(ship.position.y, ship.altitude, Math.min(1, delta * 0.8));

    _cross.crossVectors(_current, _desired);
    const targetBank = -Math.min(angle, 1.2) * 0.65 * (_cross.y > 0 ? 1 : -1);
    ship.bankAngle = THREE.MathUtils.lerp(ship.bankAngle, targetBank, Math.min(1, delta * 4));

    const B = SKY_BATTLE.bound;
    if (ship.position.x > B) { ship.position.x = B; ship.heading.x = -Math.abs(ship.heading.x); }
    if (ship.position.x < -B) { ship.position.x = -B; ship.heading.x = Math.abs(ship.heading.x); }
    if (ship.position.z > B) { ship.position.z = B; ship.heading.z = -Math.abs(ship.heading.z); }
    if (ship.position.z < -B) { ship.position.z = -B; ship.heading.z = Math.abs(ship.heading.z); }

    ship.fireCooldown -= delta;
    if (ship.fireCooldown <= 0 && angle < SKY_BATTLE.fireAngleThreshold) {
      fireBolt(ship); ship.fireCooldown = rand(SKY_BATTLE.fireCooldownMin, SKY_BATTLE.fireCooldownMax);
    }
    if (ship.health <= ship.maxHealth * 0.5) {
      ship.damageSmokeTimer -= delta;
      if (ship.damageSmokeTimer <= 0) { spawnSmoke(ship.position, 0.45); ship.damageSmokeTimer = 0.18; }
    }
  }

  for (const bolt of skyBattle.bolts) {
    if (!bolt.active) continue;
    bolt.position.addScaledVector(bolt.velocity, delta); bolt.lifetime -= delta;
    if (bolt.lifetime <= 0) { bolt.active = false; continue; }
    for (const ship of ships) {
      if (!ship.alive || ship.team === bolt.team) continue;
      if (bolt.position.distanceToSquared(ship.position) < 6.25) {
        ship.health -= SKY_BATTLE.boltDamage; bolt.active = false;
        spawnDebris(bolt.position, 3);
        if (ship.health <= 0) beginCrash(ship);
        break;
      }
    }
  }

  for (const exp of skyBattle.explosions) {
    if (!exp.active) continue;
    exp.age += delta; if (exp.age >= exp.lifetime) exp.active = false;
  }
  for (const puff of skyBattle.smoke) {
    if (!puff.active) continue;
    puff.position.addScaledVector(puff.velocity, delta); puff.velocity.y += 0.22 * delta;
    puff.age += delta; if (puff.age >= puff.lifetime) puff.active = false;
  }
  for (const piece of skyBattle.debris) {
    if (!piece.active) continue;
    piece.velocity.y -= SKY_BATTLE.crashGravity * delta;
    piece.position.addScaledVector(piece.velocity, delta);
    piece.rotation.addScaledVector(piece.spin, delta);
    piece.age += delta;
    if (piece.position.y <= 0.1 || piece.age >= piece.lifetime) piece.active = false;
  }
}