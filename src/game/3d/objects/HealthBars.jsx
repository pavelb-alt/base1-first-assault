import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { combat } from '@/game/3d/combat';
import { ENEMY_TYPES, SOLDIER, TANK } from '@/game/config';
import { gameState } from '@/game/3d/world';

const BAR_WIDTH = 1.0;
const BAR_HEIGHT = 0.12;
const BAR_OFFSET = 0.35; // gap above the unit
const NEAR_HIDE = 5;      // bars closer than this to the camera are hidden
const DIST_SCALE = 0.016, MIN_SCALE = 0.45, MAX_SCALE = 1.8;

function unitTopY(entry) {
  if (entry.type === 'tank') return TANK.colliderY * 2 + 1.0 + BAR_OFFSET;
  if (entry.type === 'artillery') return 2.6 + BAR_OFFSET;
  if (entry.type === 'trilobite') return ENEMY_TYPES.trilobite.colliderY * 2.4 * (entry.visualScale ?? 1) + BAR_OFFSET;
  if (entry.type === 'eyedrone') return ENEMY_TYPES.eyedrone.hoverHeight + 1.2 + BAR_OFFSET;
  if (entry.type === 'quadshell' || entry.type === 'spider403') return ENEMY_TYPES.quadshell.colliderY * 2 + BAR_OFFSET;
  return SOLDIER.colliderY * 2 + BAR_OFFSET;
}

const FRIENDLY_COLOR = new THREE.Color('#22c55e');
const ENEMY_COLOR = new THREE.Color('#ef4444');
const ELITE_COLOR = new THREE.Color('#f59e0b');
const BG_COLOR = new THREE.Color('#1a1a1a');

// Shared geometry — a horizontal bar centered on origin, anchored left for fill scaling
// Left edge at the origin so scaling X drains the fill from right to left.
const bgGeo = new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT).translate(BAR_WIDTH / 2, 0, 0);
const fillGeo = new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT).translate(BAR_WIDTH / 2, 0, 0);
const camRight = new THREE.Vector3();

const dummy = new THREE.Object3D();
const camPos = new THREE.Vector3();

export function HealthBars() {
  const camera = useThree((s) => s.camera);
  const bgRef = useRef();
  const fillRef = useRef();
  const MAX = 200; // enough for all possible units
  const bgMat = useMemo(() => new THREE.MeshBasicMaterial({ color: BG_COLOR, depthTest: false, transparent: true, opacity: 0.85 }), []);
  const fillMat = useMemo(() => new THREE.MeshBasicMaterial({ depthTest: false, transparent: true }), []);

  useFrame(() => {
    if (gameState.paused) return;
    camera.getWorldPosition(camPos);
    camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);

    const bg = bgRef.current;
    const fill = fillRef.current;
    if (!bg || !fill) return;

    let count = 0;
    for (const u of combat.units) {
      if (!u.alive || !u.bodyRef?.current) continue;
      if (gameState.possessedSoldierId === u.id) continue;
      if (count >= MAX) break;

      const p = u.bodyRef.current.translation();
      const y = unitTopY(u);

      // Screen-aligned billboard sized by camera distance: legible from the strategic
      // camera, never a giant slab right in front of a low or third-person camera.
      const dist = Math.hypot(p.x - camPos.x, y - camPos.y, p.z - camPos.z);
      if (dist < NEAR_HIDE) continue;
      const k = THREE.MathUtils.clamp(dist * DIST_SCALE, MIN_SCALE, MAX_SCALE);
      const wide = (u.elite ? 3 : 1) * k, tall = (u.elite ? 1.6 : 1) * k;
      dummy.position.set(p.x, y, p.z).addScaledVector(camRight, -BAR_WIDTH * wide / 2);
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.set(wide, tall, 1);
      dummy.updateMatrix();
      bg.setMatrixAt(count, dummy.matrix);

      // Fill: same position, scale X by health fraction (geometry is left-anchored)
      const pct = Math.max(0, Math.min(1, u.health / u.maxHealth));
      dummy.scale.set(pct * wide, tall, 1);
      dummy.updateMatrix();
      fill.setMatrixAt(count, dummy.matrix);

      // Color by team
      const col = u.team === 'friendly' ? FRIENDLY_COLOR : u.elite ? ELITE_COLOR : ENEMY_COLOR;
      fill.setColorAt(count, col);

      count++;
    }

    bg.count = count;
    fill.count = count;
    bg.instanceMatrix.needsUpdate = true;
    fill.instanceMatrix.needsUpdate = true;
    if (fill.instanceColor) fill.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={bgRef} args={[bgGeo, bgMat, MAX]} frustumCulled={false} renderOrder={999} />
      <instancedMesh ref={fillRef} args={[fillGeo, fillMat, MAX]} frustumCulled={false} renderOrder={1000} />
    </>
  );
}