import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { ABILITIES, TOWER_DEFENSE } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { battle } from '@/game/3d/battleMetrics';
import { terrainHeight } from '@/game/3d/terrain';
import { towerDefenseState, towerStats } from '@/game/3d/towerDefenseState';
import { tacticalState, resetTactical } from '@/game/3d/abilities/tacticalState';
import { abilityState, updateAbilities, resetAbilities } from '@/game/3d/abilities/abilities';

// In-canvas half of the strategic interaction layer: ground cursor tracking, tower
// placement ghost, range previews, ability targeting rings and strike telegraphs.
const ringGeo = new THREE.RingGeometry(0.94, 1, 72).rotateX(-Math.PI / 2);
const thinRingGeo = new THREE.RingGeometry(0.975, 1, 72).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const crossGeo = new THREE.PlaneGeometry(0.18, 2.4).rotateX(-Math.PI / 2);
const ghostBaseGeo = new THREE.CylinderGeometry(0.9, 1, 0.45, 12);
const ghostHeadGeo = new THREE.BoxGeometry(0.8, 0.45, 0.8);
const ghostBarrelGeo = new THREE.CylinderGeometry(0.09, 0.09, 1, 8).rotateX(Math.PI / 2);
const mat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
const VALID = '#5eead4', INVALID = '#f87171';
const ghostMat = mat(VALID, 0.45), ghostRingMat = mat(VALID, 0.55), ghostFillMat = mat(VALID, 0.06);
const previewMat = mat('#f59e0b', 0.6), previewFillMat = mat('#f59e0b', 0.07);
const targetMat = mat('#f87171', 0.8), targetFillMat = mat('#f87171', 0.1);
const strikeMat = mat('#f87171', 0.9), strikeFillMat = mat('#f87171', 0.18), strikeCoreMat = mat('#fde68a', 0.9);
const invalidMat = mat(INVALID, 0.9);
const pulseMats = Array.from({ length: 6 }, () => mat('#ffffff', 0.7));
const noRaycast = () => null;
const ndc = new THREE.Vector2(), ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
const MAX_STRIKES = 4;

function setColor(m, hex) { m.color.set(hex); }

export function TacticalOverlay() {
  const ghost = useRef(), ghostRing = useRef(), ghostFill = useRef();
  const preview = useRef(), previewFill = useRef();
  const target = useRef(), targetFill = useRef();
  const strikes = useRef([]), pulses = useRef([]), invalid = useRef();

  useEffect(() => {
    const reset = () => { resetTactical(); resetAbilities(); };
    const onMode = m => { if (m !== 'strategic') resetTactical(); };
    EventBus.on('reset-game', reset); EventBus.on('level-changed', reset); EventBus.on('mode-changed', onMode);
    return () => { EventBus.off('reset-game', reset); EventBus.off('level-changed', reset); EventBus.off('mode-changed', onMode); };
  }, []);

  useFrame(({ camera, pointer, clock }) => {
    if (!gameState.paused) updateAbilities();
    const strategic = gameState.mode === 'strategic';
    const t = clock.elapsedTime, pulse = 1 + Math.sin(t * 6) * 0.03;
    // Ground cursor (y=0 plane, then terrain height for drawing).
    const c = tacticalState.cursor;
    ndc.set(pointer.x, pointer.y);
    ray.setFromCamera(ndc, camera);
    c.onGround = !!ray.ray.intersectPlane(plane, hit);
    if (c.onGround) { c.x = hit.x; c.z = hit.z; }

    // --- Placement ghost ---
    const placing = strategic && tacticalState.mode === 'place' && c.onGround;
    ghost.current.visible = ghostRing.current.visible = ghostFill.current.visible = placing;
    if (placing) {
      const type = tacticalState.placeType;
      c.problem = towerDefenseState.placementProblem(type, c);
      c.valid = !c.problem;
      const color = c.valid ? VALID : INVALID;
      setColor(ghostMat, color); setColor(ghostRingMat, color); setColor(ghostFillMat, color);
      const y = terrainHeight(c.x, c.z);
      const range = towerStats(type, 1).range;
      ghost.current.position.set(c.x, y, c.z);
      ghost.current.rotation.y = t * 0.6;
      ghostRing.current.position.set(c.x, y + 0.06, c.z); ghostRing.current.scale.setScalar(range * pulse);
      ghostFill.current.position.set(c.x, y + 0.05, c.z); ghostFill.current.scale.setScalar(range);
    }

    // --- Pie-menu hover range preview ---
    const pv = strategic && tacticalState.preview;
    preview.current.visible = previewFill.current.visible = !!pv;
    if (pv) {
      const range = towerStats(pv.type, 1).range, y = terrainHeight(pv.x, pv.z);
      preview.current.position.set(pv.x, y + 0.06, pv.z); preview.current.scale.setScalar(range * pulse);
      previewFill.current.position.set(pv.x, y + 0.05, pv.z); previewFill.current.scale.setScalar(range);
    }

    // --- Ability targeting ring ---
    const aiming = strategic && tacticalState.mode === 'ability' && c.onGround;
    target.current.visible = targetFill.current.visible = aiming;
    if (aiming) {
      const cfg = ABILITIES[tacticalState.abilityId];
      const color = cfg?.color ?? '#f87171', radius = cfg?.radius ?? 6;
      setColor(targetMat, color); setColor(targetFillMat, color);
      const y = terrainHeight(c.x, c.z);
      target.current.position.set(c.x, y + 0.08, c.z); target.current.scale.setScalar(radius * pulse);
      target.current.rotation.y = t * 0.8;
      targetFill.current.position.set(c.x, y + 0.07, c.z); targetFill.current.scale.setScalar(radius);
    }

    // --- Orbital strike telegraphs: shrinking ring converging on the impact point ---
    for (let i = 0; i < MAX_STRIKES; i++) {
      const g = strikes.current[i], s = abilityState.strikes[i];
      if (!g) continue;
      g.visible = !!s;
      if (!s) continue;
      const k = Math.min(1, (battle.elapsed - s.startedAt) / Math.max(0.01, s.detonateAt - s.startedAt));
      const y = terrainHeight(s.x, s.z) + 0.1;
      g.position.set(s.x, y, s.z);
      g.children[0].scale.setScalar(s.radius);
      g.children[1].scale.setScalar(s.radius * (1.6 - k * 0.6));
      g.children[2].scale.setScalar(s.radius * k);
      g.children[3].scale.set(1, 1, 1 + k * 3); g.children[3].visible = Math.sin(t * 30) > -0.2;
      g.rotation.y = t * 2;
    }

    // --- Expanding pulses (repair, orbital shockwave) ---
    for (let i = 0; i < pulses.current.length; i++) {
      const m = pulses.current[i], p = abilityState.pulses[i];
      if (!m) continue;
      m.visible = !!p;
      if (!p) continue;
      const k = Math.min(1, (battle.elapsed - p.startedAt) / p.life);
      m.position.set(p.x, terrainHeight(p.x, p.z) + 0.12, p.z);
      m.scale.setScalar(p.radius * (0.2 + k * 0.9));
      setColor(m.material, p.color); m.material.opacity = 0.75 * (1 - k);
    }

    // --- Refused placement flash ---
    const inv = tacticalState.invalid;
    const showInvalid = !!inv && performance.now() < inv.until;
    invalid.current.visible = showInvalid;
    if (showInvalid) {
      invalid.current.position.set(inv.x, terrainHeight(inv.x, inv.z) + 0.1, inv.z);
      invalidMat.opacity = 0.9 * ((inv.until - performance.now()) / 700);
    }
  });

  return (
    <group name="tactical-overlay">
      <group ref={ghost} visible={false}>
        <mesh geometry={ghostBaseGeo} material={ghostMat} position={[0, 0.22, 0]} raycast={noRaycast} />
        <mesh geometry={ghostHeadGeo} material={ghostMat} position={[0, 1.05, 0]} raycast={noRaycast} />
        <mesh geometry={ghostBarrelGeo} material={ghostMat} position={[0, 1.05, -0.8]} raycast={noRaycast} />
      </group>
      <mesh ref={ghostRing} geometry={ringGeo} material={ghostRingMat} visible={false} raycast={noRaycast} renderOrder={6} />
      <mesh ref={ghostFill} geometry={discGeo} material={ghostFillMat} visible={false} raycast={noRaycast} renderOrder={5} />
      <mesh ref={preview} geometry={ringGeo} material={previewMat} visible={false} raycast={noRaycast} renderOrder={6} />
      <mesh ref={previewFill} geometry={discGeo} material={previewFillMat} visible={false} raycast={noRaycast} renderOrder={5} />
      <mesh ref={target} geometry={ringGeo} material={targetMat} visible={false} raycast={noRaycast} renderOrder={6} />
      <mesh ref={targetFill} geometry={discGeo} material={targetFillMat} visible={false} raycast={noRaycast} renderOrder={5} />
      {Array.from({ length: MAX_STRIKES }, (_, i) => (
        <group key={i} ref={el => (strikes.current[i] = el)} visible={false}>
          <mesh geometry={ringGeo} material={strikeMat} raycast={noRaycast} renderOrder={6} />
          <mesh geometry={thinRingGeo} material={strikeMat} raycast={noRaycast} renderOrder={6} />
          <mesh geometry={discGeo} material={strikeFillMat} raycast={noRaycast} renderOrder={5} />
          <group>
            <mesh geometry={crossGeo} material={strikeCoreMat} raycast={noRaycast} renderOrder={7} />
            <mesh geometry={crossGeo} material={strikeCoreMat} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast} renderOrder={7} />
          </group>
        </group>
      ))}
      {pulseMats.map((m, i) => (
        <mesh key={i} ref={el => (pulses.current[i] = el)} geometry={ringGeo} material={m} visible={false} raycast={noRaycast} renderOrder={6} />
      ))}
      <group ref={invalid} visible={false}>
        <mesh geometry={crossGeo} material={invalidMat} rotation={[0, Math.PI / 4, 0]} raycast={noRaycast} renderOrder={7} />
        <mesh geometry={crossGeo} material={invalidMat} rotation={[0, -Math.PI / 4, 0]} raycast={noRaycast} renderOrder={7} />
        <mesh geometry={ringGeo} material={invalidMat} scale={TOWER_DEFENSE.minSpacing * 0.5} raycast={noRaycast} renderOrder={7} />
      </group>
    </group>
  );
}
