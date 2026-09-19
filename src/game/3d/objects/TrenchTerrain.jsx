import { useLayoutEffect, useRef } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { FRONT, MAP } from '@/game/config';
import { SURFACE, COVER_SEGMENTS as covers } from '@/game/3d/trenchShape';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { createGroundMaterial } from '@/game/3d/dressing/groundAppearance';

// One surface for visible earth AND fixed concave collision; no plane over the cutouts.
const ground = new THREE.BufferGeometry();
const vertices=[],colors=[],flat=[];
const palette=Object.fromEntries(Object.entries({ground:MAP.GROUND_COLOR,...FRONT.earthColors}).map(([k,v])=>[k,new THREE.Color(v)]));
const ab=new THREE.Vector3(),ac=new THREE.Vector3();
function face(a,b,c) {
  ab.set(b.x-a.x,b.y-a.y,b.z-a.z);ac.set(c.x-a.x,c.y-a.y,c.z-a.z);
  const up=ab.cross(ac).normalize().y;
  const min=Math.min(a.y,b.y,c.y),max=Math.max(a.y,b.y,c.y);
  const color=min>=-0.001?palette.ground : up<0.65?palette.wall : max<=-FRONT.depth+0.01?palette.floor : min>=FRONT.firingFloor-0.01?palette.step : palette.ramp;
  for(const p of [a,b,c]){vertices.push(p.x,p.y,p.z);colors.push(color.r,color.g,color.b);flat.push(min>=-0.001?1:0);}
}
for(let z=0;z<SURFACE.length-1;z++)for(let x=0;x<SURFACE[z].length-1;x++) {
  const a=SURFACE[z][x],b=SURFACE[z][x+1],c=SURFACE[z+1][x],d=SURFACE[z+1][x+1];
  face(a,c,b);face(b,c,d);
}
ground.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
ground.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
ground.setAttribute('dressingFlat',new THREE.Float32BufferAttribute(flat,1));
ground.computeVertexNormals();
const groundMaterial=createGroundMaterial();
const box=new THREE.BoxGeometry(1,1,1);
const coverMaterial=new THREE.MeshStandardMaterial({color:FRONT.earthColors.edge,roughness:0.9});
export function TrenchTerrain(){
  const mesh=useRef();
  useLayoutEffect(()=>{
    const m=new THREE.Object3D();
    covers.forEach((c,i)=>{m.position.set(c.x,FRONT.parapetHeight/2,c.z);m.rotation.y=c.rotation;m.scale.set(c.width,FRONT.parapetHeight,FRONT.edgeThickness);m.updateMatrix();mesh.current.setMatrixAt(i,m.matrix);});
    mesh.current.instanceMatrix.needsUpdate=true;
  },[]);
  return <>
    <RigidBody type="fixed" colliders="trimesh" friction={0.3}>
      <mesh geometry={ground} material={groundMaterial} receiveShadow onClick={()=>{
        if(gameState.mode==='strategic'){gameState.selectedSoldierId=null;EventBus.emit('soldier-deselected');}
      }}/>
    </RigidBody>
    <RigidBody type="fixed" colliders={false}>
      {covers.map((c,i)=><CuboidCollider key={i} args={[c.width/2,FRONT.parapetHeight/2,FRONT.edgeThickness/2]} position={[c.x,FRONT.parapetHeight/2,c.z]} rotation={[0,c.rotation,0]}/>)}
      {/* Side walls track the configured playable surface. */}
      <CuboidCollider args={[MAP.HALF+1,6,1]} position={[0,3,-MAP.HALF-1]}/>
      <CuboidCollider args={[MAP.HALF+1,6,1]} position={[0,3,MAP.HALF+1]}/>
      <CuboidCollider args={[1,6,MAP.HALF]} position={[-MAP.HALF-1,3,0]}/>
      <CuboidCollider args={[1,6,MAP.HALF]} position={[MAP.HALF+1,3,0]}/>
    </RigidBody>
    <instancedMesh ref={mesh} args={[box,coverMaterial,covers.length]} castShadow receiveShadow frustumCulled={false}/>
  </>;
}