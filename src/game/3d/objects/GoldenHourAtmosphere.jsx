import { useMemo } from 'react';
import * as THREE from 'three';
import { CINEMATIC as C, MAP } from '@/game/config';

export function GoldenHourAtmosphere() {
  const uniforms = useMemo(() => ({
    sky: { value: new THREE.Color(C.sky) }, horizon: { value: new THREE.Color(C.horizon) },
    sunDirection: { value: new THREE.Vector3(...C.sunPosition).normalize() },
  }), []);
  return <>
    <color attach="background" args={[C.horizon]} />
    <fog attach="fog" args={[C.horizon, C.fogNear, C.fogFar]} />
    <mesh name="Golden hour sky" raycast={() => null} renderOrder={-100}>
      <sphereGeometry args={[900, 32, 16]} />
      <shaderMaterial side={THREE.BackSide} depthWrite={false} uniforms={uniforms}
        vertexShader={`varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
        fragmentShader={`uniform vec3 sky;uniform vec3 horizon;uniform vec3 sunDirection;varying vec3 vDirection;
          void main(){vec3 d=normalize(vDirection);float sun=max(dot(d,sunDirection),0.);
          vec3 color=mix(horizon,sky,smoothstep(-.03,.65,d.y));
          color+=vec3(1.,.52,.16)*pow(sun,24.)*.24;
          color+=vec3(1.,.8,.48)*smoothstep(.99965,.99985,sun)*2.;
          gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`} />
    </mesh>
    <ambientLight intensity={0.22} />
    <hemisphereLight intensity={0.7} color="#b9cfdf" groundColor="#8b7358" />
    <directionalLight name="Low golden sun" castShadow position={C.sunPosition} color={C.sun} intensity={C.sunIntensity}
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-MAP.HALF-25} shadow-camera-right={MAP.HALF+25}
      shadow-camera-top={MAP.HALF+25} shadow-camera-bottom={-MAP.HALF-25}
      shadow-camera-near={1} shadow-camera-far={450} shadow-bias={-0.0003} shadow-normalBias={0.035} />
  </>;
}