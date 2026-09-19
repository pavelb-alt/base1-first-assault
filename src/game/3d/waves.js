import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BALANCE, FRONT, MAP, SECTORS } from '@/game/config';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { combat } from '@/game/3d/combat';
import { recordWave } from '@/game/3d/battleMetrics';
import { random } from '@/game/3d/random';
import { WEAPON_IDS } from '@/game/3d/weapons';
import { preferredSpawnSection } from '@/game/3d/navigation/frontline';

function spawnPosition(sectorIndex,team,member,waveId,counts) {
  const sector=SECTORS[sectorIndex];
  if(team==='friendly') {
    const section=preferredSpawnSection(sectorIndex,counts);
    counts[section]++;
    return {x:FRONT.sectionCenters[section]+((counts[section]-1)%6-2.5)*3,z:FRONT.spawnZ+(member%2)*2};
  }
  return {x:sector.minX+12+member*(sector.maxX-sector.minX-24)/5+((waveId%3)-1)*4,z:-FRONT.spawnZ-(member%2)*2};
}
// Reusable population pools. Sectors allocate width, never constrain navigation.
export function useWavePool(team) {
  const rules=BALANCE[team],size=team==='enemy'?rules.squad.length:rules.perSector;
  const [,publish]=useReducer(n=>n+1,0);
  const state=useRef(null);
  if(!state.current)state.current={slots:Array.from({length:rules.maxAlive},(_,slot)=>({
    slot,id:-slot-1,active:false,sectorIndex:Math.floor(slot/rules.maxPerSector),
    type:team==='enemy'?rules.squad[slot%size]:'soldier',weaponId:WEAPON_IDS[slot%WEAPON_IDS.length],spawnOffset:{x:0,z:0},squadId:0,
  })),timer:rules.interval,trilobiteTimer:0,nextId:0,waveId:0};
  const despawn=useCallback(id=>{
    const s=state.current,index=s.slots.findIndex(u=>u.active&&u.id===id);
    if(index<0)return;s.slots[index]={...s.slots[index],active:false};publish();
  },[]);
  useEffect(()=>{
    const reset=()=>{const s=state.current;s.slots=s.slots.map(u=>({...u,active:false}));s.timer=rules.interval;s.trilobiteTimer=0;s.waveId=0;publish();};
    EventBus.on('reset-game',reset);return()=>EventBus.off('reset-game',reset);
  },[rules]);
  useFrame((_,delta)=>{
    if(gameState.paused)return;
    const s=state.current;s.timer=Math.min(rules.interval,s.timer+delta);
    if(s.timer<rules.interval)return;
    // Slots belong to the faction pool, not permanently to a sector. Casualties
    // on one flank must not wait for an unrelated flank to free its own slots.
    const free=[];
    s.slots.forEach((u,i)=>{if(!u.active)free.push(i);});
    if(free.length<size*SECTORS.length)return;
    s.waveId++;
    const counts=FRONT.sectionCenters.map(()=>0);
    for(const u of combat.units)if(u.alive&&u.team==='friendly'&&u.bodyRef.current){
      const section=u.assignment?.section??Math.max(0,Math.min(FRONT.sectionCenters.length-1,
        Math.floor((u.bodyRef.current.translation().x+MAP.HALF*0.9)/FRONT.sectionWidth)));
      counts[section]++;
    }
    const spawned=SECTORS.map(()=>0);
    for(let squad=0;squad<SECTORS.length;squad++)for(let member=0;member<size;member++){
      let sectorIndex=squad;
      if(team==='friendly') {
        let least=Infinity;
        for(let sector=0;sector<SECTORS.length;sector++) {
          const population=counts[sector*2]+counts[sector*2+1];
          if(population<least){least=population;sectorIndex=sector;}
        }
      }
      const index=free[squad*size+member];spawned[sectorIndex]++;
      s.slots[index]={...s.slots[index],sectorIndex,id:++s.nextId,active:true,squadId:`${team}-${s.waveId}-${squad}`, 
        type:team==='enemy'?rules.squad[member]:'soldier',
        weaponId:team==='friendly'?WEAPON_IDS[Math.floor(random()*WEAPON_IDS.length)]:null,
        spawnOffset:spawnPosition(sectorIndex,team,member,s.waveId,counts)};
    }
    s.timer=0;recordWave(team,s.waveId,spawned);publish();
    // Trilobite spawns independently once every trilobiteInterval seconds.
    if(team==='enemy'){
      s.trilobiteTimer=Math.min(rules.trilobiteInterval,s.trilobiteTimer+delta);
      if(s.trilobiteTimer>=rules.trilobiteInterval){
        const triFree=[];
        s.slots.forEach((u,i)=>{if(!u.active)triFree.push(i);});
        if(triFree.length){
          const sectorIndex=Math.floor(random()*SECTORS.length);
          const index=triFree[0];
          s.slots[index]={...s.slots[index],sectorIndex,id:++s.nextId,active:true,squadId:`enemy-trilobite-${s.waveId}`,
            type:'trilobite',weaponId:null,
            spawnOffset:spawnPosition(sectorIndex,'enemy',0,s.waveId,counts)};
          s.trilobiteTimer=0;publish();
        }
      }
    }
  });
  return {slots:state.current.slots,despawn};
}