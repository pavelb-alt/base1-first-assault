// Cheap, allocation-free lookup of the unit the player directly controls.
// Mirrors window.game.getControlledUnit() without the per-call object spread,
// so HUD overlays can poll it every animation frame.
import { gameState } from '@/game/3d/world';
import { combat } from '@/game/3d/combat';
import { towerDefenseState } from '@/game/3d/towerDefenseState';

let cached = null;
let cachedKey = '';

/** Kind of reticle/feel for the current control target: soldier | tank | artillery | tower | null */
export function controlledKind() {
  if (gameState.mode !== 'third_person' && !gameState.transitioning) return null;
  const st = gameState.controlledStation;
  if (st) return st.type;
  return gameState.possessedSoldierId !== null ? 'soldier' : null;
}

/** The live combat entry (or tower record) under player control, or null. */
export function controlledEntry() {
  const st = gameState.controlledStation;
  const type = st ? st.type : 'soldier';
  const id = st ? st.id : gameState.possessedSoldierId;
  if (id === null || id === undefined) { cached = null; cachedKey = ''; return null; }
  if (cached && cachedKey === type && cached.id === id && (type === 'tower' || cached.alive)) return cached;
  cached = null;
  if (type === 'tower') {
    const towers = towerDefenseState.towers;
    for (let i = 0; i < towers.length; i++) if (towers[i].id === id) { cached = towers[i]; break; }
  } else {
    const units = combat.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.team === 'friendly' && u.type === type && u.id === id) { cached = u; break; }
    }
  }
  cachedKey = cached ? type : '';
  return cached;
}

/** 0..1 health ratio of the controlled unit (1 when unknown, e.g. towers without health). */
export function controlledHealthRatio() {
  const u = controlledEntry();
  if (!u || !Number.isFinite(u.health) || !(u.maxHealth > 0)) return 1;
  return Math.max(0, Math.min(1, u.health / u.maxHealth));
}
