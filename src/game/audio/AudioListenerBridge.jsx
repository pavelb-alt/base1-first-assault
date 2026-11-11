// Copies the R3F camera into the audio listener every frame (no allocations)
// and drives per-frame audio polling (artillery whistles, sky battle).
// In strategic view the "ears" hover above the point the camera looks at, so
// zooming out pulls the battle into a distant wash instead of silence.
import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { gameState } from '@/game/3d/world';
import { listener } from '@/game/audio/engine';
import { audioFrame, setSceneMounted } from '@/game/audio/director';

export function AudioListenerBridge() {
  useEffect(() => {
    setSceneMounted(true);
    return () => setSceneMounted(false);
  }, []);

  useFrame(({ camera }) => {
    const e = camera.matrixWorld.elements;
    const px = e[12], py = e[13], pz = e[14];
    let rx = e[0], rz = e[2];
    const rl = Math.sqrt(rx * rx + rz * rz) || 1; rx /= rl; rz /= rl;
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const fl = Math.sqrt(fx * fx + fz * fz) || 1;
    listener.rx = rx; listener.rz = rz;
    listener.fx = fx / fl; listener.fz = fz / fl;
    const strategic = gameState.mode === 'strategic';
    if (strategic && fy < -0.15 && py > 0) {
      const t = -py / fy; // distance along view ray to ground plane
      listener.x = px + fx * t; listener.z = pz + fz * t;
      listener.y = Math.min(60, t * 0.3);
    } else {
      listener.x = px; listener.y = py; listener.z = pz;
    }
    listener.strategic = strategic;
    listener.valid = true;
    try { audioFrame(); } catch { /* audio must never break the frame loop */ }
  });

  return null;
}
