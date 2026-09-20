import * as THREE from 'three';

// Instanced camera-facing particles: procedural turbulent edges, no image downloads.
export function blastLayer(capacity, fire = false) {
  const geometry = new THREE.PlaneGeometry(2, 2);
  geometry.setAttribute('particleTint', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
  geometry.setAttribute('particleAge', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { fire: { value: fire ? 1 : 0 } },
    vertexShader: `attribute vec4 particleTint;attribute float particleAge;
      varying vec2 vUv;varying vec4 vTint;varying float vAge;
      void main(){vUv=uv;vTint=particleTint;vAge=particleAge;
        vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
        gl_Position=projectionMatrix*center;}`,
    fragmentShader: `uniform float fire;varying vec2 vUv;varying vec4 vTint;varying float vAge;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){vec2 p=vUv*2.-1.;vec2 q=p*3.+vec2(vAge*.4,-vAge*.7);
        float n=noise(q)*.6+noise(q*2.1)*.28+noise(q*4.3)*.12;
        float edge=length(p)+(.5-n)*.5;
        float alpha=(1.-smoothstep(.4,1.,edge))*vTint.a;
        if(alpha<.008)discard;
        vec3 color=vTint.rgb*mix(.68,1.2,n);
        color=mix(color,color*(1.+max(0.,1.-length(p)*1.6)*1.8),fire);
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { geometry, material, dispose() { geometry.dispose(); material.dispose(); } };
}