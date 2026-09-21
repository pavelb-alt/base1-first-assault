import { TOWER_DEFENSE } from '@/game/config';
import { EventBus } from '@/game/EventBus';

// Shared tower defense state — module scope, read/written by useFrame and React overlay.
export const towerDefenseState = {
  scrap: TOWER_DEFENSE.startingScrap,
  towers: [],           // [{ id, type, position: {x,z}, cooldown, targetId }]
  nextTowerId: 0,
  wave: 0,
  startTime: 0,
  reset() {
    this.scrap = TOWER_DEFENSE.startingScrap;
    this.towers.length = 0;
    this.nextTowerId = 0;
    this.wave = 0;
    this.startTime = 0;
    EventBus.emit('currency-changed', this.scrap);
  },
  // Level transition: keep towers & scrap, reset wave counter and survival timer.
  transitionLevel() {
    this.wave = 0;
    this.startTime = Date.now();
    EventBus.emit('wave-changed', 0);
  },
  addScrap(amount) {
    this.scrap += amount;
    EventBus.emit('currency-changed', this.scrap);
  },
  canAfford(type) {
    const cfg = TOWER_DEFENSE.towers[type];
    return cfg && this.scrap >= cfg.cost && this.towers.length < TOWER_DEFENSE.maxTowers;
  },
  spend(type, position) {
    const cfg = TOWER_DEFENSE.towers[type];
    if (!cfg || this.scrap < cfg.cost) return false;
    // Check spacing
    for (const t of this.towers) {
      const dx = t.position.x - position.x;
      const dz = t.position.z - position.z;
      if (Math.hypot(dx, dz) < TOWER_DEFENSE.minSpacing) return false;
    }
    this.scrap -= cfg.cost;
    const tower = {
      id: ++this.nextTowerId,
      type,
      position: { x: position.x, z: position.z },
      cooldown: 0,
      targetId: null,
      slowFactor: cfg.slowFactor ?? null,
      slowDuration: cfg.slowDuration ?? null,
      splashRadius: cfg.splashRadius ?? null,
    };
    this.towers.push(tower);
    EventBus.emit('currency-changed', this.scrap);
    EventBus.emit('tower-placed', { id: tower.id, type, position: tower.position });
    return true;
  },
};