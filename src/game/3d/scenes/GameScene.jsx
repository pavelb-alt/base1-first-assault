import { Suspense, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import { EventBus } from '@/game/EventBus';

/**
 * Intentionally minimal starter scene — replace its contents when building a
 * real game. It demonstrates the three building blocks of the 3D stack:
 *   - three.js objects as JSX (lights, meshes) via React Three Fiber
 *   - camera interaction via drei (<OrbitControls />)
 *   - physics via rapier: the cube falls and settles on the fixed ground
 * Per-frame gameplay logic goes in child components via useFrame((state, delta) => ...).
 */
export function GameScene() {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    // Same contract as the 2D flavor: tell React the scene is live.
    EventBus.emit('current-scene-ready', scene);
  }, [scene]);

  return (
    <>
      <ambientLight intensity={0.6} />
      {/* shadow-camera-* uses R3F's dashed "pierced props" syntax; the default
          10-unit shadow frustum is smaller than the 12×12 ground, so widen it. */}
      <directionalLight
        castShadow
        position={[5, 10, 5]}
        intensity={1.5}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={10}
      />
      <OrbitControls makeDefault />

      {/* Physics suspends while the rapier WASM module initializes. */}
      <Suspense fallback={null}>
        <Physics>
          {/* Fixed ground; colliders are auto-generated from meshes ("cuboid" by default). */}
          <RigidBody type="fixed">
            <mesh receiveShadow position={[0, -0.5, 0]}>
              <boxGeometry args={[12, 1, 12]} />
              <meshStandardMaterial color="#1e293b" />
            </mesh>
          </RigidBody>

          {/* Dynamic cube that tumbles onto the ground. */}
          <RigidBody position={[0, 4, 0]} rotation={[0.4, 0.2, 0]}>
            <mesh castShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#38bdf8" />
            </mesh>
          </RigidBody>
        </Physics>
      </Suspense>
    </>
  );
}
