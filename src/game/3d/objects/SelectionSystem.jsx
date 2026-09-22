import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { COMMANDS } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { terrainHeight } from '@/game/3d/terrain';
import {
  selection, clearSelection, setCommandMode, clearOrders, publishSelection, resetCommands,
} from '@/game/3d/commands';

const ring = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
const dot = new THREE.CircleGeometry(0.18, 16).rotateX(-Math.PI / 2);
const material = color => new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false });
const selectMat = material(COMMANDS.selectColor), moveMat = material(COMMANDS.moveColor), attackMat = material(COMMANDS.attackColor);
const noRaycast = () => null;

// Selection ring, order markers, and command hotkeys (strategic view only).
export function SelectionSystem() {
  const selectRef = useRef(), destRef = useRef(), targetRef = useRef(), hudTimer = useRef(0);

  useEffect(() => {
    const onMode = mode => { if (mode !== 'strategic') clearSelection(); };
    const onSetMode = mode => setCommandMode(mode);
    const onClear = () => clearOrders();
    const onDeselect = () => clearSelection();
    const onKey = e => {
      if (gameState.mode !== 'strategic' || !selection.unit) return;
      if (e.code === 'Escape') clearSelection();
      else if (e.code === 'KeyM') setCommandMode('move');
      else if (e.code === 'KeyT') setCommandMode('target');
      else if (e.code === 'KeyC') clearOrders();
    };
    EventBus.on('mode-changed', onMode);
    EventBus.on('reset-game', resetCommands);
    EventBus.on('set-command-mode', onSetMode);
    EventBus.on('clear-unit-orders', onClear);
    EventBus.on('deselect-unit', onDeselect);
    window.addEventListener('keydown', onKey);
    return () => {
      EventBus.off('mode-changed', onMode);
      EventBus.off('reset-game', resetCommands);
      EventBus.off('set-command-mode', onSetMode);
      EventBus.off('clear-unit-orders', onClear);
      EventBus.off('deselect-unit', onDeselect);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useFrame(({ clock }, delta) => {
    const u = selection.unit;
    if (u && !u.alive) clearSelection();
    const unit = selection.unit, body = unit?.bodyRef.current;
    const show = !!body && gameState.mode === 'strategic';
    selectRef.current.visible = show;
    destRef.current.visible = false;
    targetRef.current.visible = false;
    if (!show) return;

    const pulse = 1 + Math.sin(clock.elapsedTime * 5) * 0.06;
    const p = body.translation();
    selectRef.current.position.set(p.x, p.y + 0.06, p.z);
    selectRef.current.scale.setScalar(COMMANDS.ringScale[unit.type] * pulse);

    const o = unit.order;
    if (o?.type === 'attack' && o.target.alive && o.target.bodyRef.current) {
      const t = o.target.bodyRef.current.translation();
      targetRef.current.position.set(t.x, terrainHeight(t.x, t.z) + 0.08, t.z);
      targetRef.current.scale.setScalar(1.3 * pulse);
      targetRef.current.visible = true;
    } else if (o && (o.type === 'bombard' || !o.arrived)) {
      destRef.current.position.set(o.x, terrainHeight(o.x, o.z) + 0.08, o.z);
      destRef.current.scale.setScalar(o.type === 'bombard' ? 2 : 0.9);
      destRef.current.children[0].material = o.type === 'bombard' ? attackMat : moveMat;
      destRef.current.visible = true;
    }

    hudTimer.current += delta;
    if (hudTimer.current >= COMMANDS.hudInterval) { hudTimer.current = 0; publishSelection(); }
  });

  return (
    <>
      <mesh ref={selectRef} geometry={ring} material={selectMat} raycast={noRaycast} renderOrder={5} />
      <group ref={destRef}>
        <mesh geometry={ring} material={moveMat} raycast={noRaycast} renderOrder={5} />
        <mesh geometry={dot} material={moveMat} raycast={noRaycast} renderOrder={5} />
      </group>
      <mesh ref={targetRef} geometry={ring} material={attackMat} raycast={noRaycast} renderOrder={5} />
    </>
  );
}