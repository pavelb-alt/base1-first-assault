// ============================================================================
// PROJECT-WIDE CONSTANTS — edit these to tune the battlefield
// ============================================================================

export const ART_STYLE = 'clean sci-fi greybox, neutral tones with faction accents';
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
  SIZE: 300,
  HALF: 150,
  GROUND_COLOR: '#b4bdca',
};

// --- Base positions (opposite corners) --------------------------------------
// Friendly advances along -Z; enemies advance +Z. Fronts run across X.
export const BASES = {
  friendly: {
    position: [0, 0, 135],
    color: '#22c55e',
    accentColor: '#16a34a',
    label: 'FRIENDLY',
  },
  enemy: {
    position: [0, 0, -135],
    color: '#ef4444',
    accentColor: '#dc2626',
    label: 'ENEMY',
  },
};

// Broad allocation regions, not movement corridors or waypoint lanes.
export const SECTORS = [
  { name: 'WEST', minX: -135, maxX: -45 },
  { name: 'CENTER', minX: -45, maxX: 45 },
  { name: 'EAST', minX: 45, maxX: 135 },
];
export const FRONT = {
  friendlyForward: -1, enemyForward: 1,
  rows: [90, 45, 0, -45, -90],
  sectionCenters: [-112.5, -67.5, -22.5, 22.5, 67.5, 112.5],
  crossings: [-135, -90, -45, 0, 45, 90, 135],
  sectionWidth: 45, slotsPerSection: 18,
  depth: 1.6, firingFloor: -0.15, halfWidth: 1.8,
  rampReach: 4, crossingHalfWidth: 2.5, crossingSlope: 3,
  parapetHeight: 0.5, spawnZ: 127.5,
  clearDelay: 8, resistanceRadius: 42,
  jumpDuration: 1.3, jumpStart: -7, jumpEnd: 11,
  gravity: 20, spatialCell: 24, spatialInterval: 0.1,
  zigzagPeriod: 20, zigzagAmplitude: 1.0,
};

// --- Soldier config ---------------------------------------------------------
export const SOLDIER = {
  modelUrl: 'https://media.base44.com/files/public/6aad7caf1cfd574f0bf92f13/affec41bd_8994d7574_orange-guardian-animated-jumps.glb',
  spawnPosition: [0, 0, FRONT.spawnZ],
  scale: 0.3, // RobotExpressive is ~6 units natively; scale to ~1.8 to match collider
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
  // Preserve timing, combat profiles and total population. Three complete squads.
  friendly: { interval: 8, perSector: 8, maxPerSector: 48, maxAlive: 144 },
  enemy: { interval: 9, maxPerSector: 36, maxAlive: 108,
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

// --- Camera config ----------------------------------------------------------
export const CAMERA = {
  strategic: {
    initialTarget: [0, 0, 22.5],
    initialDistance: 322.5,
    minDistance: 25,
    maxDistance: 487.5,
    angle: Math.PI / 3.2, // pitch from horizontal
    panSpeed: 75,
  },
  thirdPerson: {
    distance: 7,
    height: 2.5,
    shoulder: 0.55, // screen-right offset; existing model/movement forward is +Z
    minPitch: -0.85,
    maxPitch: 1.3,
    initialPitch: 0.4,
    mouseSensitivity: 0.0022,
  },
};