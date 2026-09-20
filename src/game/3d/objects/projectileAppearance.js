import * as THREE from 'three';

// A single tapered bolt per live projectile. Its tip is the authoritative
// collision position; the fading tail only covers already-travelled space.
export const BOLT_VISUAL = { length: 0.7, radius: 0.045 };
export const boltGeometry = new THREE.CylinderGeometry(BOLT_VISUAL.radius, BOLT_VISUAL.radius * 0.12, 1, 8);
boltGeometry.rotateX(Math.PI / 2);
boltGeometry.translate(0, 0, -0.5);
function boltMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending,
    uniforms: { boltColor: { value: new THREE.Color(color) } },
    vertexShader: `varying float vAlong;
      void main(){vAlong=position.z+1.;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 boltColor;varying float vAlong;
      void main(){float head=smoothstep(.72,1.,vAlong);
        vec3 color=mix(boltColor,vec3(1.),head*.85);
        float alpha=smoothstep(0.,.35,vAlong)*mix(.4,1.,vAlong);
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }`,
  });
}
export const friendlyMaterial = boltMaterial('#53aaff');
export const enemyMaterial = boltMaterial('#ff6653');