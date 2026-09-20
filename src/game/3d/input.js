import { gameState } from '@/game/3d/world';

export const input = { keys: {}, mouseDelta: { x: 0, y: 0 }, wheelDelta: 0, mouseDown: false, rightMouseDown: false };
export function clearInput() {
  input.keys = {}; input.mouseDelta.x = 0; input.mouseDelta.y = 0;
  input.mouseDown = false; input.rightMouseDown = false; input.wheelDelta = 0;
}
export function setFire(held) {
  input.mouseDown = !!held && gameState.mode === 'third_person' && !gameState.paused && gameState.possessedSoldierId !== null;
}
export function setAim(held) {
  input.rightMouseDown = !!held && gameState.mode === 'third_person' && !gameState.paused && gameState.possessedSoldierId !== null;
}
export function setKey(code, held) { input.keys[code] = !!held; }
export function look(dx, dy) {
  if (gameState.mode !== 'third_person' || gameState.paused) return;
  input.mouseDelta.x += Number.isFinite(dx) ? dx : 0;
  input.mouseDelta.y += Number.isFinite(dy) ? dy : 0;
}
// Bound to the canvas, not overlay buttons; cleanup prevents remount duplicates.
export function bindInput(canvas) {
  const down = e => {
    if (gameState.mode !== 'third_person') return;
    if (e.button === 0) {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.()?.catch?.(() => {});
        return;
      }
      setFire(true);
    } else if (e.button === 2) {
      setAim(true);
    }
  };
  const up = e => {
    if (e.button === 0) setFire(false);
    else if (e.button === 2) setAim(false);
  };
  const move = e => { if (document.pointerLockElement === canvas) look(e.movementX, e.movementY); };
  const keyDown = e => {
    if (e.code === 'Escape' || e.code === 'Tab') { clearInput(); return; }
    if (!gameState.paused) setKey(e.code, true);
  };
  const keyUp = e => setKey(e.code, false);
  const wheel = e => { if (gameState.mode === 'strategic') input.wheelDelta += e.deltaY; };
  const visibility = () => { if (document.hidden) clearInput(); };
  const lock = () => { if (document.pointerLockElement !== canvas) clearInput(); };
  canvas.addEventListener('mousedown', down);
  canvas.addEventListener('wheel', wheel, { passive: true });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('mouseup', up); window.addEventListener('mousemove', move);
  window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', visibility); document.addEventListener('pointerlockchange', lock);
  return () => {
    clearInput(); canvas.removeEventListener('mousedown', down); canvas.removeEventListener('wheel', wheel);
    window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', move);
    window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp);
    window.removeEventListener('blur', clearInput); document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('pointerlockchange', lock);
  };
}