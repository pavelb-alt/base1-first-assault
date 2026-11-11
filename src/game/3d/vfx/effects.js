import * as THREE from 'three';
import { EXPLOSIONS as E, PERFORMANCE, LIGHTING } from '@/game/config';
import { terrainHeight } from '@/game/3d/terrain';
import { createParticleLayer, particleClock, P, SHAPE, ORIENT, ADDITIVE } from '@/game/3d/vfx/particles';
import { vfxStats } from '@/game/3d/vfx/stats';

// High-level, allocation-free effect recipes on top of three GPU particle layers
// plus a fixed pool of point lights, wreck "burners" and delayed secondary
// blasts. Everything is visual only and uses Math.random (never the combat RNG).
export const layers = {
  ground: createParticleLayer({ name: 'ground decals', capacity: E.groundCapacity, renderOrder: 1, polygonOffset: true }),
  volume: createParticleLayer({ name: 'smoke and debris', capacity: E.volumeCapacity, renderOrder: 2 }),
  emissive: createParticleLayer({ name: 'fire and sparks', capacity: E.emissiveCapacity, additive: true, radiance: LIGHTING.fireRadiance * 0.5, renderOrder: 3 }),
};

const MAX_LIGHTS = 4;
export const lightSlots = Array.from({ length: MAX_LIGHTS }, () => ({
  x: 0, y: 0, z: 0, peak: 0, range: 10, age: 1, duration: 0, priority: 0, color: new THREE.Color(),
}));
const burners = Array.from({ length: E.burnerCapacity }, () => ({ active: false, x: 0, y: 0, z: 0, age: 0, life: 0, fire: 0, smoke: 0, power: 1, energy: null }));
const delayed = Array.from({ length: 16 }, () => ({ active: false, at: 0, x: 0, z: 0, power: 1, style: 'shell' }));
const camera = new THREE.Vector3(0, 100, 0);
const lastSetPiece = { x: 1e9, z: 1e9, at: -1e9 };
function markSetPiece(x, z, at) { lastSetPiece.x = x; lastSetPiece.z = z; lastSetPiece.at = at; }

const rnd = Math.random;
const tmp = new THREE.Color();
const C = {
  fire: new THREE.Color(E.fireColor), core: new THREE.Color(E.coreColor), ember: new THREE.Color(E.emberColor),
  spark: new THREE.Color(E.sparkColor), dust: new THREE.Color(E.dustColor), scorch: new THREE.Color(E.scorchColor),
  smoke: new THREE.Color(E.smokeColor), debris: new THREE.Color(E.debrisColor), light: new THREE.Color(E.lightColor),
  friendlyHit: new THREE.Color(E.friendlyImpact), enemyHit: new THREE.Color(E.enemyImpact),
  muzzle: new THREE.Color('#ffd38a'), muzzleCold: new THREE.Color('#9fdcff'), white: new THREE.Color('#ffffff'),
};
const energy = Object.fromEntries(Object.entries(E.alienEnergy).map(([k, v]) => [k, new THREE.Color(v)]));
const defaultEnergy = new THREE.Color(E.alienEnergy.quadshell);

const count = n => Math.max(1, Math.round(n * PERFORMANCE.vfxParticleScale));
const now = () => particleClock.value;
export function setVfxCamera(position) { camera.copy(position); }
// Coarse distance LOD for high-frequency small effects (impacts, muzzle smoke).
function lod(x, y, z) {
  const d2 = (camera.x - x) ** 2 + (camera.y - y) ** 2 + (camera.z - z) ** 2;
  return d2 < 3600 ? 1 : d2 < 22500 ? 0.55 : 0.3;
}
function reset(shape, orient) {
  P.delay = 0; P.gravity = 0; P.drag = 0; P.floor = -1e4; P.vx = 0; P.vy = 0; P.vz = 0;
  P.shape = shape; P.orient = orient; P.seed = rnd(); P.a = 1;
}
function rgb(color, scale = 1) { P.r = color.r * scale; P.g = color.g * scale; P.b = color.b * scale; }

// --- Lights ------------------------------------------------------------------
export function flashLight(x, y, z, color, intensity, range, duration, priority = 1) {
  const n = Math.min(MAX_LIGHTS, PERFORMANCE.dynamicLights);
  if (n <= 0) return;
  let best = null, bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    const s = lightSlots[i];
    const remaining = s.duration > 0 ? Math.max(0, 1 - s.age / s.duration) : 0;
    const score = remaining * s.priority * s.peak;
    if (score < bestScore) { bestScore = score; best = s; }
  }
  if (bestScore > priority * intensity) return; // every slot is busy with something brighter
  best.x = x; best.y = y; best.z = z; best.peak = intensity; best.range = range;
  best.age = 0; best.duration = duration; best.priority = priority; best.color.copy(color);
}

// --- Explosions --------------------------------------------------------------
// style: 'ambient' | 'shell' | 'vehicle' | 'splash'
export function explosion(x, z, power = 1, style = 'ambient') {
  const gy = terrainHeight(x, z);
  const y = gy + 0.15;
  const big = style === 'vehicle' || style === 'shell';
  vfxStats.bursts++;
  // Flash core
  reset(SHAPE.GLOW, ORIENT.BILLBOARD); rgb(C.core, 2.4);
  P.x = x; P.y = y + 0.8 * power; P.z = z; P.life = 0.16; P.size0 = 1.8 * power; P.size1 = 3.6 * power;
  layers.emissive.emit(P);
  // Fireball
  for (let i = 0, n = count(big ? 9 : 6) * Math.ceil(power); i < n; i++) {
    const a = rnd() * Math.PI * 2, s = 1.2 + rnd() * 3.2;
    reset(SHAPE.FIRE, ORIENT.BILLBOARD); rgb(C.fire, 1.1 + rnd() * 0.5);
    P.x = x + Math.cos(a) * 0.35 * power; P.y = y + 0.3 + rnd() * 0.6 * power; P.z = z + Math.sin(a) * 0.35 * power;
    P.vx = Math.cos(a) * s; P.vy = 2 + rnd() * 4 * power; P.vz = Math.sin(a) * s;
    P.drag = 2.6; P.gravity = -1.5; P.life = 0.45 + rnd() * 0.45 * power; P.delay = rnd() * 0.06;
    P.size0 = (0.45 + rnd() * 0.35) * power; P.size1 = (1.5 + rnd() * 1.1) * power;
    layers.emissive.emit(P);
  }
  // Smoke column: buoyant, slowly widening, dark core lightening with age.
  for (let i = 0, n = count(big ? 10 : 7) * Math.ceil(power * 0.75); i < n; i++) {
    const a = rnd() * Math.PI * 2, s = 0.4 + rnd() * 1.2;
    reset(SHAPE.SMOKE, ORIENT.BILLBOARD);
    tmp.copy(C.smoke).lerp(C.dust, rnd() * 0.35); rgb(tmp);
    P.x = x + Math.cos(a) * 0.5; P.y = y + 0.4 + rnd() * 0.8 * power; P.z = z + Math.sin(a) * 0.5;
    P.vx = Math.cos(a) * s + 0.35; P.vy = 1.6 + rnd() * 2.6 * power; P.vz = Math.sin(a) * s;
    P.drag = 0.7; P.gravity = -0.5; P.life = 2.8 + rnd() * 2.2 * power; P.delay = 0.05 + rnd() * 0.25;
    P.size0 = (0.7 + rnd() * 0.5) * power; P.size1 = (2.6 + rnd() * 1.8) * power; P.a = 0.5 + rnd() * 0.2;
    layers.volume.emit(P);
  }
  // Ground dust skirt rolling outward.
  for (let i = 0, n = count(10); i < n; i++) {
    const a = (i / n + rnd() * 0.08) * Math.PI * 2, s = (3.5 + rnd() * 3) * Math.sqrt(power);
    reset(SHAPE.SMOKE, ORIENT.BILLBOARD); rgb(C.dust);
    P.x = x; P.y = gy + 0.35; P.z = z; P.vx = Math.cos(a) * s; P.vy = 0.25 + rnd() * 0.4; P.vz = Math.sin(a) * s;
    P.drag = 2.2; P.life = 1.5 + rnd() * 0.9; P.size0 = 0.5 * power; P.size1 = (1.6 + rnd()) * power; P.a = 0.32;
    layers.volume.emit(P);
  }
  // Shockwave ring on the ground.
  reset(SHAPE.RING, ORIENT.GROUND); rgb(C.dust, 1.25);
  P.x = x; P.y = gy + 0.12; P.z = z; P.life = 0.5; P.size0 = 0.4; P.size1 = 5.5 * power; P.a = 0.55;
  layers.ground.emit(P);
  // Spark streaks.
  for (let i = 0, n = count(big ? 18 : 12) * Math.ceil(power * 0.7); i < n; i++) {
    const a = rnd() * Math.PI * 2, up = 0.25 + rnd() * 0.75, s = 6 + rnd() * 10;
    reset(SHAPE.STREAK, ORIENT.STREAK); rgb(C.spark, 1.4);
    P.x = x; P.y = y + 0.3; P.z = z;
    P.vx = Math.cos(a) * s * (1 - up * 0.5); P.vy = s * up; P.vz = Math.sin(a) * s * (1 - up * 0.5);
    P.gravity = 9.8; P.drag = 0.7; P.floor = gy + 0.03; P.life = 0.5 + rnd() * 0.6;
    P.size0 = 0.035; P.size1 = 0.5;
    layers.emissive.emit(P);
  }
  // Flying debris chunks that land and linger briefly.
  for (let i = 0, n = count(big ? 14 : 9); i < n; i++) {
    const a = rnd() * Math.PI * 2, s = 2.5 + rnd() * 6;
    reset(SHAPE.CHUNK, ORIENT.BILLBOARD);
    tmp.copy(C.debris).lerp(C.dust, rnd() * 0.4); rgb(tmp);
    P.x = x; P.y = y + 0.2; P.z = z; P.vx = Math.cos(a) * s; P.vy = 4 + rnd() * 7 * power; P.vz = Math.sin(a) * s;
    P.gravity = 16; P.drag = 0.25; P.floor = gy + 0.06; P.life = 1.8 + rnd() * 1.2;
    P.size0 = P.size1 = 0.07 + rnd() * 0.12 * power;
    layers.volume.emit(P);
  }
  // Rising embers.
  for (let i = 0, n = count(5); i < n; i++) {
    reset(SHAPE.GLOW, ORIENT.BILLBOARD); rgb(C.ember, 2);
    P.x = x + (rnd() - 0.5) * power; P.y = y + 0.5; P.z = z + (rnd() - 0.5) * power;
    P.vx = (rnd() - 0.5) * 2; P.vy = 2 + rnd() * 3; P.vz = (rnd() - 0.5) * 2;
    P.drag = 1.2; P.gravity = -0.6; P.life = 1.2 + rnd() * 1.4; P.size0 = 0.08; P.size1 = 0.03;
    layers.emissive.emit(P);
  }
  // Ground scorch decal (long-lived, capped by the ground ring buffer).
  reset(SHAPE.SCORCH, ORIENT.GROUND); rgb(C.scorch);
  P.x = x; P.y = gy + 0.07; P.z = z; P.life = E.scorchLife * (big ? 1.3 : 1); P.size0 = 1.3 * power; P.size1 = 1.65 * power; P.a = 0.8;
  layers.ground.emit(P);
  flashLight(x, y + 1.6, z, C.light, E.lightIntensity * power, E.lightRange * Math.sqrt(power), big ? 0.45 : 0.32, big ? 3 : 2);
}

// Destroyed tank / artillery: big blast, two secondaries, then a burning wreck.
export function vehicleExplosion(x, z, power = 2.2) {
  const t = now();
  if (Math.hypot(x - lastSetPiece.x, z - lastSetPiece.z) < 3 && t - lastSetPiece.at < 0.6) return;
  markSetPiece(x, z, t);
  vfxStats.setPieces++;
  explosion(x, z, power, 'vehicle');
  schedule(t + 0.22, x + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 2, power * 0.55, 'splash');
  schedule(t + 0.55, x + (rnd() - 0.5) * 2.5, z + (rnd() - 0.5) * 2.5, power * 0.45, 'splash');
  burn(x, terrainHeight(x, z) + 0.6, z, 7, power * 0.6, null);
}

// Alien death: the creature's energy dissipates in its accent color.
export function alienDeath(x, y, z, type) {
  const color = energy[type] ?? defaultEnergy;
  const giant = type === 'trilobite';
  const gy = terrainHeight(x, z);
  const cy = Math.max(y - 0.4, gy + 0.4);
  const s = giant ? 1.9 : 1;
  vfxStats.alienBursts++;
  if (giant) {
    const t = now();
    markSetPiece(x, z, t);
    vfxStats.setPieces++;
    explosion(x, z, 1.6, 'shell');
    schedule(t + 0.3, x + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 2, 0.8, 'splash');
    burn(x, gy + 0.5, z, 5, 0.8, color);
  }
  // White-hot core + colored corona.
  reset(SHAPE.GLOW, ORIENT.BILLBOARD); rgb(C.white, 2.2);
  P.x = x; P.y = cy; P.z = z; P.life = 0.14; P.size0 = 0.7 * s; P.size1 = 1.6 * s;
  layers.emissive.emit(P);
  reset(SHAPE.GLOW, ORIENT.BILLBOARD); rgb(color, 2.4);
  P.x = x; P.y = cy; P.z = z; P.life = 0.4; P.size0 = 1.1 * s; P.size1 = 2.8 * s; P.a = 0.8;
  layers.emissive.emit(P);
  // Energy filaments flung outward, barely affected by gravity.
  for (let i = 0, n = count(giant ? 26 : 14); i < n; i++) {
    const a = rnd() * Math.PI * 2, el = (rnd() - 0.3) * 1.2, sp = (4 + rnd() * 7) * s;
    reset(SHAPE.STREAK, ORIENT.STREAK); rgb(color, 2.2);
    P.x = x; P.y = cy; P.z = z;
    P.vx = Math.cos(a) * Math.cos(el) * sp; P.vy = Math.sin(el) * sp + 1; P.vz = Math.sin(a) * Math.cos(el) * sp;
    P.drag = 3; P.gravity = 1.5; P.floor = gy + 0.05; P.life = 0.35 + rnd() * 0.4;
    P.size0 = 0.045; P.size1 = 0.7;
    layers.emissive.emit(P);
  }
  // Dissipating wisps drift upward and fade.
  for (let i = 0, n = count(giant ? 10 : 6); i < n; i++) {
    reset(SHAPE.GLOW, ORIENT.BILLBOARD); rgb(color, 1.3);
    P.x = x + (rnd() - 0.5) * 0.6 * s; P.y = cy + rnd() * 0.4; P.z = z + (rnd() - 0.5) * 0.6 * s;
    P.vx = (rnd() - 0.5) * 1.2; P.vy = 0.8 + rnd() * 1.6; P.vz = (rnd() - 0.5) * 1.2;
    P.drag = 1; P.life = 0.8 + rnd() * 0.8; P.size0 = 0.35 * s; P.size1 = 1.1 * s; P.a = 0.45; P.delay = rnd() * 0.1;
    layers.emissive.emit(P);
  }
  // Energy ring on the ground (additive inside the premultiplied ground layer).
  reset(SHAPE.RING + ADDITIVE, ORIENT.GROUND); rgb(color, 1.8);
  P.x = x; P.y = gy + 0.12; P.z = z; P.life = 0.45; P.size0 = 0.3; P.size1 = 3.2 * s; P.a = 0.8;
  layers.ground.emit(P);
  // A little dark residue smoke.
  for (let i = 0, n = count(3); i < n; i++) {
    reset(SHAPE.SMOKE, ORIENT.BILLBOARD); tmp.copy(C.smoke).lerp(color, 0.15); rgb(tmp, 0.8);
    P.x = x; P.y = cy; P.z = z; P.vx = (rnd() - 0.5); P.vy = 1 + rnd(); P.vz = (rnd() - 0.5);
    P.drag = 0.8; P.gravity = -0.3; P.life = 1.4 + rnd(); P.size0 = 0.4 * s; P.size1 = 1.4 * s; P.a = 0.4; P.delay = 0.05;
    layers.volume.emit(P);
  }
  flashLight(x, cy + 0.6, z, color, (giant ? 40 : 14), giant ? 14 : 7, giant ? 0.4 : 0.22, giant ? 3 : 1);
}

// Friendly infantry casualty: a small dust kick and a few sparks.
export function soldierDown(x, z) {
  const gy = terrainHeight(x, z);
  for (let i = 0, n = count(3); i < n; i++) {
    reset(SHAPE.SMOKE, ORIENT.BILLBOARD); rgb(C.dust);
    P.x = x + (rnd() - 0.5) * 0.4; P.y = gy + 0.25; P.z = z + (rnd() - 0.5) * 0.4;
    P.vx = (rnd() - 0.5) * 1.4; P.vy = 0.4 + rnd() * 0.5; P.vz = (rnd() - 0.5) * 1.4;
    P.drag = 2; P.life = 1 + rnd() * 0.5; P.size0 = 0.2; P.size1 = 0.8; P.a = 0.35;
    layers.volume.emit(P);
  }
}

// --- Impacts -----------------------------------------------------------------
// cover: dust puff + grit; unit hit: sparks (friendly armor) or energy splash (aliens).
export function impact(x, y, z, dx, dy, dz, cover, targetTeam) {
  vfxStats.impacts++;
  const l = lod(x, y, z) * PERFORMANCE.vfxParticleScale;
  const len = Math.hypot(dx, dy, dz) || 1;
  const bx = -dx / len, by = -dy / len, bz = -dz / len; // bounce back toward the shooter
  if (cover) {
    reset(SHAPE.SMOKE, ORIENT.BILLBOARD); rgb(C.dust, 1.05);
    P.x = x; P.y = y; P.z = z; P.vx = bx * 0.8; P.vy = 0.5; P.vz = bz * 0.8;
    P.drag = 2.5; P.life = 0.7 + rnd() * 0.4; P.size0 = 0.12; P.size1 = 0.55; P.a = 0.45;
    layers.volume.emit(P);
    if (l > 0.5) {
      for (let i = 0; i < 3; i++) {
        reset(SHAPE.CHUNK, ORIENT.BILLBOARD); rgb(C.debris, 1.3);
        P.x = x; P.y = y; P.z = z;
        P.vx = bx * 2 + (rnd() - 0.5) * 2.5; P.vy = 1.5 + rnd() * 2; P.vz = bz * 2 + (rnd() - 0.5) * 2.5;
        P.gravity = 14; P.floor = terrainHeight(x, z) + 0.02; P.life = 0.6 + rnd() * 0.3; P.size0 = P.size1 = 0.03 + rnd() * 0.03;
        layers.volume.emit(P);
      }
    }
    reset(SHAPE.GLOW, ORIENT.BILLBOARD); rgb(C.spark, 1.2);
    P.x = x; P.y = y; P.z = z; P.life = 0.06; P.size0 = 0.18; P.size1 = 0.3; P.a = 0.8;
    layers.emissive.emit(P);
    return;
  }
  const alien = targetTeam === 'enemy';
  const color = alien ? C.enemyHit : C.friendlyHit;
  reset(SHAPE.GLOW, ORIENT.BILLBOARD); rgb(color, 2);
  P.x = x; P.y = y; P.z = z; P.life = alien ? 0.12 : 0.08; P.size0 = 0.22; P.size1 = alien ? 0.55 : 0.4;
  layers.emissive.emit(P);
  const n = Math.max(1, Math.round((alien ? 4 : 5) * l));
  for (let i = 0; i < n; i++) {
    reset(SHAPE.STREAK, ORIENT.STREAK); rgb(alien ? color : C.spark, 1.8);
    const s = alien ? 2.5 + rnd() * 3 : 4 + rnd() * 5;
    P.x = x; P.y = y; P.z = z;
    P.vx = (bx + (rnd() - 0.5) * 1.4) * s; P.vy = (by + 0.4 + rnd() * 0.8) * s; P.vz = (bz + (rnd() - 0.5) * 1.4) * s;
    P.gravity = alien ? 3 : 10; P.drag = alien ? 2.5 : 0.8; P.floor = terrainHeight(x, z) + 0.02;
    P.life = 0.18 + rnd() * 0.18; P.size0 = 0.02; P.size1 = 0.22;
    layers.emissive.emit(P);
  }
}

// --- Muzzle flashes ----------------------------------------------------------
// heavy: tank / artillery / tower cannon; player: the possessed unit's weapon.
export function muzzleFlash(x, y, z, dx, dy, dz, heavy = false, player = false, frost = false) {
  vfxStats.muzzleFlashes++;
  const len = Math.hypot(dx, dy, dz) || 1;
  const fx = dx / len, fy = dy / len, fz = dz / len;
  const color = frost ? C.muzzleCold : C.muzzle;
  const s = heavy ? 2.6 : player ? 1.25 : 1;
  reset(SHAPE.STAR, ORIENT.BILLBOARD); rgb(color, 2);
  P.x = x + fx * 0.06 * s; P.y = y + fy * 0.06 * s; P.z = z + fz * 0.06 * s;
  P.life = heavy ? 0.09 : 0.055; P.size0 = (0.2 + rnd() * 0.08) * s; P.size1 = P.size0 * 0.8;
  layers.emissive.emit(P);
  // Forward flame tongue: a short streak along the barrel axis.
  reset(SHAPE.STREAK, ORIENT.STREAK); rgb(color, 2.2);
  P.x = x + fx * 0.32 * s; P.y = y + fy * 0.32 * s; P.z = z + fz * 0.32 * s;
  P.vx = fx * 2; P.vy = fy * 2; P.vz = fz * 2; P.drag = 20;
  P.life = heavy ? 0.08 : 0.05; P.size0 = 0.07 * s; P.size1 = 0.28 * s;
  layers.emissive.emit(P);
  if (heavy || player) {
    flashLight(x + fx * 0.3, y + fy * 0.3, z + fz * 0.3, color, heavy ? 24 : 7, heavy ? 9 : 5, heavy ? 0.1 : 0.06, heavy ? 1.5 : 0.8);
  }
  if (heavy || (player && lod(x, y, z) > 0.5)) {
    for (let i = 0, n = heavy ? count(4) : 1; i < n; i++) {
      reset(SHAPE.SMOKE, ORIENT.BILLBOARD); rgb(C.dust, 1.1);
      P.x = x + fx * 0.4 * s; P.y = y + fy * 0.4 * s; P.z = z + fz * 0.4 * s;
      P.vx = fx * (1.5 + rnd() * 2) * s; P.vy = 0.4 + fy * 2 + rnd() * 0.4; P.vz = fz * (1.5 + rnd() * 2) * s;
      P.drag = 2.6; P.gravity = -0.3; P.life = 0.7 + rnd() * 0.6 * s; P.size0 = 0.12 * s; P.size1 = 0.6 * s; P.a = 0.28;
      layers.volume.emit(P);
    }
  }
}

// Night illumination flare: exhaust trail while rising, then smoke + dripping sparks.
const flareColor = new THREE.Color('#fff1b8');
export function flareTrail(x, y, z, burning) {
  reset(SHAPE.SMOKE, ORIENT.BILLBOARD); rgb(C.dust, burning ? 0.55 : 0.8);
  P.x = x; P.y = y + (burning ? 0.5 : -0.3); P.z = z; P.vx = 0.4; P.vy = burning ? 0.3 : -0.5; P.vz = 0.1;
  P.drag = 0.4; P.life = burning ? 3 : 1.6; P.size0 = burning ? 0.5 : 0.25; P.size1 = burning ? 2.6 : 1.1; P.a = burning ? 0.22 : 0.3;
  layers.volume.emit(P);
  if (!burning) return;
  reset(SHAPE.STREAK, ORIENT.STREAK); rgb(flareColor, 2);
  P.x = x; P.y = y - 0.2; P.z = z; P.vx = (rnd() - 0.5) * 1.5; P.vy = -1 - rnd(); P.vz = (rnd() - 0.5) * 1.5;
  P.gravity = 6; P.drag = 0.3; P.life = 0.9 + rnd() * 0.6; P.size0 = 0.05; P.size1 = 0.35;
  layers.emissive.emit(P);
}

// --- Persistent emitters -----------------------------------------------------
export function burn(x, y, z, life, power, energyColor) {
  let slot = burners.find(b => !b.active);
  if (!slot) { slot = burners[0]; for (const b of burners) if (b.life - b.age < slot.life - slot.age) slot = b; }
  Object.assign(slot, { active: true, x, y, z, age: 0, life, fire: 0, smoke: 0, power, energy: energyColor });
}
function schedule(at, x, z, power, style) {
  const slot = delayed.find(d => !d.active);
  if (!slot) return;
  slot.active = true; slot.at = at; slot.x = x; slot.z = z; slot.power = power; slot.style = style;
}

// Called once per (unpaused) frame by VfxSystem after the clock advanced.
export function updateEmitters(dt) {
  const t = now();
  for (const d of delayed) if (d.active && t >= d.at) { d.active = false; explosion(d.x, d.z, d.power, d.style); }
  let active = 0;
  const scale = PERFORMANCE.vfxParticleScale;
  for (const b of burners) {
    if (!b.active) continue;
    b.age += dt;
    if (b.age >= b.life) { b.active = false; continue; }
    active++;
    const strength = 1 - b.age / b.life;
    b.fire -= dt; b.smoke -= dt;
    if (b.fire <= 0) {
      b.fire = 0.07 / Math.max(0.3, scale);
      reset(SHAPE.FIRE, ORIENT.BILLBOARD);
      if (b.energy) rgb(b.energy, 1.4); else rgb(C.fire, 1.1);
      P.x = b.x + (rnd() - 0.5) * 0.8 * b.power; P.y = b.y; P.z = b.z + (rnd() - 0.5) * 0.8 * b.power;
      P.vx = (rnd() - 0.5) * 0.4; P.vy = 1.6 + rnd() * 1.4; P.vz = (rnd() - 0.5) * 0.4;
      P.drag = 1.2; P.gravity = -1; P.life = 0.45 + rnd() * 0.35;
      P.size0 = 0.35 * b.power * (0.5 + strength * 0.5); P.size1 = 0.9 * b.power * (0.5 + strength * 0.5);
      layers.emissive.emit(P);
    }
    if (b.smoke <= 0) {
      b.smoke = 0.16 / Math.max(0.3, scale);
      reset(SHAPE.SMOKE, ORIENT.BILLBOARD);
      tmp.copy(C.smoke).multiplyScalar(0.7); rgb(tmp);
      P.x = b.x + (rnd() - 0.5) * 0.5; P.y = b.y + 0.6; P.z = b.z + (rnd() - 0.5) * 0.5;
      P.vx = 0.5 + (rnd() - 0.5) * 0.4; P.vy = 2 + rnd() * 1.2; P.vz = (rnd() - 0.5) * 0.4;
      P.drag = 0.35; P.gravity = -0.25; P.life = 3.5 + rnd() * 2; P.size0 = 0.6 * b.power; P.size1 = 3 * b.power; P.a = 0.45 * strength + 0.1;
      layers.volume.emit(P);
    }
  }
  vfxStats.burners = active;
}

export function clearEffects() {
  for (const layer of Object.values(layers)) layer.clear();
  for (const b of burners) b.active = false;
  for (const d of delayed) d.active = false;
  for (const s of lightSlots) { s.age = 1; s.duration = 0; s.peak = 0; }
  markSetPiece(1e9, 1e9, -1e9);
}
