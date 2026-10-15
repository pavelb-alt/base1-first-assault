// ============================================================================
// PROJECT-WIDE CONSTANTS — edit these to tune the battlefield
// ============================================================================

export const ART_STYLE = 'stylized low-poly sci-fi battlefield, muted earth and sand, restrained faction accents';
export const GAME_PERSPECTIVE = 'top-down';

// Rendering only: simulation, spawn budgets and weapon timing are unchanged.
export const PERFORMANCE = {
  minDpr: 1, maxDpr: 1.25, // stable pixel density avoids repeated HDR buffer reallocations
  shadows: true,
  antialias: true,
  targetFps: 30,
  nearAnimationDistance: 35,
  nearAnimationHz: 20,
  farAnimationHz: 8,
  unitShadowDistance: 180,
  minimapHz: 10,
  ambientParticleScale: 0.3,
};

// Visual-only cinematic settings; never used by combat or navigation.
export const LIGHTING = {
  exposure: 1.1,
  shadowMapSize: 2048, shadowRadius: 3,
  bloomIntensity: 1, bloomThreshold: 1.25, bloomSmoothing: 0.2,
  depthOfFieldStrength: 0.5, strategicFocusRange: 85,
  thirdPersonFocus: 10, thirdPersonFocusRange: 35,
  vignetteOffset: 0.3, vignetteDarkness: 0.5,
  muzzleRadiance: 5, tracerRadiance: 3, fireRadiance: 3.2,
  hazeOpacity: 0.085, shaftOpacity: 0.16,
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

// Visual-only battlefield detail: fixed budgets, no navigation or combat changes.
export const BATTLEFIELD_DETAIL = {
  reliefAmplitude: 0.22, reliefTriangleSize: 3.5,
  craters: 18, wrecks: 8, rockPieces: 96, bagClusters: 12, shells: 32,
  // Props cover the whole field; interiorWeight is the center acceptance floor and
  // perimeterFalloff (>1) concentrates the remaining density toward the edges.
  interiorWeight: 0.3, perimeterFalloff: 2.2,
  ruins: 10, smokeSites: 6, puffsPerSite: 18, smokeLife: 12,
  smoke: '#4a4238', ember: '#ff9933', emberIntensity: 0.7,
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
  // Forward Bulwark: one full-width friendly trench and three wide causeways.
  rows: [35],
  sectionCenters: [-45, 0, 45],
  crossings: [-45, 0, 45],
  rampCenters: [-52.5, -37.5, -7.5, 7.5, 37.5, 52.5],
  sectionWidth: 45, slotsPerSection: 24,
  // Existing Orange Guardian measures ~0.726m at scale 0.3 (hand: 0.324m, head: 0.488m).
  // 0.46m floor-to-lip cover protects the torso; the 2.2m aisle fits two 0.8m capsules.
  depth: 1.8, firingFloor: -0.45, halfWidth: 2.4,
  floorFront: -0.1, floorRear: 2.1, stepRear: -1.1, firingZ: -1.75, spineZ: 1,
  mainRow: 0,
  rowProfiles: [
    { role: 'bulwark', halfWidth: 3.15, depth: 2.0, zigAmplitude: 1.35 },
  ],
  communicationWidth: 1.35,
  zigLength: 7.5, zigAmplitude: 0.55,
  rampReach: 6.8, rampHalfWidth: 1.6, rampShoulder: 0.6,
  crossingHalfWidth: 4, crossingSlope: 1.5,
  stationInner: 10, stationSpacing: 1,
  crossingApproach: 12, crossingExit: 12,
  wireOffsets: [7, 10.5], obstacleOffset: 14,
  parapetHeight: 0.35, edgeThickness: 0.3, spawnZ: 63.75,
  earthColors: { wall: '#806148', floor: '#514437', step: '#a58a64', ramp: '#99754f', edge: '#665443' },
  clearDelay: 1.5, resistanceRadius: 10, maxHoldTime: 8,
  jumpDuration: 1.3, jumpStart: -7, jumpEnd: 11,
  gravity: 20, spatialCell: 24, spatialInterval: 0.1,
};

// --- Soldier config ---------------------------------------------------------
export const SOLDIER = {
  modelUrl: 'https://base44.app/api/apps/6a6060c7f9e002982672084c/files/mp/public/6a6060c7f9e002982672084c/ef43954e8_orange-sentry-animated-v1.glb',
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
    squad: ['quadshell', 'quadshell', 'spider403', 'eyedrone', 'eyedrone', 'quadshell', 'spider403', 'quadshell'],
    trilobiteInterval: 30 },
  formation: { spacing: 1.6, rowSpacing: 2, departure: 5, cohesionDistance: 7, catchupSpeed: 3.3 },
  moveSpeed: 3,
  units: {
    soldier:  { health: 120, damage: 7, cooldown: 0.125, range: 15, aiSpread: 0.05 },
    quadshell:{ health: 120, damage: 7, cooldown: 0.125, range: 14, aiSpread: 0.05 },
    spider403:{ health: 84, damage: 7, cooldown: 0.125, range: 14, aiSpread: 0.05 },
    eyedrone: { health: 100, damage: 6, cooldown: 0.125, range: 17, aiSpread: 0.05 },
    trilobite:{ health: 320, damage: 14, cooldown: 0.25, range: 13, aiSpread: 0.05 },
    tank:     { health: 800, damage: 20, cooldown: 1.6, range: 28, aiSpread: 0.03 },
    artillery:{ health: 450, damage: 55, cooldown: 4.5, range: 72, aiSpread: 0 },
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
    modelUrl: 'https://media.base44.com/files/public/6aad7caf1cfd574f0bf92f13/95a387c07_57113ba47_Enemy_404_v6_animated.glb',
    scale: 1,
    hoverHeight: 0,        // ground unit
    // Extra shot per attack from the rear turret: muzzle offset in the node's local space.
    backCannon: { node: 'BackCannon', offset: [0, 0.55, 0.95] },
    colliderHalfHeight: 0.4,
    colliderRadius: 0.35,
    colliderY: 0.9,
    facingOffset: 0,
    animIdle: 'Idle',
    animMove: 'Walk',
    animRun: 'Run',
    animAttack: 'Attack',
  },
  spider403: {
    modelUrl: 'https://base44.app/api/apps/6a6060c7f9e002982672084c/files/mp/public/6a6060c7f9e002982672084c/431cb0136_Enemy_403_spider_v1.glb',
    scale: 1,
    hoverHeight: 0,
    moveSpeed: BALANCE.moveSpeed * 1.3,
    frontCannons: ['Gun.L', 'Gun.R'],
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
    modelUrl: 'https://base44.app/api/apps/6a6060c7f9e002982672084c/files/mp/public/6a6060c7f9e002982672084c/7d1390bab_Enemy_500_insect_animated_v1.glb',
    scale: 1,
    hoverHeight: 3,        // flying unit
    tailGun: 'TailGun',
    muzzleNode: 'Muzzle',
    colliderHalfHeight: 0.2,
    colliderRadius: 0.45,
    colliderY: 0.6,        // retain existing aiming height
    hitboxY: 0.3,
    hitboxZ: 0.4,         // longitudinal capsule covers thorax and head, not tail/wings
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
  scrapRewards: { quadshell: 10, spider403: 10, eyedrone: 15, trilobite: 40 },
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
  hullColor: '#d8651f',
  trackColor: '#262a2d',
  turretColor: '#f07a24',
  barrelColor: '#303a40',
  accentColor: '#ffb347',
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
  interval: 20,
  startDelay: 15,
  maxAlive: 4,
};

// --- Friendly mobile artillery (long-range indirect fire from the rear) ------
export const ARTILLERY = {
  hullColor: '#c9692a', armorColor: '#e07b2e', trackColor: '#262a2d',
  barrelColor: '#394247', accentColor: '#ffb347', shellColor: '#ffd08a',
  colliderHalfWidth: 1.2, colliderHalfHeight: 0.6, colliderHalfDepth: 1.9, colliderY: 0.6,
  moveSpeed: 1.2, holdZ: 50, initialFacing: Math.PI,
  barrelPivot: [0, 1.45, 0.55], barrelLength: 4.3,
  travelElevation: 0.12, fireElevation: 0.8, recoil: 0.55,
  minRange: 14, splashRadius: 4.5, shellFlightTime: 2.4, shellApex: 24, scatter: 1.8,
  maxShells: 24,
  delivery: { interval: 35, startDelay: 30, maxAlive: 2 },
};

// Direct vehicle driving shares the existing rotating soldier camera convention.
export const DIRECT_CONTROL = {
  enterRadius: 6, exitOffset: 4.5, rightX: -1, vehicleMargin: 3, maxStep: 0.45,
  camera: { distance: 8, height: 3.4, shoulder: 0.6 },
  towerCamera: { distance: 4, height: 2.2, shoulder: 0.4 },
};

// --- Direct unit commands (strategic view) -----------------------------------
export const COMMANDS = {
  pickRadius: 5,          // target-mode click snaps to an enemy within this distance
  retargetInterval: 1,    // seconds between re-routing toward a moving attack target
  hudInterval: 0.25,      // seconds between selection HUD refreshes
  selectColor: '#5eead4', moveColor: '#5eead4', attackColor: '#f87171',
  ringScale: { soldier: 0.75, tank: 2.3, artillery: 2.6 },
  maxSelected: 96, dragThreshold: 6,
  formationSpacing: 2, vehicleSpacing: 4.5,
};

// --- Level system (day → night campaign) ------------------------------------
export const LEVELS = {
  day: {
    id: 1,
    name: 'DAY',
    maxWaves: 20,
    defeatVideoUrl: 'https://media.base44.com/videos/public/6aad7caf1cfd574f0bf92f13/f5c579759_VID-087.mp4',
    victoryVideoUrl: 'https://media.base44.com/videos/public/6aad7caf1cfd574f0bf92f13/bd11edc88_VID-083.mp4',
    atmosphere: {
      sky: '#a3bdcb', horizon: '#e6cba5', sun: '#ffdfad',
      sunPosition: [-55, 65, 140], sunIntensity: 3.4,
      fogNear: 110, fogFar: 360,
      ambient: 0.22, hemisphere: 0.8, skyColor: '#d9ecf5', groundColor: '#a99476',
    },
  },
  night: {
    id: 2,
    name: 'NIGHT',
    introVideoUrl: 'https://media.base44.com/videos/public/6aad7caf1cfd574f0bf92f13/fb8ff7c79_VID-0832.mp4',
    maxWaves: 25,
    atmosphere: {
      sky: '#0a0e1a', horizon: '#1a2030', sun: '#8fa8d0',
      sunPosition: [-30, 70, 90], sunIntensity: 1.2,
      fogNear: 65, fogFar: 190,
      ambient: 0.12, hemisphere: 0.35, skyColor: '#2a3550', groundColor: '#1a1e2a',
    },
  },
  forest: {
    id: 3,
    name: 'FOREST',
    introVideoUrl: 'https://media.base44.com/videos/public/6aad7caf1cfd574f0bf92f13/54a71242c_VID-071.mp4',
    maxWaves: 30,
    atmosphere: {
      sky: '#2d4a2a', horizon: '#5a7a48', sun: '#d4e8b8',
      sunPosition: [-20, 60, 80], sunIntensity: 2.4,
      fogNear: 85, fogFar: 225,
      ambient: 0.22, hemisphere: 0.65, skyColor: '#3d6a35', groundColor: '#2d3a1e',
    },
  },
  frost: {
    id: 4,
    name: 'FROST',
    maxWaves: 35,
    atmosphere: {
      sky: '#849eaf', horizon: '#c9dce5', sun: '#e7f6ff',
      sunPosition: [-30, 70, 100], sunIntensity: 1.8,
      fogNear: 90, fogFar: 250,
      ambient: 0.4, hemisphere: 0.85, skyColor: '#e5f5ff', groundColor: '#8197aa',
    },
  },
  city: {
    id: 5,
    name: 'CITY',
    maxWaves: 40,
    atmosphere: {
      sky: '#8599a6', horizon: '#c1c4bc', sun: '#fff2d9',
      sunPosition: [-55, 85, 110], sunIntensity: 2.5,
      fogNear: 100, fogFar: 300,
      ambient: 0.3, hemisphere: 0.85, skyColor: '#d5e5ed', groundColor: '#858681',
    },
  },
};

export const CITY = {
  asphalt: '#727877', concrete: '#a0a29b', curb: '#b6b8ae',
  buildings: ['#8b9292', '#ada99c', '#77858b', '#999d98'],
  trim: '#515e62', glass: '#314d59', windowGlow: '#f0c58a',
  roadMarking: '#d1c7a2', blocksPerSide: 6, blockSpacing: 25,
  firstBlockOffset: 98, rowSpacing: 32,
};

// Visual-only winter weather; pooled points do not affect combat or movement.
export const WINTER = {
  snowColor: '#e5eff3', iceColor: '#8dabbc',
  snowCount: 2600, fallSpeed: 3.8, windX: 1.1, windZ: 0.35,
  fieldWidth: 240, fieldHeight: 100, flakeSize: 0.13,
};

export function getLevelConfig(level) {
  if (level === 2) return LEVELS.night;
  if (level === 3) return LEVELS.forest;
  if (level === 4) return LEVELS.frost;
  if (level === 5) return LEVELS.city;
  return LEVELS.day;
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
  if (level === 1) {
    // Level 1 must still be lost if the player never intervenes.
    return {
      ...BALANCE.enemy,
      interval: 9,
      maxAlive: 96,
      spawnScale: 1.5,
      startDelay: 10,
    };
  }
  if (level === 2) {
    return {
      ...BALANCE.enemy,
      interval: 10,
      maxAlive: 84,
      spawnScale: 1.3,
      startDelay: 8,
      squad: BALANCE.enemy.squad,
      trilobiteInterval: 20,
    };
  }
  if (level === 4 || level === 5) {
    return {
      ...BALANCE.enemy,
      interval: 7,
      maxAlive: 96,
      spawnScale: 1.5,
      startDelay: 6,
      squad: BALANCE.enemy.squad,
      trilobiteInterval: 12,
    };
  }
  if (level === 3) {
    return {
      ...BALANCE.enemy,
      interval: 8,
      maxAlive: 96,
      spawnScale: 1.5,
      startDelay: 6,
      squad: BALANCE.enemy.squad,
      trilobiteInterval: 15,
    };
  }
  return BALANCE.enemy;
}

// --- Opening flow (opening cinematic, main menu, mission intro, handoff) -----
export const OPENING = {
  menuBackgroundUrl: 'https://media.base44.com/images/public/6aad7caf1cfd574f0bf92f13/14796c05d_9cb31aef-c38b-4790-88ff-e3ff9066e111.png',
  preMenuVideoUrl: 'https://media.base44.com/videos/public/6aad7caf1cfd574f0bf92f13/88cc475e8_VID-08.mp4',
  introVideoUrl: 'https://media.base44.com/videos/public/6aad7caf1cfd574f0bf92f13/2319d7841_VID-07.mp4',
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