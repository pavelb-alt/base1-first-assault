// ============================================================================
// PROJECT-WIDE CONSTANTS — edit these to tune the battlefield
// ============================================================================

export const ART_STYLE = 'clean sci-fi greybox, neutral tones with faction accents';
export const GAME_PERSPECTIVE = 'top-down';

// --- Map dimensions ---------------------------------------------------------
export const MAP = {
  SIZE: 80,
  HALF: 40,
  GROUND_COLOR: '#b4bdca',
  LANE_WIDTH: 5,
};

// --- Base positions (opposite corners) --------------------------------------
// Friendly = bottom-left,  Enemy = top-right  (in XZ plane, -Z is "north")
export const BASES = {
  friendly: {
    position: [-36, 0, 36],
    color: '#22c55e',
    accentColor: '#16a34a',
    label: 'FRIENDLY',
  },
  enemy: {
    position: [36, 0, -36],
    color: '#ef4444',
    accentColor: '#dc2626',
    label: 'ENEMY',
  },
};

// --- Lane waypoints (friendly → enemy) --------------------------------------
// Top lane: up the left side, across the top
// Mid lane: straight diagonal
// Bot lane: across the bottom, up the right side
export const LANES = {
  top: {
    name: 'TOP',
    waypoints: [
      [-36, 0, 36], [-36, 0, 12], [-36, 0, -12], [-36, 0, -36],
      [-12, 0, -36], [12, 0, -36], [36, 0, -36],
    ],
    color: '#3b82f6',
  },
  mid: {
    name: 'MID',
    waypoints: [
      [-36, 0, 36], [-24, 0, 24], [-12, 0, 12], [0, 0, 0],
      [12, 0, -12], [24, 0, -24], [36, 0, -36],
    ],
    color: '#f59e0b',
  },
  bot: {
    name: 'BOT',
    waypoints: [
      [-36, 0, 36], [-12, 0, 36], [12, 0, 36], [36, 0, 36],
      [36, 0, 12], [36, 0, -12], [36, 0, -36],
    ],
    color: '#a855f7',
  },
};

// --- Obstacles between lanes (raised terrain blocks) ------------------------
// Central scatter blocks REMOVED — they blocked the mid-lane corridor.
export const OBSTACLES = [
  // Between top & mid (upper-left quadrant)
  { pos: [-24, 0.75, -8], size: [3, 1.5, 4] },
  { pos: [-16, 0.75, -20], size: [4, 1.5, 3] },
  { pos: [-28, 1.0, 4], size: [2, 2, 3] },
  // Between mid & bot (lower-right quadrant)
  { pos: [24, 0.75, 8], size: [3, 1.5, 4] },
  { pos: [16, 0.75, 20], size: [4, 1.5, 3] },
  { pos: [28, 1.0, -4], size: [2, 2, 3] },
];

// --- Soldier config ---------------------------------------------------------
export const SOLDIER = {
  modelUrl: 'https://media.base44.com/files/public/6aad7caf1cfd574f0bf92f13/affec41bd_8994d7574_orange-guardian-animated-jumps.glb',
  spawnPosition: [-35, 0, 35],
  scale: 0.3, // RobotExpressive is ~6 units natively; scale to ~1.8 to match collider
  moveSpeed: 8,
  jumpForce: 9,
  maxJumps: 2,            // ground jump + 1 air jump (double jump)
  colliderHalfHeight: 0.5,
  colliderRadius: 0.4,
  colliderY: 0.9,
  groundThreshold: 0.35,  // body Y below this + low vertical velocity = grounded
  initialFacing: (3 * Math.PI) / 4, // model faces +Z; rotate to face enemy base
};

// --- NPC config -------------------------------------------------------------
export const NPCS = {
  spawnInterval: 6,        // seconds between spawns per lane
  maxPerLane: 3,           // max concurrent NPCs per lane
  moveSpeed: 3,
  maxHealth: 100,
  damage: 10,
  attackRange: 2,
  attackCooldown: 1.5,
  enemyColor: '#ef4444',
  friendlyColor: '#22c55e',
  enemySpawn: [36, 0, -36],
  friendlySpawn: [-36, 0, 36],
  eyeDroneChance: 0.3,    // probability of spawning EyeDrone vs QuadShell
};

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
    scale: 1.2,            // commander is larger
    hoverHeight: 0,        // ground unit
    colliderHalfHeight: 0.5,
    colliderRadius: 0.4,
    colliderY: 1.0,
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
  perLane: 3,            // soldiers per lane per wave (9 total across 3 lanes)
  maxAlive: 30,          // cap on living friendly soldiers (including possessed)
  moveSpeed: 3,          // AI movement speed (matches NPCS.moveSpeed)
  staggerOffset: 1.5,    // perpendicular offset between soldiers in a lane
};

// --- Camera config ----------------------------------------------------------
export const CAMERA = {
  strategic: {
    initialTarget: [0, 0, 0],
    initialDistance: 80,
    minDistance: 30,
    maxDistance: 130,
    angle: Math.PI / 3.2, // pitch from horizontal
    panSpeed: 50,
  },
  thirdPerson: {
    distance: 7,
    height: 2.5,
    minPitch: 0.15,
    maxPitch: 1.3,
    initialPitch: 0.4,
    mouseSensitivity: 0.0022,
  },
};