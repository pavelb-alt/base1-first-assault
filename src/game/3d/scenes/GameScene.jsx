import { Suspense, useEffect, useState } from 'react';
import { GameRuntime } from '@/game/3d/GameRuntime';
import { StationControlSystem } from '@/game/3d/StationControlSystem';
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
import { BattlefieldExplosions } from '@/game/3d/objects/BattlefieldExplosions';
import { HealthBars } from '@/game/3d/objects/HealthBars';
import { CargoShipManager } from '@/game/3d/objects/CargoShipManager';
import { SkyBattle } from '@/game/3d/objects/SkyBattle';
import { BackgroundBattle } from '@/game/3d/objects/BackgroundBattle';
import { TowerManager } from '@/game/3d/objects/TowerManager';
import { TankDeliveryManager, TankEntityManager } from '@/game/3d/objects/TankManager';
import { ArtilleryDeliveryManager, ArtilleryEntityManager, ArtilleryShells } from '@/game/3d/objects/ArtilleryManager';
import { gameState } from '@/game/3d/world';
import { SelectionSystem } from '@/game/3d/objects/SelectionSystem';
import { FRONT } from '@/game/config';
import { GoldenHourAtmosphere } from '@/game/3d/objects/GoldenHourAtmosphere';
import { NightIlluminationFlares } from '@/game/3d/objects/NightIlluminationFlares';
import { WinterSnow } from '@/game/3d/objects/WinterSnow';
import { CinematicEffects } from '@/game/3d/CinematicEffects';
import { VfxSystem } from '@/game/3d/vfx/VfxSystem';
import { AudioListenerBridge } from '@/game/audio/AudioListenerBridge';

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
      <GoldenHourAtmosphere />
      <NightIlluminationFlares />
      <WinterSnow />
      <VfxSystem />

      <CameraRig />
      <AudioListenerBridge />

      <Suspense fallback={null}>
        <Physics gravity={[0, -FRONT.gravity, 0]} paused={paused}>
          <Battlefield />
          <FriendlySoldierManager />
          <NpcManager />
          <ProjectileManager />
          <WeaponEffects />
          <BattlefieldExplosions />
          <HealthBars />
          <TankEntityManager />
          <ArtilleryEntityManager />
          <ArtilleryShells />
          <SelectionSystem />
          <StationControlSystem />
          <GameRuntime />
        </Physics>
        <CargoShipManager />
        <TankDeliveryManager />
        <ArtilleryDeliveryManager />
        <SkyBattle />
        <BackgroundBattle />
        <TowerManager />
        <CinematicEffects />
      </Suspense>
    </>
  );
}