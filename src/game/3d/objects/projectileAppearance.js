import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING } from '@/game/config';

// The collision position stays at the white-hot tip; the tail is visual only.
// Merge the bright core and soft halo into one geometry so each team still
// renders in a single instanced draw call, even with thousands of live bolts.
export const BOLT_VISUAL = { length: 1.05, radius: 0.055 };
function layer(radius, halo) {
  const geometry = new THREE.CylinderGeometry(radius, radius * 0.13, 1, 8);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, -0.5);
  geometry.setAttribute('halo', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(halo), 1));
  return geometry;
}
const core = layer(BOLT_VISUAL.radius, 0);
const halo = layer(BOLT_VISUAL.radius * 3, 1);
export const boltGeometry = mergeGeometries([core, halo]);
core.dispose(); halo.dispose();
function boltMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending,
    uniforms: { boltColor: { value: new THREE.Color(color) }, radiance: { value: LIGHTING.tracerRadiance } },
    vertexShader: `attribute float halo;varying float vAlong;varying float vHalo;
      void main(){vAlong=position.z+1.;vHalo=halo;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 boltColor;uniform float radiance;varying float vAlong;varying float vHalo;
      void main(){float head=smoothstep(.64,1.,vAlong);
        vec3 color=mix(boltColor,vec3(1.),head*(1.-vHalo)*.92);
        float alpha=smoothstep(0.,.4,vAlong)*mix(.3,1.,vAlong)*mix(1.,.16,vHalo);
        gl_FragColor=vec4(color*radiance,alpha);
        #include <colorspace_fragment>
      }`,
  });
}
export const friendlyMaterial = boltMaterial('#53aaff');
export const enemyMaterial = boltMaterial('#ff6653');