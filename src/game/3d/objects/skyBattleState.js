import * as THREE from 'three';
import { SKY_BATTLE } from '@/game/config';

const MAX_SHIPS = SKY_BATTLE.maxShips;
const MAX_BOLTS = SKY_BATTLE.maxBolts;
const MAX_EXPLOSIONS = SKY_BATTLE.maxExplosions;
const MAX_SMOKE = SKY_BATTLE.maxSmoke;

// Scratch vectors — reused every frame, never allocated per-call.
const _desired = new THREE.Vector3();
const _current = new THREE.Vector3();
const _cross = new THREE.Vector3();
const _smokeVelocity = new THREE.Vector3();

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

function rand(min, max) { return min + Math.random() * (max - min); }

function createShipState(i) {
  const team = i < MAX_SHIPS / 2 ? 'friendly' : 'enemy';
  const typeIndex = i % 3;
  const altitude = SKY_BATTLE.altitudeBands[i % SKY_BATTLE.altitudeBands.length];
  const xOff = (i % 6 - 2.5) * 12;
  const zBase = team === 'friendly' ? 35 : -35;
  const zOff = (i % 3) * 5;
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
    crashing: false,
    crashVelocity: new THREE.Vector3(),
    crashSpin: new THREE.Vector3(),
    crashRotation: new THREE.Vector3(),
    smokeTimer: 0,
    respawnTimer: 0,
    fireCooldown: rand(1, 3),
    targetId: null,
    speed: rand(SKY_BATTLE.shipSpeedMin, SKY_BATTLE.shipSpeedMax),
    turnRate: rand(SKY_BATTLE.turnRateMin, SKY_BATTLE.turnRateMax),
    altitude,
    wanderPhase: Math.random() * Math.PI * 2,
    wanderFreq: rand(0.3, 0.7),
  };
}

function createBoltState() {
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    team: 'friendly',
    active: false,
    lifetime: 0,
  };
}

function createExplosionState() {
  return {
    position: new THREE.Vector3(),
    age: 0,
    lifetime: SKY_BATTLE.explosionLifetime,
    scale: 1,
    active: false,
  };
}

function createSmokeState() {
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    age: 0,
    lifetime: SKY_BATTLE.smokeLifetime,
    scale: 1,
    active: false,
  };
}

export function initSkyBattle() {
  skyBattle.ships = Array.from({ length: MAX_SHIPS }, (_, i) => createShipState(i));
  skyBattle.bolts = Array.from({ length: MAX_BOLTS }, createBoltState);
  skyBattle.explosions = Array.from({ length: MAX_EXPLOSIONS }, createExplosionState);
  skyBattle.smoke = Array.from({ length: MAX_SMOKE }, createSmokeState);
  skyBattle.initialized = true;
  skyBattle.nextBoltIdx = 0;
  skyBattle.nextExplosionIdx = 0;
  skyBattle.nextSmokeIdx = 0;
}

export function resetSkyBattle() {
  skyBattle.ships = Array.from({ length: MAX_SHIPS }, (_, i) => createShipState(i));
  for (const bolt of skyBattle.bolts) { bolt.active = false; bolt.lifetime = 0; }
  for (const exp of skyBattle.explosions) { exp.active = false; exp.age = 0; }
  for (const puff of skyBattle.smoke) { puff.active = false; puff.age = 0; }
  skyBattle.initialized = true;
  skyBattle.nextBoltIdx = 0;
  skyBattle.nextExplosionIdx = 0;
  skyBattle.nextSmokeIdx = 0;
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

function spawnExplosion(position, scale = 1) {
  const exp = skyBattle.explosions[skyBattle.nextExplosionIdx];
  skyBattle.nextExplosionIdx = (skyBattle.nextExplosionIdx + 1) % MAX_EXPLOSIONS;
  exp.position.copy(position);
  exp.age = 0;
  exp.scale = scale;
  exp.active = true;
}

function spawnSmoke(position, velocity, scale = 1) {
  const puff = skyBattle.smoke[skyBattle.nextSmokeIdx];
  skyBattle.nextSmokeIdx = (skyBattle.nextSmokeIdx + 1) % MAX_SMOKE;
  puff.position.copy(position);
  puff.velocity.copy(velocity);
  puff.age = 0;
  puff.scale = scale;
  puff.active = true;
}

function respawnShip(ship) {
  const angle = Math.random() * Math.PI * 2;
  const dist = SKY_BATTLE.bound - 2;
  ship.position.set(Math.cos(angle) * dist, ship.altitude, Math.sin(angle) * dist);
  ship.heading.set(-Math.cos(angle), 0, -Math.sin(angle)).normalize();
  ship.health = ship.maxHealth;
  ship.alive = true;
  ship.crashing = false;
  ship.crashVelocity.set(0, 0, 0);
  ship.crashSpin.set(0, 0, 0);
  ship.crashRotation.set(0, 0, 0);
  ship.smokeTimer = 0;
  ship.fireCooldown = rand(1, 3);
  ship.targetId = null;
  ship.bankAngle = 0;
}

export function updateSkyBattle(delta) {
  const ships = skyBattle.ships;

  // --- Ships: pursuit, banking, firing and wreck descent --------------------
  for (const ship of ships) {
    if (!ship.alive) {
      if (ship.crashing) {
        ship.crashVelocity.y -= SKY_BATTLE.crashGravity * delta;
        ship.position.addScaledVector(ship.crashVelocity, delta);
        ship.crashRotation.x += ship.crashSpin.x * delta;
        ship.crashRotation.y += ship.crashSpin.y * delta;
        ship.crashRotation.z += ship.crashSpin.z * delta;
        ship.smokeTimer -= delta;
        if (ship.smokeTimer <= 0) {
          _smokeVelocity.set(rand(-0.5, 0.5), rand(1.5, 3), rand(-0.5, 0.5));
          spawnSmoke(ship.position, _smokeVelocity, rand(0.7, 1.25));
          ship.smokeTimer = 0.07;
        }
        if (ship.position.y <= 0.7) {
          ship.position.y = 0.7;
          ship.crashing = false;
          ship.respawnTimer = rand(SKY_BATTLE.respawnDelayMin, SKY_BATTLE.respawnDelayMax);
          spawnExplosion(ship.position, 1.8);
          for (let i = 0; i < 5; i++) {
            _smokeVelocity.set(rand(-2.5, 2.5), rand(2, 5), rand(-2.5, 2.5));
            spawnSmoke(ship.position, _smokeVelocity, rand(1, 1.7));
          }
        }
      } else {
        ship.respawnTimer -= delta;
        if (ship.respawnTimer <= 0) respawnShip(ship);
      }
      continue;
    }

    // Acquire target — nearest living enemy
    let target = ships.find(s => s.id === ship.targetId && s.alive && s.team !== ship.team);
    if (!target) {
      let nearest = null, minDist = Infinity;
      for (const s of ships) {
        if (!s.alive || s.team === ship.team) continue;
        const d = ship.position.distanceToSquared(s.position);
        if (d < minDist) { minDist = d; nearest = s; }
      }
      target = nearest;
      ship.targetId = target?.id ?? null;
    }
    if (!target) continue;

    // Desired direction toward target
    _desired.subVectors(target.position, ship.position);
    const dist = _desired.length();
    if (dist < 0.001) continue;
    _desired.divideScalar(dist);

    // Wander for curved, non-synchronized flight paths
    ship.wanderPhase += delta * ship.wanderFreq;
    _desired.x += Math.sin(ship.wanderPhase + ship.id * 2.1) * 0.15;
    _desired.z += Math.cos(ship.wanderPhase + ship.id * 1.7) * 0.15;
    _desired.normalize();

    // Turn toward desired (rate-limited)
    _current.copy(ship.heading);
    let dot = _current.dot(_desired);
    dot = Math.max(-1, Math.min(1, dot));
    const angle = Math.acos(dot);
    const maxTurn = ship.turnRate * delta;
    const turnAmount = Math.min(angle, maxTurn);
    if (angle > 0.001) {
      ship.heading.lerp(_desired, turnAmount / angle);
      ship.heading.normalize();
    }

    // Move forward along heading
    ship.position.addScaledVector(ship.heading, ship.speed * delta);
    ship.position.y = ship.altitude; // hold altitude band

    // Bank into turn (visual roll)
    _cross.crossVectors(_current, _desired);
    const targetBank = -angle * 0.4 * (_cross.y > 0 ? 1 : -1);
    ship.bankAngle = THREE.MathUtils.lerp(ship.bankAngle, targetBank, Math.min(1, delta * 4));

    // Bounds — bounce heading off edges
    const B = SKY_BATTLE.bound;
    if (ship.position.x > B) { ship.position.x = B; ship.heading.x = -Math.abs(ship.heading.x); }
    if (ship.position.x < -B) { ship.position.x = -B; ship.heading.x = Math.abs(ship.heading.x); }
    if (ship.position.z > B) { ship.position.z = B; ship.heading.z = -Math.abs(ship.heading.z); }
    if (ship.position.z < -B) { ship.position.z = -B; ship.heading.z = Math.abs(ship.heading.z); }

    // Fire only when roughly aligned with target
    ship.fireCooldown -= delta;
    if (ship.fireCooldown <= 0 && angle < SKY_BATTLE.fireAngleThreshold) {
      fireBolt(ship);
      ship.fireCooldown = rand(SKY_BATTLE.fireCooldownMin, SKY_BATTLE.fireCooldownMax);
    }
  }

  // --- Bolts: travel, collide, expire --------------------------------------
  for (const bolt of skyBattle.bolts) {
    if (!bolt.active) continue;
    bolt.position.addScaledVector(bolt.velocity, delta);
    bolt.lifetime -= delta;
    if (bolt.lifetime <= 0) { bolt.active = false; continue; }
    for (const ship of ships) {
      if (!ship.alive || ship.team === bolt.team) continue;
      if (bolt.position.distanceToSquared(ship.position) < 4) { // 2-unit radius
        ship.health -= SKY_BATTLE.boltDamage;
        bolt.active = false;
        if (ship.health <= 0) {
          ship.alive = false;
          spawnExplosion(ship.position, 1.15);
          if (Math.random() < SKY_BATTLE.crashChance) {
            ship.crashing = true;
            ship.crashVelocity.copy(ship.heading).multiplyScalar(SKY_BATTLE.crashForwardSpeed);
            ship.crashVelocity.y = rand(-1, 2);
            ship.crashSpin.set(rand(1.5, 4), rand(-2, 2), rand(-4, 4));
            ship.crashRotation.set(0, 0, 0);
            ship.smokeTimer = 0;
          } else {
            ship.crashing = false;
            ship.respawnTimer = rand(SKY_BATTLE.respawnDelayMin, SKY_BATTLE.respawnDelayMax);
          }
        }
        break;
      }
    }
  }

  // --- Explosions and smoke: animate and recycle ----------------------------
  for (const exp of skyBattle.explosions) {
    if (!exp.active) continue;
    exp.age += delta;
    if (exp.age >= exp.lifetime) exp.active = false;
  }
  for (const puff of skyBattle.smoke) {
    if (!puff.active) continue;
    puff.position.addScaledVector(puff.velocity, delta);
    puff.velocity.y += 0.35 * delta;
    puff.age += delta;
    if (puff.age >= puff.lifetime) puff.active = false;
  }
}