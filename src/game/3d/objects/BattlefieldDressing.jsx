import { useLayoutEffect, useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MAP, DRESSING, WINTER, CITY } from '@/game/config';
import { CityEnvironment } from '@/game/3d/objects/CityEnvironment';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { SCENERY } from '@/game/3d/dressing/sceneryLayout';
import { createWindMaterial, windUniforms } from '@/game/3d/dressing/foliageWind';
import { useRenderQuality } from '@/game/3d/vfx/quality';

const geometries={
  rock:new THREE.IcosahedronGeometry(.5,0),
  box:new THREE.BoxGeometry(1,1,1),
  cylinder:new THREE.CylinderGeometry(.5,.5,1,8),
  dish:new THREE.SphereGeometry(.5,12,5,0,Math.PI*2,0,Math.PI/2),
  treeTrunk:new THREE.CylinderGeometry(.5,.5,1,6),
  treeFoliage:new THREE.ConeGeometry(.5,1,7),
  pineTrunk:new THREE.CylinderGeometry(.5,.5,1,5),
  pineFoliage:new THREE.ConeGeometry(.5,1,6),
  bush:new THREE.IcosahedronGeometry(.5,1),
  fallenLog:new THREE.CylinderGeometry(.5,.5,1,6),
  stump:new THREE.CylinderGeometry(.5,.4,1,5),
  fern:new THREE.ConeGeometry(.5,1,5),
};
const material=new THREE.MeshStandardMaterial({roughness:.94,flatShading:true});
// Same look plus a vertex-shader sway for crowns, bushes and ferns (no shadows cast).
const foliageMaterial=createWindMaterial(material);
const FOLIAGE=new Set(['treeFoliage','pineFoliage','bush','fern']);
const apronMaterial=new THREE.MeshStandardMaterial({color:MAP.GROUND_COLOR,roughness:1});
// A literal square ring: no hidden plane beneath any playable trench or ramp.
const edge=DRESSING.perimeterSize/2, hole=MAP.HALF;
const shape=new THREE.Shape();shape.moveTo(-edge,-edge);shape.lineTo(edge,-edge);shape.lineTo(edge,edge);shape.lineTo(-edge,edge);shape.closePath();
const cutout=new THREE.Path();cutout.moveTo(-hole,-hole);cutout.lineTo(-hole,hole);cutout.lineTo(hole,hole);cutout.lineTo(hole,-hole);cutout.closePath();shape.holes.push(cutout);
const apron=new THREE.ShapeGeometry(shape);
const noRaycast=()=>null;
function SceneryBatch({kind,items,winter}) {
  const ref=useRef();
  useLayoutEffect(()=>{
    const transform=new THREE.Object3D(),color=new THREE.Color(),snow=new THREE.Color(WINTER.snowColor);
    const snowMix=['treeFoliage','pineFoliage','bush','fern'].includes(kind)?0.85:kind==='rock'?0.65:0.18;
    items.forEach((item,i)=>{
      transform.position.fromArray(item.position);transform.scale.fromArray(item.scale);transform.rotation.fromArray(item.rotation);transform.updateMatrix();
      color.set(item.color);
      if(winter)color.lerp(snow,snowMix);
      ref.current.setMatrixAt(i,transform.matrix);ref.current.setColorAt(i,color);
    });
    ref.current.instanceMatrix.needsUpdate=true;
    if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;
    ref.current.computeBoundingSphere();
  },[items,kind,winter]);
  const noShadow = kind === 'rock' || kind === 'treeFoliage' || kind === 'bush' || kind === 'fern' || kind === 'pineFoliage';
  return <instancedMesh name={`Perimeter ${kind}`} ref={ref} args={[geometries[kind],FOLIAGE.has(kind)?foliageMaterial:material,items.length]} raycast={noRaycast} castShadow={!noShadow} receiveShadow />;
}
export function BattlefieldDressing() {
  const [level,setLevel]=useState(gameState.currentLevel);
  const {preset}=useRenderQuality();
  useEffect(()=>{windUniforms.windStrength.value=preset.foliageWind?1:0;},[preset]);
  useFrame((_,delta)=>{if(!gameState.paused)windUniforms.windTime.value+=delta;});
  const winter=level===4, city=level===5;
  useEffect(()=>{
    const update=level=>setLevel(level);
    EventBus.on('level-changed',update);
    return()=>EventBus.off('level-changed',update);
  },[]);
  useLayoutEffect(()=>{
    apronMaterial.color.set(city?CITY.asphalt:winter?WINTER.snowColor:MAP.GROUND_COLOR);
  },[winter,city]);
  // Deliberately outside RigidBody and outside both bases' shotCover groups.
  return <group name="Non-playable perimeter dressing" dispose={null}>
    <mesh name="Perimeter earth ring" geometry={apron} material={apronMaterial} rotation={[-Math.PI/2,0,0]} position={[0,-.025,0]} raycast={noRaycast} receiveShadow />
    {city ? <CityEnvironment /> : Object.entries(SCENERY).map(([kind,items])=><SceneryBatch key={kind} kind={kind} items={items} winter={winter}/>)}
  </group>;
}