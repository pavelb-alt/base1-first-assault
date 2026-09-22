import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { MAP, DRESSING } from '@/game/config';
import { SCENERY } from '@/game/3d/dressing/sceneryLayout';

const geometries={
  rock:new THREE.IcosahedronGeometry(.5,0),
  box:new THREE.BoxGeometry(1,1,1),
  cylinder:new THREE.CylinderGeometry(.5,.5,1,8),
  dish:new THREE.SphereGeometry(.5,12,5,0,Math.PI*2,0,Math.PI/2),
  treeTrunk:new THREE.CylinderGeometry(.5,.5,1,6),
  treeFoliage:new THREE.ConeGeometry(.5,1,7),
};
const material=new THREE.MeshStandardMaterial({roughness:.94,flatShading:true});
const apronMaterial=new THREE.MeshStandardMaterial({color:MAP.GROUND_COLOR,roughness:1});
// A literal square ring: no hidden plane beneath any playable trench or ramp.
const edge=DRESSING.perimeterSize/2, hole=MAP.HALF;
const shape=new THREE.Shape();shape.moveTo(-edge,-edge);shape.lineTo(edge,-edge);shape.lineTo(edge,edge);shape.lineTo(-edge,edge);shape.closePath();
const cutout=new THREE.Path();cutout.moveTo(-hole,-hole);cutout.lineTo(-hole,hole);cutout.lineTo(hole,hole);cutout.lineTo(hole,-hole);cutout.closePath();shape.holes.push(cutout);
const apron=new THREE.ShapeGeometry(shape);
const noRaycast=()=>null;
function SceneryBatch({kind,items}) {
  const ref=useRef();
  useLayoutEffect(()=>{
    const transform=new THREE.Object3D(),color=new THREE.Color();
    items.forEach((item,i)=>{
      transform.position.fromArray(item.position);transform.scale.fromArray(item.scale);transform.rotation.fromArray(item.rotation);transform.updateMatrix();
      ref.current.setMatrixAt(i,transform.matrix);ref.current.setColorAt(i,color.set(item.color));
    });
    ref.current.instanceMatrix.needsUpdate=true;
    if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;
    ref.current.computeBoundingSphere();
  },[items]);
  return <instancedMesh name={`Perimeter ${kind}`} ref={ref} args={[geometries[kind],material,items.length]} raycast={noRaycast} castShadow={kind !== 'rock' && kind !== 'treeFoliage'} receiveShadow />;
}
export function BattlefieldDressing() {
  // Deliberately outside RigidBody and outside both bases' shotCover groups.
  return <group name="Non-playable perimeter dressing" dispose={null}>
    <mesh name="Perimeter earth ring" geometry={apron} material={apronMaterial} rotation={[-Math.PI/2,0,0]} position={[0,-.025,0]} raycast={noRaycast} receiveShadow />
    {Object.entries(SCENERY).map(([kind,items])=><SceneryBatch key={kind} kind={kind} items={items}/>)}
  </group>;
}