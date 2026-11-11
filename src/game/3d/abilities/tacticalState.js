import { EventBus } from '@/game/EventBus';

// Strategic-view interaction state shared by the DOM HUD (writes intent, handles clicks)
// and the in-canvas TacticalOverlay (tracks the cursor on the ground, draws ghosts/rings).
// Module scope; never React state.
export const tacticalState = {
  mode: null,            // null | 'place' | 'ability'
  placeType: null,       // tower type while placing
  abilityId: null,       // ability id while targeting
  cursor: { x: 0, z: 0, valid: false, onGround: false, problem: null },
  preview: null,         // { type, x, z } — pie-menu hover range preview
  pieAnchor: null,       // { x, z } — world point the pie menu was opened on
  invalid: null,         // { x, z, until } — red flash where a placement was refused
};

const publish = () => EventBus.emit('tactical-mode', { mode: tacticalState.mode, placeType: tacticalState.placeType, abilityId: tacticalState.abilityId });

export function startPlacement(type) {
  tacticalState.mode = 'place';
  tacticalState.placeType = type;
  tacticalState.abilityId = null;
  publish();
}
export function startTargeting(abilityId) {
  tacticalState.mode = 'ability';
  tacticalState.abilityId = abilityId;
  tacticalState.placeType = null;
  publish();
}
export function cancelTactical() {
  if (!tacticalState.mode) return false;
  tacticalState.mode = null;
  tacticalState.placeType = null;
  tacticalState.abilityId = null;
  publish();
  return true;
}
export function flashInvalid(x, z) {
  tacticalState.invalid = { x, z, until: performance.now() + 700 };
}
export function resetTactical() {
  tacticalState.preview = null;
  tacticalState.pieAnchor = null;
  tacticalState.invalid = null;
  cancelTactical();
}
