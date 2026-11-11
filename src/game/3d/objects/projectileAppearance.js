import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING } from '@/game/config';

// The collision position stays at the white-hot tip; the tail is visual only.
// Merge the bright core and soft halo into one geometry so each team still
// renders in a single instanced draw call, even with thousands of live bolts.
export const BOLT_VISUAL = { length: 1.05, radius: 0.055 };
function layer(radius, halo) {
  const geometry = new THREE.CylinderGeometry(radius, radius * 0.13, 1, 8, 1, true);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, -0.5);
  geometry.setAttribute('halo', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(halo), 1));
  return geometry;
}
const core = layer(BOLT_VISUAL.radius, 0);
const halo = layer(BOLT_VISUAL.radius * 3.4, 1);
export const boltGeometry = mergeGeometries([core, halo]);
core.dispose(); halo.dispose();

// Hot core + soft glow: the core is a white-hot filament tinted by team color
// toward the tail; the halo fades by view angle (fresnel) so its silhouette is
// soft instead of a hard cylinder edge. Per-slot brightness jitter breaks up
// volleys without any per-frame CPU work.
function boltMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending,
    uniforms: { boltColor: { value: new THREE.Color(color) }, radiance: { value: LIGHTING.tracerRadiance } },
    vertexShader: `attribute float halo;varying float vAlong;varying float vHalo;varying float vFacing;varying float vJitter;
      void main(){vAlong=position.z+1.;vHalo=halo;
        vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.);
        vec3 n=normalize(normalMatrix*mat3(instanceMatrix)*normal);
        vFacing=abs(dot(n,normalize(-mv.xyz)));
        vJitter=.82+.18*fract(sin(float(gl_InstanceID)*12.9898)*43758.5453);
        gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform vec3 boltColor;uniform float radiance;varying float vAlong;varying float vHalo;varying float vFacing;varying float vJitter;
      void main(){float head=smoothstep(.55,1.,vAlong);
        vec3 hot=mix(boltColor*1.15,vec3(1.,.97,.92),head*.9);
        vec3 color=mix(hot,boltColor,vHalo);
        float soft=mix(smoothstep(.05,.6,vFacing),pow(vFacing,2.2),vHalo);
        float alpha=smoothstep(0.,.45,vAlong)*mix(.35,1.,vAlong)*mix(1.,.22,vHalo)*soft*vJitter;
        gl_FragColor=vec4(color*radiance*mix(1.,1.35,head*(1.-vHalo)),alpha);
        #include <colorspace_fragment>
      }`,
  });
}
export const friendlyMaterial = boltMaterial('#53aaff');
export const enemyMaterial = boltMaterial('#ff6653');
