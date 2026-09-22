import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ARTILLERY } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { visitNearby } from '@/game/3d/spatial';
import { applyImpact } from '@/game/3d/ballistics';
import { artilleryState } from '@/game/3d/objects/artilleryState';

const MAX = 24;
const shellGeometry = new THREE.SphereGeometry(0.22, 8, 6);
const shellMaterial = new THREE.MeshBasicMaterial({ color: ARTILLERY.shellColor, toneMapped: false });
const trailMaterial = new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false });
const o = new THREE.Object3D();
const victims = [];
const DOWN = [0, -1, 0];

function arc(s, t, out) {
  out.set(s.from[0] + (s.to[0] - s.from[0]) * t, s.from[1] + (s.to[1] - s.from[1]) * t + 4 * s.apex * t * (1 - t), s.from[2] + (s.to[2] - s.from[2]) * t);
  return out;
}
function detonate(s) {
  const [x, y, z] = s.to;
  artilleryState.blasts.push([x, y, z]); artilleryState.impacts++;
  victims.length = 0;
  visitNearby(x, z, ARTILLERY.splashRadius, (u, _p, d2) => { if (u.team === 'enemy' && u.alive) victims.push([u, Math.sqrt(d2)]); });
  for (const [unit, d] of victims) {
    const p = unit.bodyRef.current?.translation(); if (!p) continue;
    const damage = Math.round(s.damage * (1 - 0.6 * d / ARTILLERY.splashRadius));
    applyImpact({ unit, point: { x: p.x, y: p.y + unit.aimHeight, z: p.z } }, { team: 'friendly', shooterId: s.shooterId, damage, direction: DOWN });
  }
}

// Pooled shells flying ballistic arcs; splash damage on landing.
export function ArtilleryShells() {
  const shells = useRef(), trails = useRef();
  useFrame((_, delta) => {
    const list = artilleryState.shells;
    if (!gameState.paused) for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]; s.age += delta;
      if (s.age >= s.duration) { detonate(s); list.splice(i, 1); }
    }
    let count = 0;
    for (const s of list) {
      if (count >= MAX) break;
      const t = s.age / s.duration;
      arc(s, t, o.position); o.scale.setScalar(1); o.updateMatrix(); shells.current.setMatrixAt(count, o.matrix);
      arc(s, Math.max(0, t - 0.025), o.position); o.scale.set(0.6, 0.6, 0.6); o.updateMatrix(); trails.current.setMatrixAt(count, o.matrix);
      count++;
    }
    shells.current.count = trails.current.count = count;
    shells.current.instanceMatrix.needsUpdate = trails.current.instanceMatrix.needsUpdate = true;
  });
  return <group name="Artillery shells">
    <instancedMesh ref={shells} args={[shellGeometry, shellMaterial, MAX]} count={0} frustumCulled={false} />
    <instancedMesh ref={trails} args={[shellGeometry, trailMaterial, MAX]} count={0} frustumCulled={false} />
  </group>;
}