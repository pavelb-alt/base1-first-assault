import { TOWER_DEFENSE, getDifficultyProfile } from '@/game/config';
import { EventBus } from '@/game/EventBus';
import { gameEvents } from '@/game/gameEvents';
import { settings } from '@/game/settings';

// Why a placement is rejected, in player-facing words (null = valid).
export function placementProblem(type, position, towers) {
  const cfg = TOWER_DEFENSE.towers[type];
  if (!cfg) return 'Unknown tower type';
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return 'No ground here';
  if (position.z <= TOWER_DEFENSE.friendlyHalfZ) return 'Enemy territory: build on your side of the field';
  if (Math.abs(position.x) > 72 || position.z > 72) return 'Out of bounds';
  for (const t of towers) {
    if (Math.hypot(t.position.x - position.x, t.position.z - position.z) < TOWER_DEFENSE.minSpacing) return 'Too close to another tower';
  }
  if (towers.length >= TOWER_DEFENSE.maxTowers) return `Tower limit reached (${TOWER_DEFENSE.maxTowers})`;
  return null;
}

// Effective stats of a tower at its current level.
export function towerStats(type, level = 1) {
  const cfg = TOWER_DEFENSE.towers[type];
  const up = level > 1 ? cfg.upgrades?.[level - 2] : null;
  return {
    damage: cfg.damage * (up?.damage ?? 1),
    range: cfg.range * (up?.range ?? 1),
    cooldown: cfg.cooldown * (up?.cooldown ?? 1),
    splashRadius: cfg.splashRadius ? cfg.splashRadius * (up?.splash ?? 1) : null,
    slowFactor: cfg.slowFactor ? Math.max(0.2, cfg.slowFactor * (up?.slow ?? 1)) : null,
    slowDuration: cfg.slowDuration ?? null,
  };
}

// Shared tower defense state — module scope, read/written by useFrame and React overlay.
export const towerDefenseState = {
  scrap: TOWER_DEFENSE.startingScrap,
  towers: [],           // [{ id, type, level, invested, targeting, position: {x,z}, cooldown, targetId, stats }]
  nextTowerId: 0,
  wave: 0,
  startTime: 0,
  selectedTowerId: null,
  difficultyId: 'normal',
  difficulty: getDifficultyProfile('normal'),
  scrapEarned: 0,
  // Snapshot settings.difficulty — called when a mission or level begins.
  refreshDifficulty() {
    const id = settings.get().difficulty;
    this.difficultyId = ['easy', 'normal', 'hard'].includes(id) ? id : 'normal';
    this.difficulty = getDifficultyProfile(this.difficultyId);
    return this.difficultyId;
  },
  startingScrap() {
    return Math.round(TOWER_DEFENSE.startingScrap * this.difficulty.startingScrap);
  },
  // Fresh mission: apply the difficulty's starting scrap if nothing has been spent or earned yet.
  beginMission() {
    this.refreshDifficulty();
    if (this.towers.length === 0 && this.scrapEarned === 0) {
      this.scrap = this.startingScrap();
      EventBus.emit('currency-changed', this.scrap);
    }
  },
  reset() {
    this.refreshDifficulty();
    this.scrap = this.startingScrap();
    this.scrapEarned = 0;
    this.towers.length = 0;
    this.nextTowerId = 0;
    this.wave = 0;
    this.startTime = 0;
    this.selectedTowerId = null;
    EventBus.emit('currency-changed', this.scrap);
    EventBus.emit('tower-selected', null);
  },
  // Level transition: keep towers & scrap, reset wave counter and survival timer.
  transitionLevel() {
    this.refreshDifficulty();
    this.wave = 0;
    this.startTime = Date.now();
    EventBus.emit('wave-changed', 0);
  },
  addScrap(amount) {
    if (!amount) return;
    this.scrap += amount;
    if (amount > 0) this.scrapEarned += amount;
    EventBus.emit('currency-changed', this.scrap);
    gameEvents.emit('scrap', { amount, total: this.scrap });
  },
  // Spend scrap for a non-tower purchase (abilities). Returns false if unaffordable.
  trySpend(amount) {
    if (this.scrap < amount) return false;
    this.scrap -= amount;
    EventBus.emit('currency-changed', this.scrap);
    gameEvents.emit('scrap', { amount: -amount, total: this.scrap });
    return true;
  },
  canAfford(type) {
    const cfg = TOWER_DEFENSE.towers[type];
    return cfg && this.scrap >= cfg.cost && this.towers.length < TOWER_DEFENSE.maxTowers;
  },
  placementProblem(type, position) {
    const problem = placementProblem(type, position, this.towers);
    if (problem) return problem;
    if (this.scrap < TOWER_DEFENSE.towers[type].cost) return `Not enough scrap (${TOWER_DEFENSE.towers[type].cost} needed)`;
    return null;
  },
  spend(type, position) {
    const cfg = TOWER_DEFENSE.towers[type];
    if (!cfg || this.scrap < cfg.cost) return false;
    if (placementProblem(type, position, this.towers)) return false;
    this.scrap -= cfg.cost;
    const tower = {
      id: ++this.nextTowerId,
      type,
      level: 1,
      invested: cfg.cost,
      targeting: 'first',
      kills: 0,
      damageDealt: 0,
      position: { x: position.x, z: position.z },
      cooldown: 0,
      targetId: null,
      stats: towerStats(type, 1),
    };
    // Legacy fields kept for existing readers.
    tower.slowFactor = tower.stats.slowFactor;
    tower.slowDuration = tower.stats.slowDuration;
    tower.splashRadius = tower.stats.splashRadius;
    this.towers.push(tower);
    EventBus.emit('currency-changed', this.scrap);
    EventBus.emit('tower-placed', { id: tower.id, type, position: tower.position });
    gameEvents.emit('tower-built', { type, x: tower.position.x, z: tower.position.z });
    return true;
  },
  getTower(id) { return this.towers.find(t => t.id === id) ?? null; },
  upgradeCost(tower) {
    if (!tower || tower.level >= TOWER_DEFENSE.maxLevel) return null;
    return TOWER_DEFENSE.towers[tower.type].upgrades?.[tower.level - 1]?.cost ?? null;
  },
  sellValue(tower) {
    return tower ? Math.floor(tower.invested * TOWER_DEFENSE.sellRefund) : 0;
  },
  upgrade(id) {
    const tower = this.getTower(id), cost = this.upgradeCost(tower);
    if (cost === null || this.scrap < cost) return false;
    this.scrap -= cost;
    tower.level++;
    tower.invested += cost;
    tower.stats = towerStats(tower.type, tower.level);
    tower.slowFactor = tower.stats.slowFactor;
    tower.splashRadius = tower.stats.splashRadius;
    tower.upgradedAt = performance.now();
    EventBus.emit('currency-changed', this.scrap);
    EventBus.emit('tower-changed', { id, level: tower.level });
    gameEvents.emit('tower-upgraded', { id, type: tower.type, level: tower.level, x: tower.position.x, z: tower.position.z });
    return true;
  },
  sell(id) {
    const index = this.towers.findIndex(t => t.id === id);
    if (index < 0) return false;
    const tower = this.towers[index], refund = this.sellValue(tower);
    this.towers.splice(index, 1);
    if (this.selectedTowerId === id) this.selectTower(null);
    this.scrap += refund;
    EventBus.emit('currency-changed', this.scrap);
    EventBus.emit('tower-changed', { id, sold: true });
    gameEvents.emit('tower-sold', { id, type: tower.type, refund, x: tower.position.x, z: tower.position.z });
    return refund;
  },
  setTargeting(id, mode) {
    const tower = this.getTower(id);
    if (!tower || !TOWER_DEFENSE.targetingModes.includes(mode)) return false;
    tower.targeting = mode;
    EventBus.emit('tower-changed', { id, targeting: mode });
    return true;
  },
  selectTower(id) {
    const tower = id === null ? null : this.getTower(id);
    this.selectedTowerId = tower ? tower.id : null;
    EventBus.emit('tower-selected', this.selectedTowerId);
    return !!tower;
  },
  describe(tower) {
    if (!tower) return null;
    const cfg = TOWER_DEFENSE.towers[tower.type];
    const next = tower.level < TOWER_DEFENSE.maxLevel ? towerStats(tower.type, tower.level + 1) : null;
    return {
      id: tower.id, type: tower.type, name: cfg.name, level: tower.level, maxLevel: TOWER_DEFENSE.maxLevel,
      targeting: tower.targeting, invested: tower.invested, kills: tower.kills ?? 0, damageDealt: Math.round(tower.damageDealt ?? 0),
      position: { ...tower.position }, stats: { ...tower.stats }, nextStats: next,
      upgradeCost: this.upgradeCost(tower), sellValue: this.sellValue(tower),
    };
  },
};
