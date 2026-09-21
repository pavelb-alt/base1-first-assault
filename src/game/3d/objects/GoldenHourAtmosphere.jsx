import { useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { Stars } from '@react-three/drei';
import { getAtmosphere, MAP } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { EventBus } from '@/game/EventBus';

export function GoldenHourAtmosphere() {
  const [level, setLevel] = useState(gameState.currentLevel);
  useEffect(() => {
    const onLevelChanged = () => setLevel(gameState.currentLevel);
    EventBus.on('level-changed', onLevelChanged);
    return () => EventBus.off('level-changed', onLevelChanged);
  }, []);

  const C = getAtmosphere(level);
  const isNight = level === 2;

  const uniforms = useMemo(() => ({
    sky: { value: new THREE.Color(C.sky) },
    horizon: { value: new THREE.Color(C.horizon) },
    sunDirection: { value: new THREE.Vector3(...C.sunPosition).normalize() },
  }), [level]);

  return <>
    <color attach="background" args={[C.horizon]} />
    <fog attach="fog" args={[C.horizon, C.fogNear, C.fogFar]} />
    <mesh name="Sky dome" raycast={() => null} renderOrder={-100}>
      <sphereGeometry args={[900, 32, 16]} />
      <shaderMaterial side={THREE.BackSide} depthWrite={false} uniforms={uniforms}
        vertexShader={`varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
        fragmentShader={`uniform vec3 sky;uniform vec3 horizon;uniform vec3 sunDirection;varying vec3 vDirection;
          void main(){vec3 d=normalize(vDirection);float sun=max(dot(d,sunDirection),0.);
          vec3 color=mix(horizon,sky,smoothstep(-.03,.65,d.y));
          ${isNight ? `
          float stars=pow(max(0.0,1.0-abs(d.x)*8.0),8.0)*pow(fract(sin(dot(floor(d.xy*200.0),vec2(12.9898,78.233)))*43758.5453),0.98);
          color+=vec3(stars)*vec3(0.8,0.85,1.0)*0.5;
          color+=vec3(0.6,0.7,0.9)*pow(sun,8.)*0.08;
          ` : `
          color+=vec3(1.,.52,.16)*pow(sun,24.)*.24;
          color+=vec3(1.,.8,.48)*smoothstep(.99965,.99985,sun)*2.;
          `}
          gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`} />
    </mesh>
    {isNight && <Stars radius={400} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />}
    <ambientLight intensity={C.ambient} />
    <hemisphereLight intensity={C.hemisphere} color={C.skyColor} groundColor={C.groundColor} />
    <directionalLight name={isNight ? "Moonlight" : "High daylight sun"} castShadow position={C.sunPosition} color={C.sun} intensity={C.sunIntensity}
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-MAP.HALF-25} shadow-camera-right={MAP.HALF+25}
      shadow-camera-top={MAP.HALF+25} shadow-camera-bottom={-MAP.HALF-25}
      shadow-camera-near={1} shadow-camera-far={450} shadow-bias={-0.0003} shadow-normalBias={0.035} />
  </>;
}