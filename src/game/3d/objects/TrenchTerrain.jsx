import { useLayoutEffect, useRef } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { FRONT, MAP } from '@/game/config';
import { TERRAIN_X, TERRAIN_Z, COVER_SEGMENTS, terrainHeight } from '@/game/3d/terrain';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';

// One cached indexed surface is shared by rendering and fixed concave collision.
const ground = new THREE.BufferGeometry();
const vertices=[],indices=[],colors=[];
const groundColor=new THREE.Color(MAP.GROUND_COLOR),floorColor=new THREE.Color('#788390'),color=new THREE.Color();
for(const z of TERRAIN_Z)for(const x of TERRAIN_X){
  const y=terrainHeight(x,z);vertices.push(x,y,z);
  color.copy(groundColor).lerp(floorColor,Math.min(1,-y/FRONT.depth));colors.push(color.r,color.g,color.b);
}
const width=TERRAIN_X.length;
for(let z=0;z<TERRAIN_Z.length-1;z++)for(let x=0;x<width-1;x++){
  const a=z*width+x,b=a+1,c=a+width,d=c+1;indices.push(a,c,b,b,c,d);
}
ground.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
ground.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
ground.setIndex(indices);ground.computeVertexNormals();
const groundMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.95});
const box=new THREE.BoxGeometry(1,1,1);
const coverMaterial=new THREE.MeshStandardMaterial({color:'#687381',roughness:0.9});
const covers=FRONT.rows.flatMap(z=>COVER_SEGMENTS.map(s=>({x:s.x,z:z-4.5,width:s.width})));
export function TrenchTerrain(){
  const mesh=useRef();
  useLayoutEffect(()=>{
    const m=new THREE.Object3D();
    covers.forEach((c,i)=>{m.position.set(c.x,FRONT.parapetHeight/2,c.z);m.scale.set(c.width,FRONT.parapetHeight,0.55);m.updateMatrix();mesh.current.setMatrixAt(i,m.matrix);});
    mesh.current.instanceMatrix.needsUpdate=true;
  },[]);
  return <>
    <RigidBody type="fixed" colliders="trimesh" friction={0.3}>
      <mesh geometry={ground} material={groundMaterial} receiveShadow onClick={()=>{
        if(gameState.mode==='strategic'){gameState.selectedSoldierId=null;EventBus.emit('soldier-deselected');}
      }}/>
    </RigidBody>
    <RigidBody type="fixed" colliders={false}>
      {covers.map((c,i)=><CuboidCollider key={i} args={[c.width/2,FRONT.parapetHeight/2,0.275]} position={[c.x,FRONT.parapetHeight/2,c.z]}/>)}
      {/* Side walls enclose the full 400 × 400 playable surface. */}
      <CuboidCollider args={[MAP.HALF+1,6,1]} position={[0,3,-MAP.HALF-1]}/>
      <CuboidCollider args={[MAP.HALF+1,6,1]} position={[0,3,MAP.HALF+1]}/>
      <CuboidCollider args={[1,6,MAP.HALF]} position={[-MAP.HALF-1,3,0]}/>
      <CuboidCollider args={[1,6,MAP.HALF]} position={[MAP.HALF+1,3,0]}/>
    </RigidBody>
    <instancedMesh ref={mesh} args={[box,coverMaterial,covers.length]} castShadow receiveShadow frustumCulled={false}/>
  </>;
}