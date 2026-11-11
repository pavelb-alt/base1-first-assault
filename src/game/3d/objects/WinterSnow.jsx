import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WINTER } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { EventBus } from '@/game/EventBus';
import { dressingNoise } from '@/game/3d/dressing/groundAppearance';
import { useRenderQuality } from '@/game/3d/vfx/quality';

// Weather is purely visual: independent of the combat random stream and physics.
export const winterWeather = { active: false, elapsed: 0, flakes: 0 };
export function WinterSnow() {
  const points = useRef();
  const { preset } = useRenderQuality();
  const snowCount = Math.round(WINTER.snowCount * preset.snowScale);
  const countRef = useRef(snowCount);
  countRef.current = snowCount;
  const positions = useMemo(() => {
    const data = new Float32Array(WINTER.snowCount * 3);
    for (let i = 0; i < data.length; i++) data[i] = dressingNoise(94000 + i);
    return data;
  }, []);
  const uniforms = useMemo(() => ({
    time: { value: 0 }, center: { value: new THREE.Vector2() },
    field: { value: new THREE.Vector2(WINTER.fieldWidth, WINTER.fieldHeight) },
    viewportScale: { value: 600 }, color: { value: new THREE.Color(WINTER.snowColor) },
  }), []);
  useEffect(() => {
    const update = level => {
      winterWeather.active = level === 4;
      winterWeather.elapsed = 0;
      winterWeather.flakes = level === 4 ? countRef.current : 0;
      uniforms.time.value = 0;
      if (points.current) points.current.visible = winterWeather.active;
    };
    update(gameState.currentLevel);
    EventBus.on('level-changed', update);
    return () => {
      EventBus.off('level-changed', update);
      winterWeather.active = false;
      winterWeather.flakes = 0;
    };
  }, [uniforms]);
  // Quality presets thin the flake budget live (no buffer reallocation).
  useEffect(() => {
    points.current?.geometry.setDrawRange(0, snowCount);
    if (winterWeather.active) winterWeather.flakes = snowCount;
  }, [snowCount]);
  useFrame(({ camera, size, gl }, delta) => {
    if (!winterWeather.active) return;
    if (!gameState.paused) winterWeather.elapsed += delta;
    uniforms.time.value = winterWeather.elapsed;
    uniforms.center.value.set(camera.position.x, camera.position.z);
    // Denser nearby snowfall for ground-level possession; broad field in strategic view.
    uniforms.field.value.set(Math.min(WINTER.fieldWidth, Math.max(55, camera.position.y * 3)),
      Math.min(WINTER.fieldHeight, Math.max(28, camera.position.y + 24)));
    uniforms.viewportScale.value = size.height * gl.getPixelRatio();
  });
  return <points ref={points} name="Falling winter snow" visible={false} frustumCulled={false} raycast={() => null}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <shaderMaterial transparent depthWrite={false} toneMapped={false} uniforms={uniforms}
      vertexShader={`
        uniform float time, viewportScale;
        uniform vec2 center, field;
        varying float opacity;
        void main() {
          float speed = ${WINTER.fallSpeed.toFixed(2)} * (0.65 + position.x * 0.7);
          vec3 p;
          p.x = center.x + (fract(position.x + time * ${WINTER.windX.toFixed(2)} / field.x) - 0.5) * field.x;
          p.z = center.y + (fract(position.z + time * ${WINTER.windZ.toFixed(2)} / field.x) - 0.5) * field.x;
          p.y = fract(position.y - time * speed / field.y) * field.y;
          p.x += sin(time * 0.7 + position.z * 40.0) * 0.6;
          vec4 view = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = clamp(${WINTER.flakeSize.toFixed(2)} * viewportScale / max(1.0, -view.z), 1.2, 6.0);
          opacity = (1.0 - smoothstep(130.0, 240.0, -view.z)) * smoothstep(0.0, 1.5, p.y);
        }`}
      fragmentShader={`
        uniform vec3 color;
        varying float opacity;
        void main() {
          float r = length(gl_PointCoord - vec2(0.5));
          if (r > 0.5) discard;
          gl_FragColor = vec4(color, (1.0 - smoothstep(0.12, 0.5, r)) * opacity * 0.9);
          #include <colorspace_fragment>
        }`}
    />
  </points>;
}