import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LIGHTING } from '@/game/config';
import { gameState } from '@/game/3d/world';

// Lightweight intersecting planes suggest suspended dust and sunlight without
// a costly volumetric raymarch or any lights/physics in the combat simulation.
const hazeLayers = [1.1, 3.6, 7];
const rayLandingPoints = [[-61, -30], [-35, -58], [8, -37], [48, -60], [65, 6]];
const hazeGeometry = new THREE.PlaneGeometry(210, 180);
const shaftGeometry = new THREE.PlaneGeometry(20, 130);
const vertexShader = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

export function AtmosphericHaze({ atmosphere, night }) {
  const resources = useMemo(() => {
    const sunDirection = new THREE.Vector3(...atmosphere.sunPosition).normalize();
    const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDirection);
    const tint = new THREE.Color(night ? '#8fa8c2' : atmosphere.horizon);
    const haze = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, tint: { value: tint }, opacity: { value: LIGHTING.hazeOpacity * (night ? 0.65 : 1) } },
      vertexShader,
      fragmentShader: `uniform float time;uniform float opacity;uniform vec3 tint;varying vec2 vUv;
      void main(){vec2 p=vUv*2.-1.;
        float edge=(1.-smoothstep(.60,1.,abs(p.x)))*(1.-smoothstep(.64,1.,abs(p.y)));
        float outer=smoothstep(.12,.8,length(p-vec2(0.,.15)));
        float wisps=.55+.25*sin(p.x*13.+p.y*8.+time*.07)*sin(p.x*6.-p.y*12.-time*.035);
        float alpha=edge*outer*wisps*opacity;
        gl_FragColor=vec4(tint,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    const beam = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, tint: { value: new THREE.Color(atmosphere.sun) }, opacity: { value: LIGHTING.shaftOpacity } },
      vertexShader,
      fragmentShader: `uniform float time;uniform vec3 tint;uniform float opacity;varying vec2 vUv;
      void main(){float width=mix(.48,.15,vUv.y);
        float feather=1.-smoothstep(.12,.98,abs(vUv.x-.5)/width);
        float ends=smoothstep(0.,.22,vUv.y)*(1.-smoothstep(.74,1.,vUv.y));
        float dust=.78+.22*sin(vUv.y*17.+vUv.x*9.+time*.11);
        gl_FragColor=vec4(tint,feather*feather*ends*dust*opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    return { haze, beam, tilt, sunDirection };
  }, [atmosphere, night]);
  useEffect(() => () => { resources.haze.dispose(); resources.beam.dispose(); }, [resources]);
  useFrame((_, delta) => {
    if (gameState.paused) return;
    resources.haze.uniforms.time.value += delta;
    resources.beam.uniforms.time.value += delta;
  });
  return <group name="Cinematic atmospheric scattering">
    {hazeLayers.map((y, i) => <mesh key={y} position={[0, y, -12]} rotation={[-Math.PI / 2, 0, i * 0.28]}
      geometry={hazeGeometry} material={resources.haze} raycast={() => null} />)}
    {!night && rayLandingPoints.map(([x, z], i) => {
      const d = resources.sunDirection;
      // Each crossed pair rises from a point on the ground toward the real sun.
      const center = [x + d.x * 55, d.y * 55, z + d.z * 55];
      return <group key={i} position={center} quaternion={resources.tilt}>
        {[0, Math.PI / 2].map(angle => <mesh key={angle} rotation={[0, angle, 0]}
          geometry={shaftGeometry} material={resources.beam} raycast={() => null} />)}
      </group>;
    })}
  </group>;
}