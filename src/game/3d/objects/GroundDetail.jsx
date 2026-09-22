import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { WINTER, CITY } from '@/game/config';
import { GROUND_DETAIL } from '@/game/3d/dressing/groundDetailLayout';

const geometries = {
  pebble: new THREE.IcosahedronGeometry(0.5, 0),
  stone: new THREE.DodecahedronGeometry(0.5, 0),
  tuft: new THREE.ConeGeometry(0.5, 1, 3),
  mound: new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
  rim: new THREE.TorusGeometry(0.5, 0.09, 4, 14),
  plank: new THREE.BoxGeometry(1, 1, 1),
  casing: new THREE.CylinderGeometry(0.5, 0.5, 1, 5),
};
const material = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
const metal = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 });

// Per-level palettes; night reuses the day set and darkens it.
const PALETTES = {
  day: { pebble: ['#8e8370', '#a39580', '#6f685c'], stone: ['#7d796c', '#8d8677', '#6a665d'], tuft: ['#7d7f55', '#8f8a5a', '#6b6f47', '#a09a66'],
    mound: ['#9d8d6f', '#8d7e63'], rim: ['#6e604c', '#7b6c55'], plank: ['#5a4a38', '#4d4c47', '#6a5842'], casing: ['#b8923f', '#9c7c3a'] },
  forest: { pebble: ['#6b6a58', '#7c7a66', '#5b5b4c'], stone: ['#636a5a', '#77786a', '#5a5f52'], tuft: ['#4f7a3a', '#5f8a40', '#3f6a33', '#708f45'],
    mound: ['#5d5a3e', '#4f5236'], rim: ['#4a4331', '#57503b'], plank: ['#4e3f2f', '#3f3a31', '#5b4a37'], casing: ['#b8923f', '#9c7c3a'] },
  city: { pebble: ['#9a9b94', '#85887f', '#b0b0a6'], stone: ['#a1a29b', '#8a8e88', '#b8b7ad'], tuft: ['#6e7552'],
    mound: ['#8e8e87', '#7c7f7b'], rim: ['#5c6160', '#6c706d'], plank: [CITY.trim, '#6d706c', '#8a7565'], casing: ['#b8923f', '#9c7c3a'] },
};
const snow = new THREE.Color(WINTER.snowColor), nightTint = new THREE.Color('#6b7a9e');
const SNOW_MIX = { pebble: 0.55, stone: 0.6, tuft: 0.45, mound: 0.85, rim: 0.7, plank: 0.5, casing: 0.2 };

function DetailBatch({ kind, items, level }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      o.position.fromArray(it.position); o.scale.fromArray(it.scale); o.rotation.fromArray(it.rotation); o.updateMatrix();
      ref.current.setMatrixAt(i, o.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items]);
  useLayoutEffect(() => {
    const set = PALETTES[level === 3 ? 'forest' : level === 5 ? 'city' : 'day'][kind], c = new THREE.Color();
    items.forEach((it, i) => {
      c.set(set[it.tone % set.length]).multiplyScalar(0.86 + ((it.tone * 37) % 11) / 36);
      if (level === 4) c.lerp(snow, SNOW_MIX[kind]);
      if (level === 2) c.multiply(nightTint);
      ref.current.setColorAt(i, c);
    });
    ref.current.instanceColor.needsUpdate = true;
  }, [items, kind, level]);
  // Weeds do not grow through city pavement.
  return <instancedMesh ref={ref} name={`Ground detail ${kind}`} args={[geometries[kind], kind === 'casing' ? metal : material, items.length]}
    visible={!(level === 5 && kind === 'tuft')} receiveShadow raycast={() => null} />;
}

export function GroundDetail() {
  const [level, setLevel] = useState(gameState.currentLevel);
  useEffect(() => {
    EventBus.on('level-changed', setLevel);
    return () => EventBus.off('level-changed', setLevel);
  }, []);
  return <group name="Battlefield ground detail" dispose={null}>
    {Object.entries(GROUND_DETAIL).map(([kind, items]) => <DetailBatch key={kind} kind={kind} items={items} level={level} />)}
  </group>;
}