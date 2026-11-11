import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getAtmosphere, MAP, PERFORMANCE, SKY } from '@/game/config';
import { AtmosphericHaze } from '@/game/3d/objects/AtmosphericHaze';
import { gameState } from '@/game/3d/world';
import { createSkyMaterial } from '@/game/3d/vfx/skyMaterial';
import { useRenderQuality } from '@/game/3d/vfx/quality';
import { useLevel } from '@/game/3d/vfx/useLevel';

const skyGeometry = new THREE.SphereGeometry(1, 48, 24);
const noRaycast = () => null;

export function GoldenHourAtmosphere() {
  const level = useLevel();
  const { preset } = useRenderQuality();
  const C = getAtmosphere(level);
  const look = SKY[level] ?? SKY[1];
  const isNight = level === 2;
  const sun = useRef(null);

  const sky = useMemo(() => createSkyMaterial(C, look), [C, look]);
  useEffect(() => () => sky.dispose(), [sky]);
  useEffect(() => { sky.uniforms.clouds.value = preset.clouds ? look.clouds : 0; }, [sky, look, preset]);
  useFrame((_, delta) => { if (!gameState.paused) sky.uniforms.time.value += delta; });

  // Live shadow quality: resizing requires dropping the old depth target; the
  // renderer reallocates it on the next shadow pass. Type stays PCF (no recompiles).
  // mapSize/radius are deliberately not JSX props so only this effect owns them.
  useLayoutEffect(() => {
    const light = sun.current;
    if (!light) return;
    const size = preset.shadowMapSize;
    light.shadow.radius = preset.shadowRadius;
    if (light.shadow.mapSize.x !== size) {
      light.shadow.mapSize.set(size, size);
      if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
    }
    light.shadow.needsUpdate = true;
  }, [preset]);

  return <>
    <color attach="background" args={[C.horizon]} />
    <fog attach="fog" args={[C.horizon, C.fogNear, C.fogFar]} />
    <mesh name="Procedural sky dome" geometry={skyGeometry} material={sky} raycast={noRaycast} renderOrder={-100} frustumCulled={false} />
    <AtmosphericHaze atmosphere={C} night={isNight} />
    <ambientLight intensity={C.ambient} />
    <hemisphereLight intensity={C.hemisphere} color={C.skyColor} groundColor={C.groundColor} />
    <directionalLight ref={sun} name={isNight ? "Moonlight" : "Golden-hour sun"} castShadow={PERFORMANCE.shadows} position={C.sunPosition} color={C.sun} intensity={C.sunIntensity}
      shadow-camera-left={-MAP.HALF-25} shadow-camera-right={MAP.HALF+25}
      shadow-camera-top={MAP.HALF+25} shadow-camera-bottom={-MAP.HALF-25}
      shadow-camera-near={1} shadow-camera-far={450} shadow-bias={-0.0003} shadow-normalBias={0.035} />
  </>;
}
