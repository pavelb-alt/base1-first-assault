import * as THREE from 'three';
import { SKY_BATTLE } from '@/game/config';
import { random } from '@/game/3d/random';
import { resetFlight, flyDogfight } from '@/game/3d/objects/dogfightFlight';

const MAX_SHIPS = SKY_BATTLE.maxShips;
const MAX_BOLTS = SKY_BATTLE.maxBolts;
const MAX_EXPLOSIONS = SKY_BATTLE.maxExplosions;
const MAX_SMOKE = SKY_BATTLE.maxSmoke;

// Scratch vectors — reused every frame, never allocated per-call.
const _desired = new THREE.Vector3();
const _segment = new THREE.Vector3();
const _toShip = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _crashOrientation = new THREE.Object3D();

export const skyBattle = {
  ships: [],
  bolts: [],
  explosions: [],
  smoke: [],
  initialized: false,
  nextBoltIdx: 0,
  nextExplosionIdx: 0,
  nextSmokeIdx: 0,
};

function rand(min, max) { return min + random() * (max - min); }

function createShipState(i) {
  const half = MAX_SHIPS / 2;
  const team = i < half ? 'friendly' : 'enemy';
  const slot = i % half;
  const typeIndex = i % 3;
  const altitude = SKY_BATTLE.altitudeBands[i % SKY_BATTLE.altitudeBands.length];
  const xOff = (slot - (half - 1) / 2) * 8.5;
  const zBase = team === 'friendly' ? 38 : -38;
  const zOff = (slot % 4) * 5;
  const baseHeading = team === 'friendly' ? Math.PI : 0; // friendly faces -Z, enemy faces +Z
  const headingAngle = baseHeading + rand(-0.3, 0.3);

  return {
    id: i, team, type: typeIndex,
    position: new THREE.Vector3(xOff, altitude, zBase + zOff * (team === 'friendly' ? 1 : -1)),
    heading: new THREE.Vector3(Math.sin(headingAngle), 0, Math.cos(headingAngle)),
    bankAngle: 0,
    health: SKY_BATTLE.shipHealth,
    maxHealth: SKY_BATTLE.shipHealth,
    alive: true,
    // --- death spiral ---
    crashing: false,
    crashVel: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    tumble: new THREE.Euler(),
    smokeTimer: 0,
    respawnTimer: 0,
    fireCooldown: rand(0.5, 3.5),
    targetId: null,
    speed: rand(SKY_BATTLE.shipSpeedMin, SKY_BATTLE.shipSpeedMax),
    turnRate: rand(SKY_BATTLE.turnRateMin, SKY_BATTLE.turnRateMax),
    altitude,

  };
}

function createBoltState() {
  return { position: new THREE.Vector3(), velocity: new THREE.Vector3(), team: 'friendly', active: false, lifetime: 0 };
}
function createExplosionState() {
  return { position: new THREE.Vector3(), age: 0, lifetime: SKY_BATTLE.explosionLifetime, scale: 1, active: false };
}
function createSmokeState() {
  return { position: new THREE.Vector3(), age: 0, lifetime: SKY_BATTLE.smokeLife, seed: 1, active: false };
}

export function initSkyBattle() {
  skyBattle.ships = Array.from({ length: MAX_SHIPS }, (_, i) => {
    const ship = createShipState(i); resetFlight(ship); return ship;
  });
  skyBattle.bolts = Array.from({ length: MAX_BOLTS }, createBoltState);
  skyBattle.explosions = Array.from({ length: MAX_EXPLOSIONS }, createExplosionState);
  skyBattle.smoke = Array.from({ length: MAX_SMOKE }, createSmokeState);
  skyBattle.initialized = true;
  skyBattle.nextBoltIdx = 0;
  skyBattle.nextExplosionIdx = 0;
  skyBattle.nextSmokeIdx = 0;
}

export function resetSkyBattle() {
  skyBattle.ships = Array.from({ length: MAX_SHIPS }, (_, i) => {
    const ship = createShipState(i); resetFlight(ship); return ship;
  });
  for (const bolt of skyBattle.bolts) { bolt.active = false; bolt.lifetime = 0; }
  for (const exp of skyBattle.explosions) { exp.active = false; exp.age = 0; }
  for (const puff of skyBattle.smoke) { puff.active = false; puff.age = 0; }
  skyBattle.nextBoltIdx = 0;
  skyBattle.nextExplosionIdx = 0;
  skyBattle.nextSmokeIdx = 0;
  skyBattle.initialized = true;
}

function fireBolt(ship) {
  const bolt = skyBattle.bolts[skyBattle.nextBoltIdx];
  skyBattle.nextBoltIdx = (skyBattle.nextBoltIdx + 1) % MAX_BOLTS;
  bolt.position.copy(ship.position).addScaledVector(ship.heading, 1.5);
  bolt.velocity.copy(ship.heading).multiplyScalar(SKY_BATTLE.boltSpeed);
  bolt.team = ship.team;
  bolt.active = true;
  bolt.lifetime = SKY_BATTLE.boltLifetime;
}

function spawnExplosion(position, scale = 1, lifetime = SKY_BATTLE.explosionLifetime) {
  const exp = skyBattle.explosions[skyBattle.nextExplosionIdx];
  skyBattle.nextExplosionIdx = (skyBattle.nextExplosionIdx + 1) % MAX_EXPLOSIONS;
  exp.position.copy(position);
  exp.age = 0;
  exp.scale = scale;
  exp.lifetime = lifetime;
  exp.active = true;
}

function spawnSmoke(position) {
  const puff = skyBattle.smoke[skyBattle.nextSmokeIdx];
  skyBattle.nextSmokeIdx = (skyBattle.nextSmokeIdx + 1) % MAX_SMOKE;
  puff.position.copy(position);
  puff.position.x += rand(-0.4, 0.4);
  puff.position.z += rand(-0.4, 0.4);
  puff.age = 0;
  puff.lifetime = SKY_BATTLE.smokeLife * rand(0.7, 1.2);
  puff.seed = rand(0.7, 1.4);
  puff.active = true;
}

// A hit ship does not vanish: it loses power, tumbles, trails smoke and crashes.
function beginCrash(ship) {
  ship.alive = false;
  ship.crashing = true;
  ship.smokeTimer = 0;
  // Keeps its forward momentum, then gravity takes over.
  ship.crashVel.copy(ship.heading).multiplyScalar(ship.speed);
  _crashOrientation.position.copy(ship.position);
  _desired.copy(ship.position).addScaledVector(ship.heading, SKY_BATTLE.flight.modelForwardZ);
  _crashOrientation.lookAt(_desired);
  _crashOrientation.rotateZ(ship.bankAngle);
  ship.tumble.copy(_crashOrientation.rotation);
  ship.spin.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize()
    .multiplyScalar(rand(SKY_BATTLE.crashSpinMin, SKY_BATTLE.crashSpinMax));
  spawnExplosion(ship.position, 1.2); // the mid-air hit flash
}

function respawnShip(ship) {
  const angle = random() * Math.PI * 2;
  const dist = SKY_BATTLE.bound - 2;
  ship.position.set(Math.cos(angle) * dist, ship.altitude, Math.sin(angle) * dist);
  ship.heading.set(-Math.cos(angle), 0, -Math.sin(angle)).normalize();
  ship.health = ship.maxHealth;
  ship.alive = true;
  ship.crashing = false;
  ship.fireCooldown = rand(0.5, 2.5);
  ship.targetId = null;
  ship.bankAngle = 0;
  ship.tumble.set(0, 0, 0);
  ship.crashVel.set(0, 0, 0);
  ship.speed = rand(SKY_BATTLE.shipSpeedMin, SKY_BATTLE.shipSpeedMax);
  resetFlight(ship);
}

export function updateSkyBattle(delta) {
  // Small simulation steps preserve smooth turns and swept fire after a slow frame.
  let remaining = Math.min(Math.max(delta, 0), .1);
  while (remaining > 0.000001) {
    const dt = Math.min(remaining, 1 / 60);
    stepSkyBattle(dt);
    remaining -= dt;
  }
}

function stepSkyBattle(delta) {
  const ships = skyBattle.ships;

  for (const ship of ships) {
    // --- Falling wreck: tumble, smoke, ground impact ------------------------
    if (ship.crashing) {
      ship.crashVel.y -= SKY_BATTLE.crashGravity * delta;
      const drag = 1 - SKY_BATTLE.crashDrag * delta;
      ship.crashVel.x *= drag; ship.crashVel.z *= drag;
      ship.position.addScaledVector(ship.crashVel, delta);
      ship.tumble.x += ship.spin.x * delta;
      ship.tumble.y += ship.spin.y * delta;
      ship.tumble.z += ship.spin.z * delta;

      ship.smokeTimer -= delta;
      if (ship.smokeTimer <= 0) { spawnSmoke(ship.position); ship.smokeTimer = SKY_BATTLE.smokePuffInterval; }

      if (ship.position.y <= 0.5) {
        ship.position.y = 0.5;
        ship.crashing = false;
        // Ground impact: a big fireball plus a spray of secondary blasts.
        spawnExplosion(ship.position, SKY_BATTLE.groundBlastScale, SKY_BATTLE.groundBlastLife);
        for (let s = 0; s < 3; s++) {
          _desired.copy(ship.position);
          _desired.x += rand(-3, 3); _desired.z += rand(-3, 3); _desired.y += rand(0, 2);
          spawnExplosion(_desired, rand(0.8, 1.6), SKY_BATTLE.groundBlastLife * 0.7);
        }
        for (let s = 0; s < 6; s++) spawnSmoke(ship.position);
        ship.respawnTimer = rand(SKY_BATTLE.respawnDelayMin, SKY_BATTLE.respawnDelayMax);
      }
      continue;
    }

    if (!ship.alive) {
      ship.respawnTimer -= delta;
      if (ship.respawnTimer <= 0) respawnShip(ship);
      continue;
    }

    const gunsOnTarget = flyDogfight(ship, ships, delta);

    // Damaged ships trail smoke before they go down.
    if (ship.health <= ship.maxHealth * 0.5) {
      ship.smokeTimer -= delta;
      if (ship.smokeTimer <= 0) { spawnSmoke(ship.position); ship.smokeTimer = SKY_BATTLE.smokePuffInterval * 4; }
    }

    ship.fireCooldown -= delta;
    if (ship.fireCooldown <= 0 && gunsOnTarget) {
      fireBolt(ship);
      ship.fireCooldown = rand(SKY_BATTLE.fireCooldownMin, SKY_BATTLE.fireCooldownMax);
    }
  }

  // --- Bolts: travel, collide, expire --------------------------------------
  for (const bolt of skyBattle.bolts) {
    if (!bolt.active) continue;
    _segment.copy(bolt.velocity).multiplyScalar(delta);
    bolt.lifetime -= delta;
    if (bolt.lifetime <= 0) { bolt.active = false; continue; }
    for (const ship of ships) {
      if (!ship.alive || ship.team === bolt.team) continue;
      _toShip.subVectors(ship.position, bolt.position);
      const t = THREE.MathUtils.clamp(_toShip.dot(_segment) / Math.max(_segment.lengthSq(), .000001), 0, 1);
      _closest.copy(bolt.position).addScaledVector(_segment, t);
      if (_closest.distanceToSquared(ship.position) < 4) { // swept 2-unit radius
        bolt.position.copy(_closest);
        ship.health -= SKY_BATTLE.boltDamage;
        bolt.active = false;
        spawnExplosion(bolt.position, 0.45, 0.25); // small hit spark
        if (ship.health <= 0) beginCrash(ship);
        break;
      }
    }
  }

  for (const bolt of skyBattle.bolts) if (bolt.active) bolt.position.addScaledVector(bolt.velocity, delta);

  // --- Explosions and smoke: age and expire --------------------------------
  for (const exp of skyBattle.explosions) {
    if (!exp.active) continue;
    exp.age += delta;
    if (exp.age >= exp.lifetime) exp.active = false;
  }
  for (const puff of skyBattle.smoke) {
    if (!puff.active) continue;
    puff.age += delta;
    puff.position.y += SKY_BATTLE.smokeRise * delta;
    if (puff.age >= puff.lifetime) puff.active = false;
  }
}