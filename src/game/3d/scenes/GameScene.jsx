import { Suspense, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { EventBus } from '@/game/EventBus';
import { Battlefield } from '@/game/3d/objects/Battlefield';
import { Soldier } from '@/game/3d/objects/Soldier';
import { CameraRig } from '@/game/3d/objects/CameraRig';
import { NpcManager } from '@/game/3d/objects/NpcManager';
import { gameState } from '@/game/3d/world';
import { SOLDIER } from '@/game/config';

export function GameScene() {
  const scene = useThree((state) => state.scene);

  // Scene-ready signal
  useEffect(() => {
    EventBus.emit('current-scene-ready', scene);
  }, [scene]);

  // window.game API for verification
  useEffect(() => {
    window.game = {
      ready: false,
      getMode: () => gameState.mode,
      getSoldierPosition: () => ({
        x: gameState.soldierPosition.x,
        y: gameState.soldierPosition.y,
        z: gameState.soldierPosition.z,
      }),
      isSelected: () => gameState.selected,
      possess: () => EventBus.emit('possess-soldier'),
      release: () => EventBus.emit('release-soldier'),
    };
    const id = setTimeout(() => { if (window.game) window.game.ready = true; }, 1000);
    return () => { clearTimeout(id); delete window.game; };
  }, []);

  return (
    <>
      <color attach="background" args={['#87ceeb']} />
      <fog attach="fog" args={['#87ceeb', 90, 180]} />

      <ambientLight intensity={0.6} />
      <hemisphereLight intensity={0.5} groundColor="#8a9a6a" color="#b0d0ff" />
      <directionalLight
        castShadow
        position={[30, 50, 20]}
        intensity={1.5}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-bias={-0.0005}
      />

      <CameraRig />

      <Suspense fallback={null}>
        <Physics gravity={[0, SOLDIER.gravity, 0]}>
          <Battlefield />
          <Soldier />
          <NpcManager />
        </Physics>
      </Suspense>
    </>
  );
}