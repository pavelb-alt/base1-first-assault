// ============================================================================
// PROJECT-WIDE CONSTANTS — edit these to tune the battlefield
// ============================================================================

export const ART_STYLE = 'clean sci-fi greybox, neutral tones with faction accents';
export const GAME_PERSPECTIVE = 'top-down';

// --- Map dimensions ---------------------------------------------------------
export const MAP = {
  SIZE: 40,
  HALF: 20,
  GROUND_COLOR: '#1a1f2e',
  LANE_WIDTH: 3,
};

// --- Base positions (opposite corners) --------------------------------------
// Friendly = bottom-left,  Enemy = top-right  (in XZ plane, -Z is "north")
export const BASES = {
  friendly: {
    position: [-18, 0, 18],
    color: '#22c55e',
    accentColor: '#16a34a',
    label: 'FRIENDLY',
  },
  enemy: {
    position: [18, 0, -18],
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
      [-18, 0, 18], [-18, 0, 6], [-18, 0, -6], [-18, 0, -18],
      [-6, 0, -18], [6, 0, -18], [18, 0, -18],
    ],
    color: '#3b82f6',
  },
  mid: {
    name: 'MID',
    waypoints: [
      [-18, 0, 18], [-12, 0, 12], [-6, 0, 6], [0, 0, 0],
      [6, 0, -6], [12, 0, -12], [18, 0, -18],
    ],
    color: '#f59e0b',
  },
  bot: {
    name: 'BOT',
    waypoints: [
      [-18, 0, 18], [-6, 0, 18], [6, 0, 18], [18, 0, 18],
      [18, 0, 6], [18, 0, -6], [18, 0, -18],
    ],
    color: '#a855f7',
  },
};

// --- Obstacles between lanes (raised terrain blocks) ------------------------
export const OBSTACLES = [
  // Between top & mid (upper-left quadrant)
  { pos: [-12, 0.75, -4], size: [3, 1.5, 4] },
  { pos: [-8, 0.75, -10], size: [4, 1.5, 3] },
  { pos: [-14, 1.0, 2], size: [2, 2, 3] },
  // Between mid & bot (lower-right quadrant)
  { pos: [12, 0.75, 4], size: [3, 1.5, 4] },
  { pos: [8, 0.75, 10], size: [4, 1.5, 3] },
  { pos: [14, 1.0, -2], size: [2, 2, 3] },
  // Central scatter
  { pos: [-4, 0.5, 4], size: [2, 1, 2] },
  { pos: [4, 0.5, -4], size: [2, 1, 2] },
];

// --- Soldier config ---------------------------------------------------------
export const SOLDIER = {
  modelUrl: 'https://base44.app/api/apps/6a6060c7f9e002982672084c/files/mp/public/6a6060c7f9e002982672084c/ae76acb3d_RobotExpressive.glb',
  spawnPosition: [-17, 0, 17],
  scale: 1.0,
  moveSpeed: 8,
  colliderHalfHeight: 0.5,
  colliderRadius: 0.4,
  colliderY: 0.9,
  initialFacing: Math.PI / 4, // faces toward enemy base
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
  enemySpawn: [18, 0, -18],
  friendlySpawn: [-18, 0, 18],
};

// --- Camera config ----------------------------------------------------------
export const CAMERA = {
  strategic: {
    initialTarget: [0, 0, 0],
    initialDistance: 42,
    minDistance: 18,
    maxDistance: 65,
    angle: Math.PI / 3.2, // pitch from horizontal
    panSpeed: 30,
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