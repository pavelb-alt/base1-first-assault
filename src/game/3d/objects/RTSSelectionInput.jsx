import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { EventBus } from '@/game/EventBus';
import { COMMANDS } from '@/game/config';
import { canCommand } from '@/game/3d/commands';
import { selectScreenBox } from '@/game/3d/rtsSelection';

export function RTSSelectionInput() {
  const { camera, gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    let start = null, dragging = false, blockClick = false, lastPublish = 0;
    const cancel = () => { start = null; dragging = false; EventBus.emit('selection-box', null); };
    const down = e => {
      blockClick = false;
      if (e.button !== 0 || !canCommand()) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, additive: e.shiftKey };
    };
    const move = e => {
      if (!start || e.pointerId !== start.id) return;
      if (!canCommand()) { cancel(); return; }
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) >= COMMANDS.dragThreshold) dragging = true;
      if (!dragging || performance.now() - lastPublish < 32) return;
      lastPublish = performance.now();
      EventBus.emit('selection-box', { left: Math.min(start.x, e.clientX), top: Math.min(start.y, e.clientY), width: Math.abs(e.clientX - start.x), height: Math.abs(e.clientY - start.y) });
    };
    const up = e => {
      if (!start || e.pointerId !== start.id) return;
      if (dragging && canCommand()) {
        const r = canvas.getBoundingClientRect();
        selectScreenBox(camera, { x1: (start.x-r.left)/r.width, y1: (start.y-r.top)/r.height, x2: (e.clientX-r.left)/r.width, y2: (e.clientY-r.top)/r.height }, start.additive || e.shiftKey);
        blockClick = true;
      }
      cancel();
    };
    // The browser sends click after pointerup. Never turn a finished selection drag into an order.
    const click = e => { if (blockClick) { e.stopImmediatePropagation(); e.preventDefault(); blockClick = false; } };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('click', click, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    EventBus.on('mode-changed', cancel);
    EventBus.on('pause-game', cancel);
    EventBus.on('reset-game', cancel);
    return () => {
      cancel();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('click', click, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      EventBus.off('mode-changed', cancel);
      EventBus.off('pause-game', cancel);
      EventBus.off('reset-game', cancel);
    };
  }, [camera, gl]);
  return null;
}