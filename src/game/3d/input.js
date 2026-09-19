// Shared input state — mutated by window event listeners, read inside useFrame.
// Never causes React re-renders; gameplay polls it every frame.
export const input = {
  keys: {},
  mouseDelta: { x: 0, y: 0 },
  wheelDelta: 0,
  mouseDown: false,
};

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    input.keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) {
      input.mouseDelta.x += e.movementX;
      input.mouseDelta.y += e.movementY;
    }
  });
  window.addEventListener('wheel', (e) => {
    input.wheelDelta += e.deltaY;
  }, { passive: true });

  // Track left mouse button for shooting
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.mouseDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
  });

  // Clear all keys on blur / focus loss to prevent stuck movement
  window.addEventListener('blur', () => {
    input.keys = {};
    input.mouseDelta.x = 0;
    input.mouseDelta.y = 0;
    input.mouseDown = false;
  });

  // If pointer lock is lost mid-third-person, clear keys
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement) {
      input.keys = {};
      input.mouseDown = false;
    }
  });
}