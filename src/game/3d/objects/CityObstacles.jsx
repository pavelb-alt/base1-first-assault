import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { CITY } from '@/game/config';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { terrainHeight } from '@/game/3d/terrain';
import { CITY_OBSTACLES, CITY_OBSTACLE_KINDS } from '@/game/3d/dressing/cityObstacleLayout';

const box = new THREE.BoxGeometry(1, 1, 1);
const materials = {
  concrete: new THREE.MeshStandardMaterial({ color: CITY.concrete, roughness: 0.95 }),
  paint: new THREE.MeshStandardMaterial({ color: CITY.roadMarking, roughness: 0.7 }),
  rust: new THREE.MeshStandardMaterial({ color: '#7a4b33', roughness: 0.85, metalness: 0.3 }),
  dark: new THREE.MeshStandardMaterial({ color: '#3b4142', roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: CITY.glass, roughness: 0.4 }),
  steel: new THREE.MeshStandardMaterial({ color: '#55595a', roughness: 0.6, metalness: 0.5 }),
};

// World matrices for every part, grouped by material (one draw call each).
function buildBatches() {
  const batches = Object.fromEntries(Object.keys(materials).map(k => [k, []]));
  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const o of CITY_OBSTACLES) {
    base.compose(p.set(o.x, terrainHeight(o.x, o.z), o.z), q.setFromAxisAngle(up, o.rot), s.set(1, 1, 1));
    for (const [mat, size, pos, rot = [0, 0, 0]] of CITY_OBSTACLE_KINDS[o.kind].parts) {
      local.compose(p.fromArray(pos), q.setFromEuler(e.fromArray(rot)), s.fromArray(size));
      batches[mat].push(base.clone().multiply(local));
    }
  }
  return batches;
}

function Batch({ material, matrices }) {
  const ref = useRef();
  useLayoutEffect(() => {
    matrices.forEach((m, i) => ref.current.setMatrixAt(i, m));
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [matrices]);
  return <instancedMesh ref={ref} args={[box, material, matrices.length]} castShadow receiveShadow />;
}

// City-only street obstacles: solid to units, bullets and line of sight.
export function CityObstacles() {
  const [city, setCity] = useState(gameState.currentLevel === 5);
  useEffect(() => {
    const update = level => setCity(level === 5);
    EventBus.on('level-changed', update);
    return () => EventBus.off('level-changed', update);
  }, []);
  const batches = useMemo(buildBatches, []);
  if (!city) return null;
  return (
    <RigidBody type="fixed" colliders={false} name="city-obstacles">
      {CITY_OBSTACLES.map((o, i) => {
        const [half, cy] = CITY_OBSTACLE_KINDS[o.kind].collider;
        return <CuboidCollider key={i} args={half} position={[o.x, terrainHeight(o.x, o.z) + cy, o.z]} rotation={[0, o.rot, 0]} />;
      })}
      <group name="City street obstacles">
        {Object.entries(batches).map(([k, m]) => m.length > 0 && <Batch key={k} material={materials[k]} matrices={m} />)}
      </group>
    </RigidBody>
  );
}