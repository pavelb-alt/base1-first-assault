import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FRONT, MAP } from '@/game/config';

// Czech hedgehog: three crossed steel beams forming an X seen from any angle.
const beamGeometry = new THREE.BoxGeometry(2.6, 0.12, 0.12);
const beamMaterial = new THREE.MeshStandardMaterial({ color: '#3a3d3a', roughness: 0.8, metalness: 0.4 });

function hedgehogGeometry() {
  const geos = [];
  for (let i = 0; i < 3; i++) {
    const g = beamGeometry.clone();
    const m = new THREE.Matrix4();
    const e = new THREE.Euler(i === 1 ? Math.PI / 3 : 0, (i * Math.PI) / 3, i === 2 ? Math.PI / 3 : 0);
    m.makeRotationFromEuler(e);
    g.applyMatrix4(m);
    geos.push(g);
  }
  const merged = geos[0].clone();
  for (let i = 1; i < geos.length; i++) merged.merge(geos[i]);
  return merged;
}

export function AntiTankObstacles() {
  const meshRef = useRef();
  const hedgeGeo = useMemo(() => hedgehogGeometry(), []);

  // Place a line of hedgehogs ahead of the first barbed wire belt (closer to No Man's Land).
  const count = 24;
  const z = FRONT.rows[2] - 14; // ahead of the wire belts (z=7 and z=3.5)
  const spread = MAP.HALF * 0.82;

  useLayoutEffect(() => {
    const marker = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const x = -spread + i * (spread * 2 / (count - 1));
      marker.position.set(x + (i % 2 ? 0.8 : -0.6), 0.6, z + (i % 3 - 1) * 0.5);
      marker.rotation.y = (i * 0.7) % (Math.PI / 2);
      marker.updateMatrix();
      meshRef.current.setMatrixAt(i, marker.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [z, spread, count]);

  return (
    <instancedMesh ref={meshRef} args={[hedgeGeo, beamMaterial, count]} castShadow frustumCulled={false} />
  );
}