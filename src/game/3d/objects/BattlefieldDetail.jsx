import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { BATTLEFIELD_DETAIL, WINTER } from '@/game/config';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { FIELD_DETAIL } from '@/game/3d/dressing/battlefieldDetailLayout';
import { WreckSmoke } from '@/game/3d/objects/WreckSmoke';

const geometries={
  rock:new THREE.IcosahedronGeometry(.5,0),box:new THREE.BoxGeometry(1,1,1),
  cylinder:new THREE.CylinderGeometry(.5,.5,1,8),
  rim:new THREE.TorusGeometry(1,.14,5,20).rotateX(-Math.PI/2),
  basin:new THREE.SphereGeometry(.5,16,6),bag:new THREE.SphereGeometry(.5,8,5),
  ember:new THREE.IcosahedronGeometry(.5,0),
  tuft:new THREE.ConeGeometry(.5,1,5).translate(0,.5,0),
};
const material=new THREE.MeshStandardMaterial({roughness:.98,flatShading:true});
const embers=new THREE.MeshStandardMaterial({color:BATTLEFIELD_DETAIL.ember,emissive:BATTLEFIELD_DETAIL.ember,emissiveIntensity:BATTLEFIELD_DETAIL.emberIntensity,roughness:1});
const noRaycast=()=>null;
function DetailBatch({kind,items,level}) {
  const ref=useRef();
  useLayoutEffect(()=>{
    const transform=new THREE.Object3D(),color=new THREE.Color(),snow=new THREE.Color(WINTER.snowColor);
    items.forEach((item,i)=>{
      transform.position.fromArray(item.position);transform.scale.fromArray(item.scale);transform.rotation.fromArray(item.rotation);transform.updateMatrix();
      color.set(item.color);
      if(kind!=='ember') {
        if(level===4)color.lerp(snow,kind==='basin'?.38:.65);
        if(level===2)color.multiplyScalar(.78);
      }
      ref.current.setMatrixAt(i,transform.matrix);ref.current.setColorAt(i,color);
    });
    ref.current.instanceMatrix.needsUpdate=true;
    if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;
    ref.current.computeBoundingSphere();
  },[items,kind,level]);
  return <instancedMesh name={`Battlefield detail ${kind}`} ref={ref} args={[geometries[kind],kind==='ember'?embers:material,items.length]} raycast={noRaycast} receiveShadow />;
}
export function BattlefieldDetail() {
  const [level,setLevel]=useState(gameState.currentLevel);
  useEffect(()=>{
    const update=level=>setLevel(level);EventBus.on('level-changed',update);
    return()=>EventBus.off('level-changed',update);
  },[]);
  return <group name="Visual-only battlefield dressing" visible={level!==5} dispose={null}>
    {Object.entries(FIELD_DETAIL).map(([kind,items])=><DetailBatch key={kind} kind={kind} items={items} level={level}/>)}
    <WreckSmoke level={level}/>
  </group>;
}