import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { MAP, NIGHT_FLARES } from '@/game/config';

const flareGeometry = new THREE.SphereGeometry(0.32, 10, 8);
const haloGeometry = new THREE.SphereGeometry(0.75, 10, 8);
const flareMaterial = new THREE.MeshBasicMaterial({ color: NIGHT_FLARES.color, toneMapped: false });
const haloMaterial = new THREE.MeshBasicMaterial({
  color: NIGHT_FLARES.color,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  toneMapped: false,
});

function nextDelay() {
  return NIGHT_FLARES.minInterval + Math.random() * (NIGHT_FLARES.maxInterval - NIGHT_FLARES.minInterval);
}

export function NightIlluminationFlares() {
  const group = useRef();
  const light = useRef();
  const state = useRef({ level: gameState.currentLevel, active: false, age: 0, wait: 2, x: 0, z: 0 });

  useEffect(() => {
    const onLevel = level => {
      const s = state.current;
      s.level = level;
      s.active = false;
      s.age = 0;
      s.wait = level === 2 ? 2 : nextDelay();
      if (group.current) group.current.visible = false;
    };
    EventBus.on('level-changed', onLevel);
    return () => EventBus.off('level-changed', onLevel);
  }, []);

  useFrame((_, delta) => {
    const s = state.current;
    if (gameState.paused || !group.current || !light.current) return;
    if (s.level !== 2) {
      group.current.visible = false;
      light.current.intensity = 0;
      return;
    }

    if (!s.active) {
      s.wait -= delta;
      if (s.wait > 0) return;
      s.active = true;
      s.age = 0;
      s.x = (Math.random() - 0.5) * MAP.SIZE * 0.72;
      s.z = (Math.random() - 0.5) * MAP.SIZE * 0.72;
      group.current.visible = true;
    }

    s.age += delta;
    const launchT = Math.min(1, s.age / NIGHT_FLARES.riseDuration);
    const burnT = Math.max(0, (s.age - NIGHT_FLARES.riseDuration) / NIGHT_FLARES.burnDuration);
    const height = THREE.MathUtils.lerp(1, NIGHT_FLARES.height, 1 - Math.pow(1 - launchT, 2));
    const descent = burnT * NIGHT_FLARES.descent;
    group.current.position.set(s.x + Math.sin(s.age * 0.8) * 1.2, height - descent, s.z);
    const fade = launchT * Math.max(0, 1 - Math.pow(burnT, 3));
    light.current.intensity = NIGHT_FLARES.intensity * fade;
    group.current.scale.setScalar(0.85 + Math.sin(s.age * 22) * 0.12);

    if (s.age >= NIGHT_FLARES.riseDuration + NIGHT_FLARES.burnDuration) {
      s.active = false;
      s.wait = nextDelay();
      group.current.visible = false;
      light.current.intensity = 0;
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={haloGeometry} material={haloMaterial} />
      <mesh geometry={flareGeometry} material={flareMaterial} />
      <pointLight ref={light} color={NIGHT_FLARES.color} intensity={0} distance={NIGHT_FLARES.radius} decay={1.5} />
    </group>
  );
}