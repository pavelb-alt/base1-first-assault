import { Suspense, useEffect, useState } from 'react';
import { GameRuntime } from '@/game/3d/GameRuntime';
import { clearInput } from '@/game/3d/input';
import { useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { EventBus } from '@/game/EventBus';
import { Battlefield } from '@/game/3d/objects/Battlefield';
import { FriendlySoldierManager } from '@/game/3d/objects/FriendlySoldierManager';
import { CameraRig } from '@/game/3d/objects/CameraRig';
import { NpcManager } from '@/game/3d/objects/NpcManager';
import { ProjectileManager } from '@/game/3d/objects/ProjectileManager';
import { WeaponEffects } from '@/game/3d/objects/WeaponEffects';
import { HealthBars } from '@/game/3d/objects/HealthBars';
import { gameState } from '@/game/3d/world';
import { FRONT, MAP } from '@/game/config';

export function GameScene() {
  const scene = useThree((state) => state.scene);

  // Scene-ready signal
  useEffect(() => {
    EventBus.emit('current-scene-ready', scene);
  }, [scene]);

  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const pause = () => { clearInput(); gameState.paused = true; setPaused(true); };
    const resume = () => { clearInput(); gameState.paused = false; setPaused(false); };
    EventBus.on('pause-game', pause); EventBus.on('resume-game', resume); EventBus.on('reset-game', resume);
    return () => { EventBus.off('pause-game', pause); EventBus.off('resume-game', resume); EventBus.off('reset-game', resume); };
  }, []);

  return (
    <>
      <color attach="background" args={['#87ceeb']} />
      <fog attach="fog" args={['#87ceeb', 500, 1100]} />

      <ambientLight intensity={0.6} />
      <hemisphereLight intensity={0.5} groundColor="#8a9a6a" color="#b0d0ff" />
      <directionalLight
        castShadow
        position={[80, 180, 100]}
        intensity={1.5}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-MAP.HALF-10}
        shadow-camera-right={MAP.HALF+10}
        shadow-camera-top={MAP.HALF+10}
        shadow-camera-bottom={-MAP.HALF-10}
        shadow-camera-near={1}
        shadow-camera-far={800}
        shadow-bias={-0.0005}
      />

      <CameraRig />

      <Suspense fallback={null}>
        <Physics gravity={[0, -FRONT.gravity, 0]} paused={paused}>
          <Battlefield />
          <FriendlySoldierManager />
          <NpcManager />
          <ProjectileManager />
          <WeaponEffects />
          <HealthBars />
          <GameRuntime />
        </Physics>
      </Suspense>
    </>
  );
}