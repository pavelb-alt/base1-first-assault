import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BALANCE, FRONT, MAP, SECTORS } from '@/game/config';
const ENEMY_START_DELAY = BALANCE.enemy.startDelay ?? 0;
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { combat } from '@/game/3d/combat';
import { recordWave } from '@/game/3d/battleMetrics';
import { random } from '@/game/3d/random';
import { WEAPON_IDS } from '@/game/3d/weapons';
import { preferredSpawnSection } from '@/game/3d/navigation/frontline';
import { cargoShipState } from '@/game/3d/objects/cargoShipState';
import { CARGO_SHIP } from '@/game/config';

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
  })),timer:team==='enemy'?-ENEMY_START_DELAY:rules.interval,trilobiteTimer:0,nextId:0,waveId:0};
  const despawn=useCallback(id=>{
    const s=state.current,index=s.slots.findIndex(u=>u.active&&u.id===id);
    if(index<0)return;s.slots[index]={...s.slots[index],active:false};publish();
  },[]);
  useEffect(()=>{
    const reset=()=>{const s=state.current;s.slots=s.slots.map(u=>({...u,active:false,reserved:false}));s.timer=rules.interval;s.trilobiteTimer=0;s.waveId=0;if(team==='friendly')cargoShipState.reset();publish();};
    EventBus.on('reset-game',reset);return()=>EventBus.off('reset-game',reset);
  },[rules]);
  useFrame((_,delta)=>{
    if(gameState.paused)return;
    const s=state.current;
    // Activate soldiers from landed cargo ships (friendly only).
    if(team==='friendly'&&cargoShipState.readyDeliveries.length>0){
      let activated=false;
      for(const delivery of cargoShipState.readyDeliveries){
        for(const {index,spawnOffset} of delivery.slots){
          if(s.slots[index]&&s.slots[index].reserved){
            s.slots[index]={...s.slots[index],active:true,reserved:false,spawnOffset};
            activated=true;
          }
        }
      }
      cargoShipState.readyDeliveries.length=0;
      if(activated)publish();
    }
    s.timer=Math.min(rules.interval,s.timer+delta);
    // Carry fractional squad budgets across waves: 2 then 3 enemies per sector,
    // preserving the full five-member composition over each pair of waves.
    const budget=team==='enemy'?rules.squad.length*(rules.spawnScale??1):rules.perSector;
    const waveOffset=Math.floor(s.waveId*budget);
    const waveSize=Math.floor((s.waveId+1)*budget)-waveOffset;
    if(s.timer<rules.interval)return;
    // Slots belong to the faction pool, not permanently to a sector. Casualties
    // on one flank must not wait for an unrelated flank to free its own slots.
    const free=[];
    s.slots.forEach((u,i)=>{if(!u.active&&!(team==='friendly'&&u.reserved))free.push(i);});
    if(free.length<waveSize*SECTORS.length)return;
    s.waveId++;
    const counts=FRONT.sectionCenters.map(()=>0);
    for(const u of combat.units)if(u.alive&&u.team==='friendly'&&u.bodyRef.current){
      const section=u.assignment?.section??Math.max(0,Math.min(FRONT.sectionCenters.length-1,
        Math.floor((u.bodyRef.current.translation().x+MAP.HALF*0.9)/FRONT.sectionWidth)));
      counts[section]++;
    }
    const spawned=SECTORS.map(()=>0);
    if(team==='friendly'){
      // Reserve all slots first, then split them across a random number of ships
      // (1–6) so each wave feels different — sometimes one big drop, sometimes
      // many small ones, like real war logistics.
      const allSlots=[];
      for(let member=0;member<waveSize*SECTORS.length;member++){
        let sectorIndex=Math.floor(member/waveSize),least=Infinity;
        for(let sector=0;sector<SECTORS.length;sector++){
          const population=counts[sector*2]+counts[sector*2+1];
          if(population<least){least=population;sectorIndex=sector;}
        }
        const index=free[member];spawned[sectorIndex]++;
        s.slots[index]={...s.slots[index],reserved:true,sectorIndex,id:++s.nextId,squadId:`friendly-${s.waveId}`,
          type:'soldier',weaponId:WEAPON_IDS[Math.floor(random()*WEAPON_IDS.length)],spawnOffset:{x:0,z:0}};
        allSlots.push({index});
      }
      const shipCount=Math.min(allSlots.length,1+Math.floor(random()*6));
      const perShip=Math.ceil(allSlots.length/shipCount);
      for(let ship=0;ship<shipCount;ship++){
        const start=ship*perShip;
        cargoShipState.pendingDeliveries.push({deliveryId:++cargoShipState.nextDeliveryId,
          slots:allSlots.slice(start,start+perShip),waveId:s.waveId});
      }
      while(cargoShipState.pendingDeliveries.length>CARGO_SHIP.maxPending)cargoShipState.pendingDeliveries.shift();
    } else {
      for(let squad=0;squad<SECTORS.length;squad++)for(let member=0;member<waveSize;member++){
        let sectorIndex=squad;
        const index=free[squad*waveSize+member];spawned[sectorIndex]++;
        s.slots[index]={...s.slots[index],sectorIndex,id:++s.nextId,active:true,squadId:`${team}-${s.waveId}-${squad}`, 
          type:rules.squad[(waveOffset+member)%rules.squad.length],
          spawnOffset:spawnPosition(sectorIndex,team,member,s.waveId,counts)};
      }
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