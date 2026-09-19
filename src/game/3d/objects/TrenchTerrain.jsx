import { useLayoutEffect, useRef } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { FRONT, MAP } from '@/game/config';
import { TERRAIN_X, TERRAIN_Z, COVER_SEGMENTS, terrainHeight, zigzagOffset } from '@/game/3d/terrain';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';

// One cached indexed surface is shared by rendering and fixed concave collision.
const ground = new THREE.BufferGeometry();
const vertices=[],indices=[],colors=[];
const groundColor=new THREE.Color(MAP.GROUND_COLOR);
const wallColor=new THREE.Color('#6b5d4f');   // earth-colored walls
const floorColor=new THREE.Color('#4a443d');  // darker floors
const color=new THREE.Color();
for(const z of TERRAIN_Z)for(const x of TERRAIN_X){
  const y=terrainHeight(x,z);vertices.push(x,y,z);
  const depth=Math.min(1,-y/FRONT.depth);
  color.copy(groundColor).lerp(wallColor,depth*0.7);
  if(depth>0.7)color.lerp(floorColor,(depth-0.7)/0.3);
  colors.push(color.r,color.g,color.b);
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
const coverMaterial=new THREE.MeshStandardMaterial({color:'#5a4f42',roughness:0.9});

// Cover positions follow the zigzag-adjusted trench front edge
const covers=FRONT.rows.flatMap((z,rowIndex)=>
  COVER_SEGMENTS.map(s=>({
    x:s.x,
    z:z+zigzagOffset(s.x,rowIndex)-FRONT.halfWidth-0.15,
    width:s.width,
  }))
);

export function TrenchTerrain(){
  const mesh=useRef();
  useLayoutEffect(()=>{
    const m=new THREE.Object3D();
    covers.forEach((c,i)=>{m.position.set(c.x,FRONT.parapetHeight/2,c.z);m.scale.set(c.width,FRONT.parapetHeight,0.4);m.updateMatrix();mesh.current.setMatrixAt(i,m.matrix);});
    mesh.current.instanceMatrix.needsUpdate=true;
  },[]);
  return <>
    <RigidBody type="fixed" colliders="trimesh" friction={0.3}>
      <mesh geometry={ground} material={groundMaterial} receiveShadow onClick={()=>{
        if(gameState.mode==='strategic'){gameState.selectedSoldierId=null;EventBus.emit('soldier-deselected');}
      }}/>
    </RigidBody>
    <RigidBody type="fixed" colliders={false}>
      {covers.map((c,i)=><CuboidCollider key={i} args={[c.width/2,FRONT.parapetHeight/2,0.2]} position={[c.x,FRONT.parapetHeight/2,c.z]}/>)}
      {/* Side walls track the configured playable surface. */}
      <CuboidCollider args={[MAP.HALF+1,6,1]} position={[0,3,-MAP.HALF-1]}/>
      <CuboidCollider args={[MAP.HALF+1,6,1]} position={[0,3,MAP.HALF+1]}/>
      <CuboidCollider args={[1,6,MAP.HALF]} position={[-MAP.HALF-1,3,0]}/>
      <CuboidCollider args={[1,6,MAP.HALF]} position={[MAP.HALF+1,3,0]}/>
    </RigidBody>
    <instancedMesh ref={mesh} args={[box,coverMaterial,covers.length]} castShadow receiveShadow frustumCulled={false}/>
  </>;
}