// Modal keyboard layers for menus / overlays.
//
// A single capture-phase keydown listener on window dispatches to the TOPMOST
// layer only. Modal layers stop propagation so game hotkeys (registered as
// normal bubble listeners on window) never fire behind an open menu. Default
// actions (e.g. arrow keys on a focused range input) are untouched unless the
// handler calls preventDefault itself.
import { useEffect, useRef } from 'react';

const layers = [];
let installed = false;

// Activation keys are ignored briefly after a layer opens, and auto-repeat never
// activates: a held Space (jump, hold-to-skip) must not click through the next screen.
const ACTIVATION_KEYS = new Set(['Enter', 'NumpadEnter', 'Space']);
const ACTIVATION_GRACE_MS = 600;

// Events a modal layer received. stopPropagation cannot stop other capture-phase
// listeners on window itself, so those must check consumedByLayer(e).
const consumed = new WeakSet();
export const consumedByLayer = (e) => consumed.has(e);

function onKeyDown(e) {
  const top = layers[layers.length - 1];
  if (!top) return;
  if (top.modal) { e.stopPropagation(); consumed.add(e); }
  if (ACTIVATION_KEYS.has(e.code) && (e.repeat || performance.now() - top.openedAt < top.activationDelay)) {
    e.preventDefault();
    return;
  }
  top.handler.current?.(e);
}
// keyup is deliberately NOT swallowed: game input must always see key releases,
// otherwise a key held while a menu opens would stay "down" after it closes.

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', onKeyDown, true);
}

/** True when any modal layer is open (game-level hotkeys should stand down). */
export const hasModalLayer = () => layers.some(l => l.modal);

/**
 * Register a key layer while `active`. The handler always sees the latest closure.
 * @param {(e: KeyboardEvent) => void} handler
 * @param {{ active?: boolean, modal?: boolean, activationDelay?: number }} [opts]
 */
export function useKeyLayer(handler, { active = true, modal = true, activationDelay = ACTIVATION_GRACE_MS } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return undefined;
    install();
    const layer = { handler: ref, modal, openedAt: performance.now(), activationDelay };
    layers.push(layer);
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [active, modal, activationDelay]);
}

/** Whether a key event originates from a text-ish control that owns arrow keys. */
export function isEditableTarget(e) {
  const t = e.target;
  if (!t || !t.tagName) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  return t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox' && t.type !== 'button';
}
