// ============================================================================
// PROJECT-WIDE CONSTANTS — edit these to tune the battlefield
// ============================================================================

export const ART_STYLE = 'stylized low-poly sci-fi battlefield, muted earth and sand, restrained faction accents';
export const GAME_PERSPECTIVE = 'top-down';

// Rendering only: simulation, spawn budgets and weapon timing are unchanged.
export const PERFORMANCE = {
  maxDpr: 1.25,
  nearAnimationDistance: 55,
  nearAnimationHz: 30,
  farAnimationHz: 15,
  unitShadowDistance: 65,
};

// --- Map dimensions ---------------------------------------------------------
export const MAP = {
  SIZE: 150,
  HALF: 75,
  GROUND_COLOR: '#a99b7f',
};

// Visual-only dressing. Independent of combat RNG and unchanged by battle resets.
export const DRESSING = {
  seed: 4173, textureSize: 2048, perimeterSize: 520,
  sand: '#b6a689', earth: '#938772', olive: '#85886a', worn: '#c0b194',
  scorch: '#5d5850', rock: '#79776b', steel: '#646d69', rust: '#887663',
  friendly: '#cf8140', friendlyAccent: '#a96736', enemy: '#b34c43', enemyAccent: '#843b37',
};

// --- Base positions (opposite corners) --------------------------------------
// Friendly advances along -Z; enemies advance +Z. Fronts run across X.
export const BASES = {
  friendly: {
    position: [0, 0, 67.5],
    color: '#22c55e',
    accentColor: '#16a34a',
    label: 'FRIENDLY',
  },
  enemy: {
    position: [0, 0, -67.5],
    color: '#ef4444',
    accentColor: '#dc2626',
    label: 'ENEMY',
  },
};

// Broad allocation regions, not movement corridors or waypoint lanes.
export const SECTORS = [
  { name: 'WEST', minX: -67.5, maxX: -22.5 },
  { name: 'CENTER', minX: -22.5, maxX: 22.5 },
  { name: 'EAST', minX: 22.5, maxX: 67.5 },
];
export const FRONT = {
  friendlyForward: -1, enemyForward: 1,
  rows: [45, 22.5, 0, -22.5, -45],
  sectionCenters: [-56.25, -33.75, -11.25, 11.25, 33.75, 56.25],
  crossings: [-67.5, -45, -22.5, 0, 22.5, 45, 67.5],
  sectionWidth: 22.5, slotsPerSection: 9,
  // Existing Orange Guardian measures ~0.726m at scale 0.3 (hand: 0.324m, head: 0.488m).
  // 0.46m floor-to-lip cover protects the torso; the 2.2m aisle fits two 0.8m capsules.
  depth: 0.4, firingFloor: -0.025, halfWidth: 2.4,
  floorFront: -0.1, floorRear: 2.1, stepRear: -1.1, firingZ: -1.75, spineZ: 1,
  zigLength: 3.75, zigAmplitude: 0.55,
  rampReach: 6.8, rampHalfWidth: 1.6, rampShoulder: 0.6,
  crossingHalfWidth: 1.8, crossingSlope: 1.5,
  stationInner: 2.75, stationSpacing: 1.2,
  parapetHeight: 0.06, edgeThickness: 0.18, spawnZ: 63.75,
  earthColors: { wall: '#806148', floor: '#514437', step: '#a58a64', ramp: '#99754f', edge: '#665443' },
  clearDelay: 1.5, resistanceRadius: 10, maxHoldTime: 8,
  jumpDuration: 1.3, jumpStart: -7, jumpEnd: 11,
  gravity: 20, spatialCell: 24, spatialInterval: 0.1,
};

// --- Soldier config ---------------------------------------------------------
export const SOLDIER = {
  modelUrl: 'https://media.base44.com/files/public/6aad7caf1cfd574f0bf92f13/affec41bd_8994d7574_orange-guardian-animated-jumps.glb',
  spawnPosition: [0, 0, FRONT.spawnZ],
  scale: 0.3, // Existing Orange Guardian rest height: 2.42 native units, ~0.726 in world space
  moveSpeed: 8,
  jumpForce: 9,
  maxJumps: 2,            // ground jump + 1 air jump (double jump)
  colliderHalfHeight: 0.5,
  colliderRadius: 0.4,
  colliderY: 0.9,
  groundThreshold: 0.35,  // body Y below this + low vertical velocity = grounded
  initialFacing: Math.PI, // model faces +Z; friendly advance is -Z
  animAttack: 'Attack',
};

// --- NPC config -------------------------------------------------------------
// One source for wave budgets, formations and per-type combat tuning.
export const BALANCE = {
  // Half the population and regular reinforcement volume; timing/stats unchanged.
  friendly: { interval: 8, perSector: 4, maxPerSector: 24, maxAlive: 72 },
  enemy: { interval: 14, maxPerSector: 24, maxAlive: 72, spawnScale: 1,
    squad: ['quadshell', 'quadshell', 'quadshell', 'quadshell', 'eyedrone'],
    trilobiteInterval: 30 },
  formation: { spacing: 1.6, rowSpacing: 2, departure: 5, cohesionDistance: 7, catchupSpeed: 3.3 },
  moveSpeed: 3,
  units: {
    soldier:  { health: 120, damage: 7, cooldown: 0.125, range: 15, aiSpread: 0.05 },
    quadshell:{ health: 120, damage: 7, cooldown: 0.125, range: 14, aiSpread: 0.05 },
    eyedrone: { health: 100, damage: 6, cooldown: 0.125, range: 17, aiSpread: 0.05 },
    trilobite:{ health: 320, damage: 14, cooldown: 0.25, range: 13, aiSpread: 0.05 },
  },
  // 216 units * 8 rounds/sec * 3 seconds, rounded up. Separate team pools
  // prevent update order from starving one faction's shots.
  projectilePoolPerTeam: 2816, // maximum lifetime budget plus one synchronized volley
  targetScanInterval: 0.2,
};
export const NPCS = { spawnInterval: BALANCE.enemy.interval, maxPerSector: BALANCE.enemy.maxPerSector, moveSpeed: BALANCE.moveSpeed };

// --- Enemy model types -----------------------------------------------------
export const ENEMY_TYPES = {
  quadshell: {
    modelUrl: 'https://media.base44.com/files/public/6aad7caf1cfd574f0bf92f13/c36cd53cd_48bb754a2_Enemy_QuadShell.glb',
    scale: 1,
    hoverHeight: 0,        // ground unit
    colliderHalfHeight: 0.4,
    colliderRadius: 0.35,
    colliderY: 0.9,
    facingOffset: 0,
    animIdle: 'Idle',
    animMove: 'Walk',
    animRun: 'Run',
    animAttack: 'Attack',
  },
  eyedrone: {
    modelUrl: 'https://media.base44.com/files/public/6aad7caf1cfd574f0bf92f13/81e26c82f_108af050f_Enemy_EyeDrone.glb',
    scale: 1,
    hoverHeight: 3,        // flying unit
    colliderHalfHeight: 0.3,
    colliderRadius: 0.3,
    colliderY: 0.6,
    facingOffset: 0,
    animIdle: 'Idle',
    animMove: 'Idle',      // no Walk/Run clip — hovers
    animAttack: 'Attack',
  },
  trilobite: {
    modelUrl: 'https://media.base44.com/files/public/6aad7caf1cfd574f0bf92f13/257cba8bf_6d96b7d31_Enemy_Trilobite.glb',
    scale: 1.8,            // durable giant; collider scales with its model
    hoverHeight: 0,
    colliderHalfHeight: 0.75,
    colliderRadius: 0.6,
    colliderY: 1.5,
    facingOffset: 0,
    animIdle: 'Idle',
    animMove: 'Walk',
    animRun: 'Run',
    animAttack: 'Attack',
    animAttackAlt: 'AttackAuto',
  },
};

// --- Friendly soldier wave config ------------------------------------------
export const FRIENDLY = {
  perSector: BALANCE.friendly.perSector,
  spawnInterval: BALANCE.friendly.interval,
  maxAlive: BALANCE.friendly.maxAlive,
  moveSpeed: BALANCE.moveSpeed,
  staggerOffset: BALANCE.formation.spacing,
};

// --- Combat config ----------------------------------------------------------
export const COMBAT = {
  attackRange: BALANCE.units.soldier.range,
  attackCooldown: BALANCE.units.soldier.cooldown,
  projectileSpeed: 20,      // units per second (unchanged)
  projectileDamage: BALANCE.units.soldier.damage,
  maxHealth: BALANCE.units.soldier.health, // preserves the possessed-unit HUD
  projectileLifetime: 3,    // max seconds a projectile exists
};

// --- Base destruction -------------------------------------------------------
export const BASE = {
  health: 100,
  breachDamage: 10,
  breachRadius: 6, // distance from base center to count as a breach
};

// Golden-hour art direction; visual only, no gameplay tuning.
export const CINEMATIC = {
  sky: '#819cae', horizon: '#ddbc91', sun: '#ffd39b',
  sunPosition: [-110, 65, -95], sunIntensity: 2.8,
  fogNear: 150, fogFar: 460,
  smokeLife: 4.6, fireLife: 0.55, dustLife: 2.4,
  smokeCapacity: 192, fireCapacity: 48, debrisCapacity: 160,
};

// --- Ambient battlefield explosions (visual only, no gameplay effect) ------
export const EXPLOSIONS = {
  minInterval: 1, maxInterval: 2.5,
  areaX: MAP.HALF * 0.85, areaZMin: -50, areaZMax: 50,
  flashColor: '#ffdd88', smokeColor: '#5c564c', debrisColor: '#3f3a33', dirtColor: '#7a6a4f',
  flashLife: 0.18, smokeLife: 1.6, debrisLife: 0.9,
  flashCapacity: 8, smokeCapacity: 24, debrisCapacity: 64,
};

// --- Cargo ship delivery (friendly reinforcements) ---------------------------
export const CARGO_SHIP = {
  modelUrl: 'https://media.base44.com/files/public/6aad7caf1cfd574f0bf92f13/50fa421c8_141c71ee3_craft_cargoA.glb',
  targetLength: 5,       // ~7 soldier heights long
  maxShips: 3,           // simultaneous in-flight ships
  maxPending: 6,         // queued deliveries cap; oldest dropped if exceeded
  approachSpeed: 25,    // units/sec horizontal flight
  descentSpeed: 12,     // units/sec vertical descent
  takeoffSpeed: 20,    // units/sec departure
  landingPause: 2.5,   // seconds on ground unloading
  cruiseAltitude: 35,  // approach/departure flight height
  soldierSpacing: 1.5, // lateral spacing between spawned soldiers
  soldierOffset: 4,    // X offset from ship center for soldier spawn line
  landingZones: [
    { id: 0, x: -45, z: 56 },
    { id: 1, x: -15, z: 58 },
    { id: 2, x:  15, z: 58 },
    { id: 3, x:  45, z: 56 },
  ],
};

// --- Camera config ----------------------------------------------------------
export const CAMERA = {
  strategic: {
    initialTarget: [0, 0, 11.25],
    initialDistance: 90,
    minDistance: 25,
    maxDistance: 243.75,
    angle: Math.PI / 3.2, // pitch from horizontal
    panSpeed: 75,
  },
  thirdPerson: {
    distance: 4.5,
    height: 1.8,
    shoulder: 0.55, // screen-right offset; existing model/movement forward is +Z
    minPitch: -0.85,
    maxPitch: 1.3,
    initialPitch: 0.4,
    mouseSensitivity: 0.0022,
  },
  ads: {
    distance: 3.2,       // closer camera for precision aiming
    height: 1.8,         // lower eye line when aiming
    shoulder: 0.15,      // tighter shoulder offset
    fov: 45,             // narrower field of view
    sensitivityMult: 0.5, // reduced mouse sensitivity while aiming
  },
};