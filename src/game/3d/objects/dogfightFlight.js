import * as THREE from 'three';
import { SKY_BATTLE as C } from '@/game/config';
import { random } from '@/game/3d/random';

const goal = new THREE.Vector3();
const offset = new THREE.Vector3();
const lead = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function resetFlight(ship) {
  ship.yaw = Math.atan2(ship.heading.x, ship.heading.z);
  ship.pitch = 0;
  ship.bankAngle = 0;
  ship.cruiseSpeed = ship.speed;
  ship.maneuver = 'pursuit';
  ship.maneuverTime = 0;
  ship.targetTime = 0;
  ship.breakSide = ship.id % 2 ? 1 : -1;
  ship.escapeHeading = new THREE.Vector3().copy(ship.heading);
}

// Positive local Z is the existing model's flight axis. Roll drives yaw, so
// wings bank BEFORE the nose changes course; there are no reflected headings.
export function flyDogfight(ship, ships, dt) {
  const F = C.flight;
  ship.targetTime -= dt;
  ship.maneuverTime -= dt;
  let target = ships[ship.targetId];
  if (!target?.alive || target.team === ship.team || ship.targetTime <= 0) {
    let best = Infinity;
    target = null;
    for (const other of ships) {
      if (!other.alive || other.team === ship.team) continue;
      offset.subVectors(other.position, ship.position);
      const distance = offset.length();
      const facing = ship.heading.dot(offset) / Math.max(distance, .001);
      let pursuers = 0;
      for (const ally of ships) if (ally.alive && ally !== ship && ally.targetId === other.id) pursuers++;
      const score = distance + (1 - facing) * 35 + pursuers * 24 - (other.id === ship.targetId ? 25 : 0);
      if (score < best) { best = score; target = other; }
    }
    ship.targetId = target?.id ?? null;
    ship.targetTime = 5 + random() * 4;
  }

  const radius = Math.hypot(ship.position.x, ship.position.z);
  const outward = (ship.position.x * ship.heading.x + ship.position.z * ship.heading.z) / Math.max(radius, 1);
  if (ship.maneuver !== 'return' && radius > C.bound - F.turnMargin && outward > .1) {
    ship.maneuver = 'return';
  } else if (ship.maneuver === 'return' && radius < C.bound * .6) {
    ship.maneuver = 'pursuit';
  }
  if ((ship.maneuver === 'extend' || ship.maneuver === 'break') && ship.maneuverTime <= 0) ship.maneuver = 'pursuit';

  let distance = Infinity;
  if (target) {
    offset.subVectors(target.position, ship.position);
    distance = offset.length();
    if (ship.maneuver === 'pursuit' && distance < F.passDistance) {
      ship.maneuver = 'extend';
      ship.maneuverTime = 2.2 + random();
      ship.escapeHeading.copy(ship.heading);
    }
  }
  if (ship.maneuver === 'pursuit') {
    for (const other of ships) {
      if (!other.alive || other.team === ship.team || other.targetId !== ship.id) continue;
      offset.subVectors(other.position, ship.position);
      const d = offset.length();
      if (d > 8 && d < 28 && offset.dot(ship.heading) / d < -.8 && other.heading.dot(ship.heading) > .8) {
        ship.maneuver = 'break';
        ship.maneuverTime = 1.5 + random();
        ship.breakSide *= -1;
        break;
      }
    }
  }

  if (ship.maneuver === 'return' || !target) {
    goal.set(-ship.position.x * .25, ship.altitude, -ship.position.z * .25);
  } else if (ship.maneuver === 'extend') {
    goal.copy(ship.position).addScaledVector(ship.escapeHeading, 65);
    goal.y = clamp(ship.position.y + 8, F.minAltitude + 5, F.maxAltitude - 5);
  } else if (ship.maneuver === 'break') {
    const yaw = ship.yaw + ship.breakSide * 1.2;
    goal.set(ship.position.x + Math.sin(yaw) * 50, Math.max(F.minAltitude + 4, ship.position.y - 7), ship.position.z + Math.cos(yaw) * 50);
  } else {
    // Lead at firing distance, lag pursuit farther away to get onto the tail
    // rather than all aircraft spiralling around the same point.
    const time = Math.min(distance / C.boltSpeed, 1.1);
    goal.copy(target.position).addScaledVector(target.heading, distance > 45 ? -F.tailDistance : target.speed * time);
  }
  offset.subVectors(goal, ship.position);
  const yawError = wrap(Math.atan2(offset.x, offset.z) - ship.yaw);
  let desiredBank = clamp(-yawError * F.bankGain, -F.maxBank, F.maxBank);
  if (ship.maneuver === 'break') desiredBank = -ship.breakSide * F.maxBank;
  ship.bankAngle += clamp(desiredBank - ship.bankAngle, -F.rollRate * dt, F.rollRate * dt);
  const yawRate = clamp(-F.lift * Math.tan(ship.bankAngle) / ship.speed, -ship.turnRate, ship.turnRate);
  ship.yaw = wrap(ship.yaw + yawRate * dt);
  let desiredPitch = clamp(Math.atan2(offset.y, Math.hypot(offset.x, offset.z)), -F.maxPitch, F.maxPitch);
  if (ship.position.y < F.minAltitude + 3) desiredPitch = F.maxPitch;
  if (ship.position.y > F.maxAltitude - 3) desiredPitch = -F.maxPitch;
  ship.pitch += clamp(desiredPitch - ship.pitch, -F.pitchRate * dt, F.pitchRate * dt);
  const desiredSpeed = clamp(ship.cruiseSpeed - ship.pitch * 9 - Math.abs(ship.bankAngle) * 2 + (ship.maneuver === 'extend' ? 3 : 0), C.shipSpeedMin, C.shipSpeedMax);
  ship.speed += clamp(desiredSpeed - ship.speed, -F.acceleration * dt, F.acceleration * dt);
  ship.heading.set(Math.sin(ship.yaw) * Math.cos(ship.pitch), Math.sin(ship.pitch), Math.cos(ship.yaw) * Math.cos(ship.pitch));
  ship.position.addScaledVector(ship.heading, ship.speed * dt);

  // Nose-mounted guns only fire when the actual intercept is in the gunsight.
  if (!target || ship.maneuver !== 'pursuit' || distance > F.fireRange) return false;
  lead.copy(target.position).addScaledVector(target.heading, target.speed * Math.min(distance / C.boltSpeed, 1.1)).sub(ship.position).normalize();
  return ship.heading.dot(lead) > Math.cos(C.fireAngleThreshold);
}