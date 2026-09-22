import { useLayoutEffect, useRef } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { FRONT, MAP } from '@/game/config';
import { SURFACE, COVER_SEGMENTS as covers, COMMUNICATION_SEGMENTS as communications, ARTILLERY_BAYS as artilleryBays, DUCKBOARDS as duckboards } from '@/game/3d/trenchShape';
import { TrenchWire } from '@/game/3d/objects/TrenchWire';
import { AntiTankObstacles } from '@/game/3d/objects/AntiTankObstacles';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { createGroundMaterial, setGroundNightFactor } from '@/game/3d/dressing/groundAppearance';

// One surface for visible earth AND fixed concave collision; no plane over the cutouts.
const ground = new THREE.BufferGeometry();
const vertices=[],colors=[],flat=[];
const palette=Object.fromEntries(Object.entries({ground:MAP.GROUND_COLOR,...FRONT.earthColors}).map(([k,v])=>[k,new THREE.Color(v)]));
const ab=new THREE.Vector3(),ac=new THREE.Vector3();
function face(a,b,c) {
  ab.set(b.x-a.x,b.y-a.y,b.z-a.z);ac.set(c.x-a.x,c.y-a.y,c.z-a.z);
  const up=ab.cross(ac).normalize().y;
  const min=Math.min(a.y,b.y,c.y),max=Math.max(a.y,b.y,c.y);
  const color=min>=-0.001?palette.ground : up<0.65?palette.wall : max<=-0.15?palette.floor : min>=FRONT.firingFloor-0.01?palette.step : palette.ramp;
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
const communicationFloorMaterial=new THREE.MeshStandardMaterial({color:FRONT.earthColors.floor,roughness:1});
const communicationBankMaterial=new THREE.MeshStandardMaterial({color:FRONT.earthColors.wall,roughness:1});
const duckboardMaterial=new THREE.MeshStandardMaterial({color:'#4a3d2e',roughness:0.95});
const sandbagMaterial=new THREE.MeshStandardMaterial({color:'#6b5d44',roughness:1});
export function TrenchTerrain(){
  const mesh=useRef(),communicationFloor=useRef(),communicationBanks=useRef(),bayFloors=useRef(),bayBanks=useRef(),duckboardRef=useRef(),sandbagRef=useRef();
  useLayoutEffect(()=>{
    const onLevelChanged=(level)=>setGroundNightFactor(level===2?1:0);
    EventBus.on('level-changed',onLevelChanged);
    return()=>EventBus.off('level-changed',onLevelChanged);
  },[]);
  useLayoutEffect(()=>{
    const m=new THREE.Object3D();
    covers.forEach((c,i)=>{m.position.set(c.x,FRONT.parapetHeight/2,c.z);m.rotation.y=c.rotation;m.scale.set(c.width,FRONT.parapetHeight,FRONT.edgeThickness);m.updateMatrix();mesh.current.setMatrixAt(i,m.matrix);});
    mesh.current.instanceMatrix.needsUpdate=true;
    communications.forEach((c,i)=>{
      m.position.set(c.x,0.012,c.z);m.rotation.y=c.rotation;m.scale.set(c.width,0.024,FRONT.communicationWidth);m.updateMatrix();communicationFloor.current.setMatrixAt(i,m.matrix);
      for(const side of [-1,1]) {
        const offset=side*(FRONT.communicationWidth/2+0.18);
        m.position.set(c.x+Math.sin(c.rotation)*offset,0.07,c.z+Math.cos(c.rotation)*offset);
        m.rotation.y=c.rotation;m.scale.set(c.width,0.14,0.28);m.updateMatrix();communicationBanks.current.setMatrixAt(i*2+(side+1)/2,m.matrix);
      }
    });
    communicationFloor.current.instanceMatrix.needsUpdate=true;
    communicationBanks.current.instanceMatrix.needsUpdate=true;
    artilleryBays.forEach((bay,i)=>{
      const outward=Math.sign(bay.z);
      m.position.set(bay.x,0.013,bay.z);m.rotation.y=0;m.scale.set(bay.width,0.026,bay.depth);m.updateMatrix();bayFloors.current.setMatrixAt(i,m.matrix);
      const banks=[
        {x:bay.x-bay.width/2,z:bay.z,w:0.3,d:bay.depth},
        {x:bay.x+bay.width/2,z:bay.z,w:0.3,d:bay.depth},
        {x:bay.x,z:bay.z+outward*bay.depth/2,w:bay.width,d:0.3},
      ];
      banks.forEach((bank,j)=>{m.position.set(bank.x,0.11,bank.z);m.scale.set(bank.w,0.22,bank.d);m.updateMatrix();bayBanks.current.setMatrixAt(i*3+j,m.matrix);});
    });
    bayFloors.current.instanceMatrix.needsUpdate=true;
    bayBanks.current.instanceMatrix.needsUpdate=true;
    duckboards.forEach((d,i)=>{
      m.position.set(d.x,-d.depth+0.04,d.z);m.rotation.y=d.rotation;
      m.scale.set(0.7,0.06,d.width*0.9);m.updateMatrix();
      duckboardRef.current.setMatrixAt(i,m.matrix);
    });
    duckboardRef.current.instanceMatrix.needsUpdate=true;
    // Sandbag tops on the parapet for a layered, reinforced look
    covers.forEach((c,i)=>{
      for(const layer of [0,1]) {
        const idx=i*2+layer;
        m.position.set(c.x,FRONT.parapetHeight+0.06*(layer+1),c.z+(layer?0.05:-0.04)*Math.sin(c.rotation));
        m.rotation.y=c.rotation+(layer?0.08:-0.05);
        m.scale.set(c.width*0.85,0.12,FRONT.edgeThickness*0.7);
        m.updateMatrix();
        sandbagRef.current.setMatrixAt(idx,m.matrix);
      }
    });
    sandbagRef.current.instanceMatrix.needsUpdate=true;
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
    <instancedMesh ref={communicationFloor} args={[box,communicationFloorMaterial,communications.length]} receiveShadow frustumCulled={false}/>
    <instancedMesh ref={communicationBanks} args={[box,communicationBankMaterial,communications.length*2]} castShadow receiveShadow frustumCulled={false}/>
    <instancedMesh ref={bayFloors} args={[box,communicationFloorMaterial,artilleryBays.length]} receiveShadow frustumCulled={false}/>
    <instancedMesh ref={bayBanks} args={[box,communicationBankMaterial,artilleryBays.length*3]} castShadow receiveShadow frustumCulled={false}/>
    <instancedMesh ref={mesh} args={[box,coverMaterial,covers.length]} castShadow receiveShadow frustumCulled={false}/>
    <instancedMesh ref={duckboardRef} args={[box,duckboardMaterial,duckboards.length]} receiveShadow frustumCulled={false}/>
    <instancedMesh ref={sandbagRef} args={[box,sandbagMaterial,covers.length*2]} castShadow receiveShadow frustumCulled={false}/>
    <TrenchWire/>
    <AntiTankObstacles/>
  </>;
}