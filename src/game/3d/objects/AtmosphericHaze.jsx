import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LIGHTING } from '@/game/config';
import { gameState } from '@/game/3d/world';

const hazeLayers = [1.4, 3.8, 7];
const shafts = [[-64, 22, -24], [-35, 25, -58], [12, 23, -42], [56, 26, -65]];
const vertexShader = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

// Soft, world-space approximation of suspended dust and sun shafts. No opaque
// screen veil, extra lights, depth reads, gameplay randomness or physics bodies.
export function AtmosphericHaze({ atmosphere, night }) {
  const resources = useMemo(() => {
    const tint = new THREE.Color(night ? '#92b3ce' : atmosphere.horizon);
    const haze = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, tint: { value: tint }, opacity: { value: LIGHTING.hazeOpacity * (night ? 0.7 : 1) } },
      vertexShader,
      fragmentShader: `uniform float time;uniform float opacity;uniform vec3 tint;varying vec2 vUv;
      void main(){vec2 p=vUv*2.-1.;float edge=1.-smoothstep(.35,1.,length(p));
        float ribbons=.5+.5*sin(p.x*14.+p.y*9.+sin(p.y*11.-time*.025)*2.+time*.04);
        float alpha=edge*ribbons*opacity;
        gl_FragColor=vec4(tint,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    const beam = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { tint: { value: new THREE.Color(atmosphere.sun) }, opacity: { value: LIGHTING.shaftOpacity } },
      vertexShader,
      fragmentShader: `uniform vec3 tint;uniform float opacity;varying vec2 vUv;
      void main(){float width=mix(.48,.1,vUv.y);
        float edge=1.-smoothstep(0.,width,abs(vUv.x-.5));
        float ends=smoothstep(0.,.24,vUv.y)*(1.-smoothstep(.65,1.,vUv.y));
        gl_FragColor=vec4(tint,edge*edge*ends*opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...atmosphere.sunPosition).normalize());
    return { haze, beam, rotation };
  }, [atmosphere, night]);
  useEffect(() => () => { resources.haze.dispose(); resources.beam.dispose(); }, [resources]);
  useFrame((_, delta) => { if (!gameState.paused) resources.haze.uniforms.time.value += delta; });
  return <group name="Cinematic atmospheric scattering">
    {hazeLayers.map((y, i) => <mesh key={y} position={[0, y, -15]} rotation={[-Math.PI / 2, 0, i * 0.27]}
      material={resources.haze} raycast={() => null} renderOrder={2}>
      <planeGeometry args={[210, 180]} />
    </mesh>)}
    {!night && shafts.map((position, i) => <group key={i} position={position} quaternion={resources.rotation}>
      {[0, Math.PI / 2].map(angle => <mesh key={angle} rotation={[0, angle, 0]} material={resources.beam} raycast={() => null}>
        <planeGeometry args={[22, 95]} />
      </mesh>)}
    </group>)}
  </group>;
}