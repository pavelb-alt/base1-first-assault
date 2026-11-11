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

function onKeyDown(e) {
  const top = layers[layers.length - 1];
  if (!top) return;
  if (top.modal) e.stopPropagation();
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
 * @param {{ active?: boolean, modal?: boolean }} [opts]
 */
export function useKeyLayer(handler, { active = true, modal = true } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return undefined;
    install();
    const layer = { handler: ref, modal };
    layers.push(layer);
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [active, modal]);
}

/** Whether a key event originates from a text-ish control that owns arrow keys. */
export function isEditableTarget(e) {
  const t = e.target;
  if (!t || !t.tagName) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  return t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox' && t.type !== 'button';
}
