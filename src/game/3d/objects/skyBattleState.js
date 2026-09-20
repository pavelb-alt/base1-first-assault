import * as THREE from 'three';
import { SKY_BATTLE } from '@/game/config';

const MAX_SHIPS = SKY_BATTLE.maxShips;
const MAX_BOLTS = SKY_BATTLE.maxBolts;
const MAX_EXPLOSIONS = SKY_BATTLE.maxExplosions;

// Scratch vectors — reused every frame, never allocated per-call.
const _desired = new THREE.Vector3();
const _current = new THREE.Vector3();
const _cross = new THREE.Vector3();

export const skyBattle = {
  ships: [],
  bolts: [],
  explosions: [],
  initialized: false,
  nextBoltIdx: 0,
  nextExplosionIdx: 0,
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
    active: false,
  };
}

export function initSkyBattle() {
  skyBattle.ships = Array.from({ length: MAX_SHIPS }, (_, i) => createShipState(i));
  skyBattle.bolts = Array.from({ length: MAX_BOLTS }, createBoltState);
  skyBattle.explosions = Array.from({ length: MAX_EXPLOSIONS }, createExplosionState);
  skyBattle.initialized = true;
  skyBattle.nextBoltIdx = 0;
  skyBattle.nextExplosionIdx = 0;
}

export function resetSkyBattle() {
  skyBattle.ships = Array.from({ length: MAX_SHIPS }, (_, i) => createShipState(i));
  for (const bolt of skyBattle.bolts) { bolt.active = false; bolt.lifetime = 0; }
  for (const exp of skyBattle.explosions) { exp.active = false; exp.age = 0; }
  skyBattle.initialized = true;
  skyBattle.nextBoltIdx = 0;
  skyBattle.nextExplosionIdx = 0;
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

function spawnExplosion(position) {
  const exp = skyBattle.explosions[skyBattle.nextExplosionIdx];
  skyBattle.nextExplosionIdx = (skyBattle.nextExplosionIdx + 1) % MAX_EXPLOSIONS;
  exp.position.copy(position);
  exp.age = 0;
  exp.active = true;
}

function respawnShip(ship) {
  const angle = Math.random() * Math.PI * 2;
  const dist = SKY_BATTLE.bound - 2;
  ship.position.set(Math.cos(angle) * dist, ship.altitude, Math.sin(angle) * dist);
  ship.heading.set(-Math.cos(angle), 0, -Math.sin(angle)).normalize();
  ship.health = ship.maxHealth;
  ship.alive = true;
  ship.fireCooldown = rand(1, 3);
  ship.targetId = null;
  ship.bankAngle = 0;
}

export function updateSkyBattle(delta) {
  const ships = skyBattle.ships;

  // --- Ships: pursuit, banking, firing --------------------------------------
  for (const ship of ships) {
    if (!ship.alive) {
      ship.respawnTimer -= delta;
      if (ship.respawnTimer <= 0) respawnShip(ship);
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
          ship.respawnTimer = rand(SKY_BATTLE.respawnDelayMin, SKY_BATTLE.respawnDelayMax);
          spawnExplosion(ship.position);
        }
        break;
      }
    }
  }

  // --- Explosions: age and expire ------------------------------------------
  for (const exp of skyBattle.explosions) {
    if (!exp.active) continue;
    exp.age += delta;
    if (exp.age >= exp.lifetime) exp.active = false;
  }
}