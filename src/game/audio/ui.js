// UI sounds. A delegated document listener gives every button hover/click
// feedback without touching UI components. Elements can opt in/out with
// `data-sfx="confirm|back|error|purchase|open|close|click|none"`.
import { engine, bus, playBuffer, limiter, allow } from '@/game/audio/engine';
import { getSound } from '@/game/audio/sounds';

const UI = {
  click: ['ui_click', 0.32], hover: ['ui_hover', 0.12], confirm: ['ui_confirm', 0.3], back: ['ui_back', 0.28],
  error: ['ui_error', 0.3], purchase: ['ui_purchase', 0.34], open: ['ui_open', 0.26], close: ['ui_close', 0.24],
};
const limHover = limiter(0.045, 2), limClick = limiter(0.03, 3);

/** Play a named UI sound: 'click'|'hover'|'confirm'|'back'|'error'|'purchase'|'open'|'close'. */
export function playUi(name = 'click') {
  if (!engine.ready) return;
  const def = UI[name] || UI.click;
  const t = engine.ctx.currentTime;
  if (name === 'hover' ? !allow(limHover, t) : !allow(limClick, t)) return;
  playBuffer(getSound(def[0]), bus.ui, def[1], 0, 0.98 + Math.random() * 0.04, 20000, 0.04, 50, 'ui');
}

const SELECTOR = 'button, .hud-btn, [role="button"], [role="menuitem"], [role="tab"], [data-sfx]';
let lastHover = null;

function target(e) {
  const el = e.target;
  return el && el.closest ? el.closest(SELECTOR) : null;
}
const disabled = (el) => el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled');

function onOver(e) {
  const el = target(e);
  if (el === lastHover) return;
  lastHover = el;
  if (!el || disabled(el) || el.dataset.sfx === 'none') return;
  playUi('hover');
}
function onDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  const el = target(e);
  if (!el) return;
  const s = el.dataset.sfx;
  if (s === 'none') return;
  playUi(disabled(el) ? 'error' : (s && UI[s] ? s : 'click'));
}

let installed = false;
export function installUiListeners() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const opts = { capture: true, passive: true };
  document.addEventListener('pointerover', onOver, opts);
  document.addEventListener('pointerdown', onDown, opts);
}
