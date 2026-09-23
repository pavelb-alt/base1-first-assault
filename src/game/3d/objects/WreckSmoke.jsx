import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BATTLEFIELD_DETAIL as DETAIL } from '@/game/config';
import { SMOKE_SITES } from '@/game/3d/dressing/battlefieldDetailLayout';
import { dressingNoise } from '@/game/3d/dressing/dressingNoise';
import { gameState } from '@/game/3d/world';

const noRaycast=()=>null;
export function WreckSmoke({level}) {
  const {geometry,uniforms}=useMemo(()=>{
    const positions=[],seeds=[];
    SMOKE_SITES.forEach((site,s)=>{
      for(let i=0;i<DETAIL.puffsPerSite;i++) {
        positions.push(...site);seeds.push(i/DETAIL.puffsPerSite,dressingNoise(115000+s*100+i),s>=4?1:0);
      }
    });
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,3));
    return {geometry,uniforms:{time:{value:0},viewportScale:{value:600},color:{value:new THREE.Color(DETAIL.smoke)}}};
  },[]);
  useFrame(({size,gl},delta)=>{
    if(level===5)return;
    if(!gameState.paused)uniforms.time.value+=delta;
    uniforms.viewportScale.value=size.height*gl.getPixelRatio();
  });
  return <points name="Six pooled wreck smoke plumes" geometry={geometry} frustumCulled={false} raycast={noRaycast}>
    <shaderMaterial transparent depthWrite={false} uniforms={uniforms}
      vertexShader={`
        attribute vec3 seed;
        uniform float time, viewportScale;
        varying float opacity;
        void main(){
          float age=fract(seed.x+time/${DETAIL.smokeLife.toFixed(1)});
          vec3 p=position;
          p.y+=age*mix(9.0,20.0,seed.z);
          p.x+=age*3.5+sin(age*6.28+seed.y*6.28)*age;
          p.z+=age*(seed.y-.5)*3.0;
          vec4 view=modelViewMatrix*vec4(p,1.0);
          gl_Position=projectionMatrix*view;
          gl_PointSize=clamp((1.0+age*4.2)*viewportScale/max(1.0,-view.z),1.0,110.0);
          opacity=smoothstep(0.0,.12,age)*(1.0-smoothstep(.35,1.0,age))*.24;
        }`}
      fragmentShader={`
        uniform vec3 color;
        varying float opacity;
        void main(){
          float r=length(gl_PointCoord-vec2(.5));
          if(r>.5)discard;
          gl_FragColor=vec4(color,opacity*(1.0-smoothstep(.08,.5,r)));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`}/>
  </points>;
}