// ============================================================================
// PROJECT-WIDE CONSTANTS — edit these to tune the battlefield
// ============================================================================

export const ART_STYLE = 'stylized low-poly sci-fi battlefield, muted earth and sand, restrained faction accents';
export const GAME_PERSPECTIVE = 'top-down';

// Rendering only: simulation, spawn budgets and weapon timing are unchanged.
export const PERFORMANCE = {
  minDpr: 0.6, maxDpr: 0.85,
  shadows: false,
  antialias: false,
  targetFps: 45,
  nearAnimationDistance: 35,
  nearAnimationHz: 20,
  farAnimationHz: 8,
  unitShadowDistance: 0,
  minimapHz: 10,
  ambientParticleScale: 0.3,
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
  // Two mirrored WWI systems: rear/artillery, support, then front line.
  // The 28m center gap is No Man's Land rather than another trench.
  rows: [44, 30, 14],
  sectionCenters: [-56.25, -33.75, -11.25, 11.25, 33.75, 56.25],
  crossings: [-67.5, -45, -22.5, 0, 22.5, 45, 67.5],
  sectionWidth: 22.5, slotsPerSection: 9,
  // Existing Orange Guardian measures ~0.726m at scale 0.3 (hand: 0.324m, head: 0.488m).
  // 0.46m floor-to-lip cover protects the torso; the 2.2m aisle fits two 0.8m capsules.
  depth: 0.8, firingFloor: -0.025, halfWidth: 2.4,
  floorFront: -0.1, floorRear: 2.1, stepRear: -1.1, firingZ: -1.75, spineZ: 1,
  mainRow: 2,
  rowProfiles: [
    { role: 'artillery', halfWidth: 1.85, depth: 0.6, zigAmplitude: 0.45 },
    { role: 'support', halfWidth: 2.15, depth: 0.75, zigAmplitude: 0.75 },
    { role: 'front', halfWidth: 3.15, depth: 1.15, zigAmplitude: 1.35 },
  ],
  communicationWidth: 1.35,
  zigLength: 7.5, zigAmplitude: 0.55,
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
  get moveSpeed() { return BALANCE.moveSpeed; }, // possessed and AI soldiers share one speed
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
    startDelay: 13, // seconds before the first enemy wave fires
    squad: ['quadshell', 'quadshell', 'quadshell', 'quadshell', 'eyedrone'],
    trilobiteInterval: 30 },
  formation: { spacing: 1.6, rowSpacing: 2, departure: 5, cohesionDistance: 7, catchupSpeed: 3.3 },
  moveSpeed: 3,
  units: {
    soldier:  { health: 120, damage: 7, cooldown: 0.125, range: 15, aiSpread: 0.05 },
    quadshell:{ health: 120, damage: 7, cooldown: 0.125, range: 14, aiSpread: 0.05 },
    eyedrone: { health: 100, damage: 6, cooldown: 0.125, range: 17, aiSpread: 0.05 },
    trilobite:{ health: 320, damage: 14, cooldown: 0.25, range: 13, aiSpread: 0.05 },
    tank:     { health: 800, damage: 20, cooldown: 2, range: 18, aiSpread: 0.03 },
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
  sky: '#9eb9ca', horizon: '#ead2ae', sun: '#fff0ce',
  sunPosition: [-50, 80, 140], sunIntensity: 3.6,
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
  maxShips: 4,           // simultaneous in-flight ships
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

// --- Sky battle (aerial combat, visual only, no ground interaction) ----------
export const SKY_BATTLE = {
  maxShips: 26,             // 13 per side
  maxBolts: 120,            // pooled, capped
  maxExplosions: 28,
  maxSmoke: 200,            // crash smoke-trail puffs, pooled
  shipScale: 3.5,           // larger silhouettes stay readable during night dogfights
  altitudeBands: [18, 22, 26, 30, 40, 44, 48, 52, 24, 46, 20, 50, 28], // avoids cargo cruise altitude (35)
  bound: 115,               // soft airspace boundary; fighters turn inward before reaching it
  flight: {
    modelForwardZ: 1, turnMargin: 45, minAltitude: 19, maxAltitude: 57,
    maxBank: 1.02, bankGain: 1.4, rollRate: 1.2, lift: 12,
    maxPitch: 0.32, pitchRate: 0.24, acceleration: 3,
    tailDistance: 16, passDistance: 13, fireRange: 65,
  },
  shipHealth: 100,
  boltDamage: 25,
  boltSpeed: 100,
  boltLifetime: 1.1,
  shipSpeedMin: 18, shipSpeedMax: 26,
  turnRateMin: 0.65, turnRateMax: 0.85,
  fireAngleThreshold: 0.085, // nose guns: narrow lead-angle window
  fireCooldownMin: 0.13, fireCooldownMax: 0.22,
  respawnDelayMin: 4, respawnDelayMax: 9,
  explosionLifetime: 0.6,
  // --- Death spiral: hit ships burn, tumble and crash into the ground -------
  crashGravity: 14,          // downward acceleration while falling
  crashSpinMin: 1.5, crashSpinMax: 4.5, // tumble rate (rad/sec)
  crashDrag: 0.4,            // horizontal slowdown while falling
  smokePuffInterval: 0.045,  // seconds between trail puffs
  smokeLife: 1.8,            // puff fade time
  smokeRise: 2.2,            // puff drift upward (units/sec)
  smokeGrow: 2.6,            // puff expansion over its life
  groundBlastScale: 3.2,     // ground impact fireball size multiplier
  groundBlastLife: 1.1,
  models: [
    'https://media.base44.com/files/public/6aad7caf1cfd574f0bf92f13/12a147ef0_craft_speederB.glb',
    'https://media.base44.com/files/public/6aad7caf1cfd574f0bf92f13/526af9e5f_craft_speederD.glb',
    'https://media.base44.com/files/public/6aad7caf1cfd574f0bf92f13/5affcd1d1_craft_racer.glb',
  ],
  colors: {
    // Both fleets use dark military finishes; team identity comes from small lights.
    friendlyHull: '#242c31',
    friendlyAccent: '#46545a',
    enemyHull: '#171b20',
    enemyAccent: '#353c43',
    friendlyNavigation: '#70e8ff',
    enemyNavigation: '#b9a0ff',
    friendlyBolt: '#60a5fa',
    enemyBolt: '#f87171',
    explosion: '#ffaa44',
    smoke: '#4a4238',
  },
};

// Tower presentation only — does not change damage, range or firing cadence.
export const TOWER_VISUALS = {
  turnDamping: 12, deployDuration: 0.65, recoilRecovery: 13,
  recoil: { mg: 0.09, cannon: 0.28, frost: 0.05 },
  flashDuration: { mg: 0.065, cannon: 0.12, frost: 0.22 },
  steel: '#414a49', dark: '#222b2d', trim: '#afb5a5',
  warmGlow: '#ffb657', coldGlow: '#8feaff',
  // Rocket-landing deployment (SpaceX-style)
  descentHeight: 36,
  descentDuration: 2.2,
  legDeployAt: 0.45,
  touchdownBounce: 0.14,
  touchdownSettle: 0.55,
  exhaustColor: '#ff9933',
  exhaustCoreColor: '#fff0cc',
  dustColor: '#a89478',
};

// --- Tower defense ----------------------------------------------------------
export const TOWER_DEFENSE = {
  // Friendly half is z > 0. Towers can only be placed there.
  friendlyHalfZ: 0,
  minSpacing: 3,         // minimum distance between tower centers
  maxTowers: 30,        // hard cap for performance
  // Kill-based currency: no passive income. Each enemy type drops scrap.
  scrapRewards: { quadshell: 10, eyedrone: 15, trilobite: 40 },
  startingScrap: 100,
  // Wave survival: survive this many enemy waves to win.
  maxWaves: 20,
  // Tower types — distinct stats, colors, and shapes.
  towers: {
    mg: {
      name: 'MG Turret',
      cost: 50,
      range: 12,
      damage: 5,
      cooldown: 0.1,       // seconds between shots
      projectileSpeed: 30,
      color: '#ff8140',
      barrelLength: 0.6,
      baseRadius: 0.8,
    },
    cannon: {
      name: 'Cannon',
      cost: 150,
      range: 25,
      damage: 30,
      cooldown: 1.5,
      projectileSpeed: 22,
      splashRadius: 3,
      color: '#646d69',
      barrelLength: 0.9,
      baseRadius: 1.1,
    },
    frost: {
      name: 'Frost Tower',
      cost: 100,
      range: 15,
      damage: 3,
      cooldown: 0.5,
      projectileSpeed: 25,
      slowFactor: 0.5,    // multiply enemy speed by this
      slowDuration: 2,    // seconds
      color: '#60a5fa',
      barrelLength: 0.5,
      baseRadius: 0.9,
    },
  },
};

// --- Friendly tanks (defensive bulwark) --------------------------------------
export const TANK = {
  hullColor: '#6b6b50',
  trackColor: '#3a3a30',
  turretColor: '#5a5a45',
  barrelColor: '#2a2a25',
  accentColor: '#cf8140',
  colliderHalfWidth: 1.25,
  colliderHalfHeight: 0.5,
  colliderHalfDepth: 1.75,
  colliderY: 0.5,
  moveSpeed: 1.5,
  initialFacing: Math.PI,
  coverAuraRadius: 5,
  coverDamageReduction: 0.5,
};

export const TANK_DELIVERY = {
  interval: 45,
  startDelay: 20,
  maxAlive: 4,
};

// --- Level system (day → night campaign) ------------------------------------
export const LEVELS = {
  day: {
    id: 1,
    name: 'DAY',
    maxWaves: 20,
    atmosphere: {
      sky: '#9eb9ca', horizon: '#ead2ae', sun: '#fff0ce',
      sunPosition: [-50, 80, 140], sunIntensity: 3.6,
      fogNear: 150, fogFar: 460,
      ambient: 0.36, hemisphere: 1.05, skyColor: '#d9ecf5', groundColor: '#a99476',
    },
  },
  night: {
    id: 2,
    name: 'NIGHT',
    introVideoUrl: 'https://media.base44.com/videos/public/6aad7caf1cfd574f0bf92f13/5e78041df_now_i_want_it_to_be_landing_on.mp4',
    maxWaves: 25,
    atmosphere: {
      sky: '#0a0e1a', horizon: '#1a2030', sun: '#8fa8d0',
      sunPosition: [-30, 70, 90], sunIntensity: 1.2,
      fogNear: 30, fogFar: 120,
      ambient: 0.12, hemisphere: 0.35, skyColor: '#2a3550', groundColor: '#1a1e2a',
    },
  },
};

export function getLevelConfig(level) {
  return level === 2 ? LEVELS.night : LEVELS.day;
}
export function getAtmosphere(level) {
  return getLevelConfig(level).atmosphere;
}
export function getMaxWaves(level) {
  return getLevelConfig(level).maxWaves;
}
export const NIGHT_FLARES = {
  color: '#fff1b8',
  minInterval: 9,
  maxInterval: 16,
  riseDuration: 1.6,
  burnDuration: 6,
  height: 42,
  descent: 8,
  intensity: 85,
  radius: 58,
};

export function getEnemyRules(level) {
  if (level === 2) {
    return {
      ...BALANCE.enemy,
      interval: 10,
      maxAlive: 84,
      spawnScale: 1.3,
      startDelay: 8,
      squad: ['quadshell', 'eyedrone', 'trilobite', 'eyedrone', 'trilobite'],
      trilobiteInterval: 20,
    };
  }
  return BALANCE.enemy;
}

// --- Opening flow (main menu, intro video, handoff) -------------------------
export const OPENING = {
  menuBackgroundUrl: 'https://base44.app/api/apps/6a6060c7f9e002982672084c/files/mp/public/6a6060c7f9e002982672084c/0802417bf_948de030c_image.png',
  introVideoUrl: 'https://media.base44.com/videos/public/6aad7caf1cfd574f0bf92f13/714add64a_Create_a_second_cinematic_t.mp4',
  handoffTimeout: 60000,
  fadeDuration: 800,
  firstShipMinUnload: 3.5,
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
    distance: 3.0,
    height: 1.8,
    shoulder: 0.55, // screen-right offset; existing model/movement forward is +Z
    minPitch: -0.85,
    maxPitch: 1.3,
    initialPitch: 0.4,
    mouseSensitivity: 0.0022,
  },
  ads: {
    distance: 2.6,       // pulled back slightly so the character stays in frame
    height: 1.3,         // lower eye line so aiming angle tilts down toward target
    shoulder: 0.25,      // slightly wider offset to keep character visible
    fov: 50,             // slightly wider to avoid clipping the model out
    sensitivityMult: 0.5, // reduced mouse sensitivity while aiming
  },
};