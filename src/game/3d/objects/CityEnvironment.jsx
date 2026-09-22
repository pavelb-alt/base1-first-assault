import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { CITY_LAYOUT } from '@/game/3d/dressing/cityLayout';

const box = new THREE.BoxGeometry(1, 1, 1);
const concrete = new THREE.MeshStandardMaterial({ roughness: 0.92 });
const glass = new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0.1 });
const glow = new THREE.MeshBasicMaterial({ toneMapped: false });
function CityBatch({ items, material, name }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const obj = new THREE.Object3D(), color = new THREE.Color();
    items.forEach((item, i) => {
      obj.position.fromArray(item.position); obj.scale.fromArray(item.scale);
      obj.rotation.set(0, 0, item.rotation); obj.updateMatrix();
      ref.current.setMatrixAt(i, obj.matrix);
      ref.current.setColorAt(i, color.set(item.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} name={name} args={[box, material, items.length]} receiveShadow raycast={() => null} />;
}
export function CityEnvironment() {
  return <group name="City skyline and streets" dispose={null}>
    <CityBatch items={CITY_LAYOUT.structure} material={concrete} name="City buildings and street fixtures" />
    <CityBatch items={CITY_LAYOUT.windows} material={glass} name="City facade windows" />
    <CityBatch items={CITY_LAYOUT.lights} material={glow} name="City illuminated windows and lamps" />
  </group>;
}