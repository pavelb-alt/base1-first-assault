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
  // BufferGeometry has no merge() method in current Three.js.
  // Flatten the three beams and combine matching vertex attributes once.
  const parts = geos.map(g => g.toNonIndexed());
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const attributes = parts.map(g => g.getAttribute(name));
    const values = new Float32Array(attributes.reduce((n, a) => n + a.array.length, 0));
    let offset = 0;
    for (const attribute of attributes) {
      values.set(attribute.array, offset);
      offset += attribute.array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(values, attributes[0].itemSize));
  }
  for (const geometry of [...geos, ...parts]) geometry.dispose();
  merged.computeBoundingSphere();
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