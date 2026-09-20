import * as THREE from 'three';
import { combat } from '@/game/3d/combat';

const FALL_DURATION = 1.15;
const HOLD_DURATION = 0.35;

export function resetDeathPose(group, actions, idleName, currentAnim) {
  if (!group) return;
  group.position.y = 0;
  group.rotation.x = 0;
  group.rotation.z = 0;
  group.scale.setScalar(1);
  for (const name of Object.keys(actions)) actions[name]?.stop();
  const idle = actions[idleName];
  if (idle) idle.reset().play();
  currentAnim.current = idle ? idleName : null;
}

function startDeath(entry, body, actions, currentAnim) {
  entry.deathElapsed = 0;
  entry.deathDirection = Number(entry.id) % 2 ? 1 : -1;
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  body.setEnabled(false);
  if (combat.byBody.get(body.handle) === entry) combat.byBody.delete(body.handle);

  const clipName = Object.keys(actions).find(name => /death|die|destroy|defeat/i.test(name));
  const next = clipName ? actions[clipName] : null;
  if (next) {
    const old = actions[currentAnim.current];
    if (old && old !== next) old.fadeOut(0.12);
    next.reset().setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.fadeIn(0.12).play();
    currentAnim.current = clipName;
    entry.deathDuration = Math.max(FALL_DURATION, Math.min(2.5, next.getClip().duration)) + HOLD_DURATION;
    entry.nativeDeathAnimation = true;
  } else {
    entry.deathDuration = FALL_DURATION + HOLD_DURATION;
    entry.nativeDeathAnimation = false;
  }
}

// Returns true when the pooled unit can be safely hidden and reused.
export function updateDeathAnimation(entry, body, group, actions, currentAnim, delta, { flying = false } = {}) {
  if (entry.deathElapsed == null) startDeath(entry, body, actions, currentAnim);
  entry.deathElapsed += delta;
  if (!entry.nativeDeathAnimation) {
    const t = Math.min(1, entry.deathElapsed / FALL_DURATION);
    const eased = 1 - (1 - t) ** 3;
    group.rotation.z = entry.deathDirection * eased * (flying ? 0.7 : 1.32);
    group.rotation.x = eased * (flying ? -0.45 : 0.12);
    group.position.y = -eased * (flying ? 2.2 : 0.28);
    group.scale.setScalar(1 - eased * 0.06);
  }
  return entry.deathElapsed >= entry.deathDuration;
}