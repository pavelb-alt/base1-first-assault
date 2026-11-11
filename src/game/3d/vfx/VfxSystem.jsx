import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EventBus } from '@/game/EventBus';
import { gameEvents } from '@/game/gameEvents';
import { gameState } from '@/game/3d/world';
import * as THREE from 'three';
import { particleClock, setParticleLightTint } from '@/game/3d/vfx/particles';
import { layers, lightSlots, updateEmitters, clearEffects, setVfxCamera, vehicleExplosion, alienDeath, soldierDown, explosion } from '@/game/3d/vfx/effects';
import { vfxStats } from '@/game/3d/vfx/stats';
import { useRenderQuality } from '@/game/3d/vfx/quality';
import { useLevel } from '@/game/3d/vfx/useLevel';

const ALIENS = new Set(['quadshell', 'spider403', 'eyedrone', 'trilobite']);
const lightKeys = [0, 1, 2, 3];
// How much scene light falls on smoke/dust per level (1 day … 5 city).
// Unlit particles sit beside sun-lit geometry, so daytime levels lift them above albedo.
const VOLUME_LIGHT = { 1: ['#fff4e6', 1.6], 2: ['#8a96b8', 1], 3: ['#cdd8c0', 1.3], 4: ['#f2f8ff', 1.7], 5: ['#e6e9ea', 1.5] };
const volumeTint = new THREE.Color();

// Owns the pooled GPU particle layers and the fixed light pool, advances the
// shared particle clock and turns presentation events into effects. Listeners
// only spawn visuals; they never touch gameplay state.
export function VfxSystem() {
  const { preset } = useRenderQuality();
  const lightCount = Math.min(lightKeys.length, preset.dynamicLights);
  const lights = useRef([]);
  const frame = useRef(0);
  const level = useLevel();
  useEffect(() => { const [hex, scale] = VOLUME_LIGHT[level] ?? VOLUME_LIGHT[1]; setParticleLightTint(volumeTint.set(hex).multiplyScalar(scale)); }, [level]);

  useEffect(() => {
    const onKill = e => {
      if (e.targetType === 'tank' || e.targetType === 'artillery') vehicleExplosion(e.x, e.z, e.targetType === 'tank' ? 2.4 : 2.1);
      else if (ALIENS.has(e.targetType)) alienDeath(e.x, e.y, e.z, e.targetType);
      else if (e.targetType === 'soldier') soldierDown(e.x, e.z);
    };
    // 'shell' and 'ambient' blasts are already drawn by BattlefieldExplosions.
    const onExplosion = e => {
      if (e.kind === 'vehicle') vehicleExplosion(e.x, e.z, Math.max(1.6, e.size ?? 2.2));
      else if (e.kind === 'tower-splash') explosion(e.x, e.z, Math.min(1, (e.size ?? 1) * 0.6), 'splash');
    };
    const clear = () => { particleClock.value += 1000; clearEffects(); };
    const offKill = gameEvents.on('kill', onKill);
    const offExplosion = gameEvents.on('explosion', onExplosion);
    EventBus.on('reset-game', clear); EventBus.on('level-changed', clear);
    return () => { offKill(); offExplosion(); EventBus.off('reset-game', clear); EventBus.off('level-changed', clear); };
  }, []);

  useEffect(() => () => { for (const layer of Object.values(layers)) layer.dispose(); }, []);

  useFrame(({ camera }, delta) => {
    setVfxCamera(camera.position);
    const dt = Math.min(delta, 0.1);
    if (!gameState.paused) {
      particleClock.value += dt;
      updateEmitters(dt);
      let active = 0;
      for (let i = 0; i < lightCount; i++) {
        const slot = lightSlots[i], light = lights.current[i];
        if (!light) continue;
        slot.age += dt;
        const k = slot.duration > 0 ? Math.max(0, 1 - slot.age / slot.duration) : 0;
        light.intensity = slot.peak * k * k;
        if (k > 0) {
          active++;
          light.position.set(slot.x, slot.y, slot.z);
          light.distance = slot.range;
          light.color.copy(slot.color);
        }
      }
      vfxStats.lights = active;
    }
    layers.ground.flush(); layers.volume.flush(); layers.emissive.flush();
    if (++frame.current % 30 === 0) {
      vfxStats.ground = layers.ground.live();
      vfxStats.volume = layers.volume.live();
      vfxStats.emissive = layers.emissive.live();
      vfxStats.particles = vfxStats.ground + vfxStats.volume + vfxStats.emissive;
      vfxStats.smoke = vfxStats.volume; vfxStats.fire = vfxStats.emissive; vfxStats.debris = vfxStats.ground;
    }
  });

  return <group name="Pooled VFX">
    <primitive object={layers.ground.mesh} />
    <primitive object={layers.volume.mesh} />
    <primitive object={layers.emissive.mesh} />
    {lightKeys.slice(0, lightCount).map(i => <pointLight key={i} ref={el => { lights.current[i] = el; }}
      intensity={0} distance={10} decay={2} castShadow={false} />)}
  </group>;
}
