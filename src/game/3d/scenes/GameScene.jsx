import { Suspense, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { EventBus } from '@/game/EventBus';
import { Battlefield } from '@/game/3d/objects/Battlefield';
import { Soldier } from '@/game/3d/objects/Soldier';
import { CameraRig } from '@/game/3d/objects/CameraRig';
import { NpcManager } from '@/game/3d/objects/NpcManager';
import { gameState } from '@/game/3d/world';

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
      <color attach="background" args={['#0a0e1a']} />
      <fog attach="fog" args={['#0a0e1a', 50, 100]} />

      <ambientLight intensity={0.4} />
      <hemisphereLight intensity={0.3} groundColor="#1a1a2a" color="#4a6a9a" />
      <directionalLight
        castShadow
        position={[15, 30, 10]}
        intensity={1.2}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
      />

      <CameraRig />

      <Suspense fallback={null}>
        <Physics gravity={[0, -20, 0]}>
          <Battlefield />
          <Soldier />
          <NpcManager />
        </Physics>
      </Suspense>
    </>
  );
}