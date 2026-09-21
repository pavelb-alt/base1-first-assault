import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FRONT, MAP } from '@/game/config';

const postGeometry=new THREE.CylinderGeometry(0.045,0.06,0.75,5);
const postMaterial=new THREE.MeshStandardMaterial({color:'#514b42',roughness:0.95,metalness:0.15});
const wireMaterial=new THREE.LineBasicMaterial({color:'#353632',transparent:true,opacity:0.9});

export function TrenchWire(){
  const posts=useRef();
  const belts=useMemo(()=>[
    {z:FRONT.rows[2]-7},{z:FRONT.rows[2]-10.5},
  ],[]);
  const xs=useMemo(()=>Array.from({length:25},(_,i)=>-MAP.HALF*0.84+i*(MAP.HALF*1.68/24)),[]);
  const wireGeometry=useMemo(()=>{
    const points=[];
    for(const [beltIndex,belt] of belts.entries()) {
      for(let i=0;i<xs.length-1;i++) for(const y of [0.28,0.5]) {
        const z1=belt.z+Math.sin(i*1.7+beltIndex)*0.16,z2=belt.z+Math.sin((i+1)*1.7+beltIndex)*0.16;
        points.push(xs[i],y,z1,xs[i+1],y,z2);
      }
      for(let i=1;i<xs.length-1;i+=2) {
        const x=xs[i],z=belt.z+Math.sin(i*1.7+beltIndex)*0.16;
        points.push(x-0.28,0.38,z-0.25,x+0.28,0.38,z+0.25,x-0.28,0.38,z+0.25,x+0.28,0.38,z-0.25);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    return geometry;
  },[belts,xs]);
  useLayoutEffect(()=>{
    const marker=new THREE.Object3D();let index=0;
    for(const [beltIndex,belt] of belts.entries()) for(const [i,x] of xs.entries()) {
      marker.position.set(x,0.37,belt.z+Math.sin(i*1.7+beltIndex)*0.16);
      marker.rotation.z=(i%2?1:-1)*0.12;marker.updateMatrix();posts.current.setMatrixAt(index++,marker.matrix);
    }
    posts.current.instanceMatrix.needsUpdate=true;
  },[belts,xs]);
  return <group name="barbed-wire-defense-belts">
    <instancedMesh ref={posts} args={[postGeometry,postMaterial,belts.length*xs.length]} castShadow frustumCulled={false}/>
    <lineSegments geometry={wireGeometry} material={wireMaterial}/>
  </group>;
}