// Camera "juice" — trauma-based screen shake, recoil kick and FOV punches.
// Presentation only: listens to gameEvents, never mutates gameplay state.
// CameraRig owns the camera and calls `stepCameraFeedback(dt)` once per frame,
// then reads the offsets from `cameraJuice`. Overlays read `cameraView` to
// project world positions without needing access to the R3F context.
import { gameEvents } from '@/game/gameEvents';
import { settings } from '@/game/settings';
import { gameState } from '@/game/3d/world';
import { towerDefenseState } from '@/game/3d/towerDefenseState';

// Live camera handle for DOM/canvas overlays (populated by CameraRig).
export const cameraView = {
  camera: null,
  yaw: 0,            // world yaw of the view direction (atan2(dir.x, dir.z))
  focusX: 0, focusZ: 0, // strategic look target (ground point under screen center)
};

// Per-frame outputs consumed by CameraRig. Mutated in place — no allocations.
export const cameraJuice = {
  trauma: 0,        // 0..1, shake intensity = trauma²
  shakeYaw: 0, shakePitch: 0, shakeRoll: 0, // radians
  shakeX: 0, shakeY: 0,                     // camera-local metres (third person)
  recoilPitch: 0,   // radians, positive = kicked upward
  recoilYaw: 0,
  fovKick: 0,       // degrees added on top of the base FOV
};

const TUNING = {
  traumaDecay: 1.35,       // trauma units per second
  freq: 17,                // noise frequency (Hz-ish)
  third: { yaw: 0.022, pitch: 0.02, roll: 0.045, x: 0.11, y: 0.09 },
  strategic: { roll: 0.012, offset: 0.006 }, // offset scales with camera distance
  recoilSnap: 28,          // how fast the camera reaches the kick (1/s)
  recoilRecover: 7.5,      // how fast the kick target returns to rest (1/s)
  recoilMax: 0.09,
  fovKickDecay: 7,
  strategicTraumaCap: 0.42,
};

let recoilTargetPitch = 0;
let recoilTargetYaw = 0;
let noiseTime = 0;

// --- Smoothed 1D gradient noise (deterministic, allocation free) -------------
function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n ^= n >>> 16;
  return (n & 0xffff) / 32767.5 - 1;
}
function noise1(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const g0 = hash((i + seed * 7919) | 0);
  const g1 = hash((i + 1 + seed * 7919) | 0);
  const a = g0 * f, b = g1 * (f - 1);
  return (a + u * (b - a)) * 2; // ≈ -1..1
}

const shakeScale = () => {
  const s = settings.get().screenShake;
  return Number.isFinite(s) ? Math.max(0, Math.min(1, s)) : 1;
};

export function addTrauma(amount) {
  if (!(amount > 0)) return;
  const cap = gameState.mode === 'strategic' ? TUNING.strategicTraumaCap : 1;
  cameraJuice.trauma = Math.max(cameraJuice.trauma, Math.min(cap, cameraJuice.trauma + amount));
}

/** Kick the view upward (radians). Recovers automatically. */
export function addRecoil(pitch, yaw = 0) {
  recoilTargetPitch = Math.min(TUNING.recoilMax, recoilTargetPitch + pitch);
  recoilTargetYaw = Math.max(-TUNING.recoilMax, Math.min(TUNING.recoilMax, recoilTargetYaw + yaw));
}

export function addFovKick(deg) {
  cameraJuice.fovKick = Math.min(12, cameraJuice.fovKick + deg);
}

export function resetCameraFeedback() {
  cameraJuice.trauma = 0; cameraJuice.recoilPitch = 0; cameraJuice.recoilYaw = 0; cameraJuice.fovKick = 0;
  cameraJuice.shakeYaw = cameraJuice.shakePitch = cameraJuice.shakeRoll = cameraJuice.shakeX = cameraJuice.shakeY = 0;
  recoilTargetPitch = 0; recoilTargetYaw = 0;
}

/** Advance shake/recoil/FOV state. Call once per rendered frame. */
export function stepCameraFeedback(dt) {
  const j = cameraJuice;
  j.trauma = Math.max(0, j.trauma - TUNING.traumaDecay * dt);
  noiseTime += dt * TUNING.freq;
  const s = j.trauma * j.trauma * shakeScale();
  if (s > 0.0001) {
    const strategic = gameState.mode === 'strategic';
    const t = noiseTime;
    if (strategic) {
      j.shakeRoll = TUNING.strategic.roll * s * noise1(t, 3);
      j.shakeX = TUNING.strategic.offset * s * noise1(t, 4);
      j.shakeY = TUNING.strategic.offset * s * noise1(t, 5);
      j.shakeYaw = 0; j.shakePitch = 0;
    } else {
      j.shakeYaw = TUNING.third.yaw * s * noise1(t, 1);
      j.shakePitch = TUNING.third.pitch * s * noise1(t, 2);
      j.shakeRoll = TUNING.third.roll * s * noise1(t, 3);
      j.shakeX = TUNING.third.x * s * noise1(t, 4);
      j.shakeY = TUNING.third.y * s * noise1(t, 5);
    }
  } else {
    j.shakeYaw = j.shakePitch = j.shakeRoll = j.shakeX = j.shakeY = 0;
  }
  // Recoil: snap toward the kick target, target relaxes back to zero.
  const snap = 1 - Math.exp(-TUNING.recoilSnap * dt);
  const relax = Math.exp(-TUNING.recoilRecover * dt);
  recoilTargetPitch *= relax; recoilTargetYaw *= relax;
  j.recoilPitch += (recoilTargetPitch - j.recoilPitch) * snap;
  j.recoilYaw += (recoilTargetYaw - j.recoilYaw) * snap;
  j.fovKick *= Math.exp(-TUNING.fovKickDecay * dt);
  if (j.fovKick < 0.01) j.fovKick = 0;
}

// --- Event wiring --------------------------------------------------------------
// Listener position for explosion attenuation: the controlled unit in third person,
// the strategic look target otherwise.
function listenerDistance(x, z) {
  if (gameState.mode === 'third_person' || gameState.transitioning) {
    const p = gameState.soldierPosition;
    return Math.hypot(x - p.x, z - p.z);
  }
  return Math.hypot(x - cameraView.focusX, z - cameraView.focusZ);
}

// Smooth falloff: 1 at the epicentre, 0 at radius.
const falloff = (d, r) => { const k = Math.max(0, 1 - d / r); return k * k; };

function controlledTowerType() {
  const st = gameState.controlledStation;
  if (!st || st.type !== 'tower') return null;
  const towers = towerDefenseState.towers;
  for (let i = 0; i < towers.length; i++) if (towers[i].id === st.id) return towers[i].type;
  return null;
}

// Per-weapon feel: [trauma, recoil pitch, fov kick]
const SHOT_FEEL = {
  soldier: [0.035, 0.009, 0],
  tank: [0.42, 0.05, 4.5],
  'tower-mg': [0.05, 0.0045, 0],
  'tower-cannon': [0.3, 0.035, 3],
  'tower-frost': [0.08, 0.01, 0.6],
  artillery: [0.5, 0.04, 5],
};
let yawJitter = 0x9e3779b9;
function jitter() { // cheap LCG, -1..1 (keeps combat RNG untouched)
  yawJitter = (Math.imul(yawJitter, 1664525) + 1013904223) | 0;
  return ((yawJitter >>> 8) & 0xffff) / 32767.5 - 1;
}

function applyShotFeel(key) {
  const feel = SHOT_FEEL[key] ?? SHOT_FEEL.soldier;
  addTrauma(feel[0]);
  addRecoil(feel[1], feel[1] * 0.35 * jitter());
  if (feel[2]) addFovKick(feel[2]);
}

function onShot(e) {
  if (!e.player) return;
  let key = e.kind;
  if (key === 'tower') key = `tower-${controlledTowerType() ?? 'mg'}`;
  else if (key !== 'tank') key = 'soldier';
  applyShotFeel(key);
}
function onArtilleryFire(e) { if (e.player) applyShotFeel('artillery'); }

function onExplosion(e) {
  const size = e.size ?? 1;
  const d = listenerDistance(e.x, e.z);
  if (gameState.mode === 'strategic' && !gameState.transitioning) {
    // Strategic view: only big blasts, gently.
    if (e.kind === 'ambient' || size < 1.4) return;
    addTrauma(0.32 * (size / 1.6) * falloff(d, 45 + 20 * size));
    return;
  }
  const ambient = e.kind === 'ambient';
  const strength = (ambient ? 0.32 : 0.6) * size;
  addTrauma(strength * falloff(d, 12 + 16 * size));
}

function onDamage(e) {
  if (!e.playerTarget) return;
  const amount = e.amount ?? 0;
  addTrauma(0.1 + Math.min(0.35, amount / 90) + (e.killed ? 0.4 : 0));
  if (amount > 25) addFovKick(-1.5); // heavy hit: brief inward squeeze
}

function onKill(e) {
  if (!e.player || e.targetTeam !== 'enemy') return;
  if (e.targetType === 'trilobite') { addFovKick(2.2); addTrauma(0.15); }
}

let installed = 0;
let offFns = [];
/** Subscribe to gameEvents. Ref-counted; returns an uninstall function. */
export function installCameraFeedback() {
  if (installed++ === 0) {
    offFns = [
      gameEvents.on('shot', onShot),
      gameEvents.on('artillery-fire', onArtilleryFire),
      gameEvents.on('explosion', onExplosion),
      gameEvents.on('damage', onDamage),
      gameEvents.on('kill', onKill),
    ];
  }
  return () => {
    if (--installed === 0) { for (const off of offFns) off(); offFns = []; resetCameraFeedback(); }
  };
}
