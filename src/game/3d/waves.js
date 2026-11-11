import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BALANCE, FRONT, MAP, SECTORS, WAVES, getEnemyRules, getMaxWaves } from '@/game/config';
import { EventBus } from '@/game/EventBus';
import { gameEvents } from '@/game/gameEvents';
import { gameState } from '@/game/3d/world';
import { combat } from '@/game/3d/combat';
import { recordWave, battle } from '@/game/3d/battleMetrics';
import { random } from '@/game/3d/random';
import { WEAPON_IDS } from '@/game/3d/weapons';
import { preferredSpawnSection } from '@/game/3d/navigation/frontline';
import { cargoShipState } from '@/game/3d/objects/cargoShipState';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { CARGO_SHIP } from '@/game/config';

// Live wave director state, read by the HUD and window.game. Module scope, per-frame.
export const waveState = {
  wave: 0, maxWaves: 0, level: 1,
  nextWaveIn: 0,          // seconds until the next wave (0 while saturated or done)
  interval: 0,
  holding: false,         // next wave is due but the field is saturated
  finalWaveSpawned: false,
  composition: null,      // id of the wave that last spawned
  nextComposition: null,
  boss: null,             // { name, maxHealth, entry, wave, final }
  difficulty: 'normal',
};
export function bossSnapshot() {
  const b = waveState.boss;
  if (!b) return null;
  return { name: b.name, health: Math.max(0, Math.round(b.entry?.alive ? b.entry.health : 0)), maxHealth: b.maxHealth,
    alive: !!b.entry?.alive, wave: b.wave, final: b.final, pending: !b.entry };
}
// Friendly reinforcement requests (commander ability). Consumed by the friendly pool.
const reinforcementRequests = [];
export function requestReinforcements(count) { reinforcementRequests.push(count); }

let enemyPool = null; // { state, rulesRef, publish }
let friendlyPool = null; // { state }
// Free friendly slots a commander reinforcement could fill right now.
export function reinforcementCapacity() {
  const s = friendlyPool?.state.current;
  if (!s) return 0;
  return s.slots.filter(u => !u.active && !u.reserved).length - reinforcementRequests.reduce((n, c) => n + c, 0);
}
// Drop queued deliveries beyond the cap, releasing their reserved slots so the pool never leaks.
function trimDeliveries(s, fromFront) {
  while (cargoShipState.pendingDeliveries.length > CARGO_SHIP.maxPending) {
    const dropped = fromFront ? cargoShipState.pendingDeliveries.shift() : cargoShipState.pendingDeliveries.pop();
    for (const { index } of dropped.slots) if (s.slots[index]?.reserved) s.slots[index] = { ...s.slots[index], reserved: false };
  }
}

export function isBossWave(wave, level) {
  const max = getMaxWaves(level);
  return wave === max || (wave > 0 && wave % WAVES.bossEvery === 0);
}
export function compositionFor(wave, level) {
  if (isBossWave(wave, level)) return 'boss';
  const opening = WAVES.openingWaves[level] ?? 1;
  if (wave <= opening) return 'standard';
  const cycle = WAVES.cycles[level] ?? WAVES.cycles[1];
  return cycle[(wave - opening - 1) % cycle.length];
}
// Deterministic weighted pick so a composition reads clearly every time it appears.
function weightedTypes(weights, count, offset) {
  const entries = Object.entries(weights), total = entries.reduce((n, [, w]) => n + w, 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    let t = ((i * 0.618034 + offset * 0.371) % 1) * total;
    for (const [type, w] of entries) { if ((t -= w) < 0) { out.push(type); break; } }
    if (out.length === i) out.push(entries[0][0]);
  }
  return out;
}
function squadTypes(compositionId, size, squad) {
  const comp = WAVES.compositions[compositionId] ?? WAVES.compositions.standard;
  const types = weightedTypes(comp.weights, size, squad);
  // Each squad keeps at least one 403 so no sector is a pure flyer stream unless intended.
  if (compositionId !== 'swarm' && !types.includes('spider403') && size > 2) types[1] = 'spider403';
  for (let i = 0; i < (comp.trilobitesPerSquad ?? 0) && i < size; i++) types[types.length - 1 - i] = 'trilobite';
  return types;
}

function spawnPosition(sectorIndex,team,member,waveId,counts) {
  const sector=SECTORS[sectorIndex];
  if(team==='friendly') {
    const section=preferredSpawnSection(sectorIndex,counts);
    counts[section]++;
    return {x:FRONT.sectionCenters[section]+((counts[section]-1)%6-2.5)*3,z:FRONT.spawnZ+(member%2)*2};
  }
  // Six columns per row: large squads wrap into extra rows instead of spilling past the map wall.
  const col=member%6,row=Math.floor(member/6);
  return {x:sector.minX+12+col*(sector.maxX-sector.minX-24)/5+((waveId%3)-1)*4,z:-FRONT.spawnZ-(col%2)*1.2+row*2.5};
}
function enemyRules(level) {
  return getEnemyRules(level, towerDefenseState.refreshDifficulty());
}
function bossProfile(level, final, rules) {
  const B = WAVES.boss;
  const health = BALANCE.units.trilobite.health * (B.health + B.healthPerLevel * (level - 1)) * (final ? B.finalHealthBonus : 1) * (rules.healthScale ?? 1);
  return { name: `${B.names[level] ?? B.names[1]}${final ? B.finalSuffix : ''}`, health: Math.round(health),
    scale: final ? B.finalScale : B.scale };
}
// Friendly soldier slots reserved and split across cargo ships.
function dispatchFriendly(s,free,count,waveTag) {
  const counts=FRONT.sectionCenters.map(()=>0);
  for(const u of combat.units)if(u.alive&&u.team==='friendly'&&u.bodyRef.current){
    const section=u.assignment?.section??Math.max(0,Math.min(FRONT.sectionCenters.length-1,
      Math.floor((u.bodyRef.current.translation().x+MAP.HALF*0.9)/FRONT.sectionWidth)));
    counts[section]++;
  }
  const spawned=SECTORS.map(()=>0),allSlots=[];
  const perSector=Math.max(1,Math.ceil(count/SECTORS.length));
  for(let member=0;member<count&&member<free.length;member++){
    let sectorIndex=Math.floor(member/perSector),least=Infinity;
    for(let sector=0;sector<SECTORS.length;sector++){
      const population=counts[sector] || 0;
      if(population<least){least=population;sectorIndex=sector;}
    }
    const index=free[member];spawned[sectorIndex]++;counts[sectorIndex]++;
    s.slots[index]={...s.slots[index],reserved:true,sectorIndex,id:++s.nextId,squadId:`friendly-${waveTag}`,
      type:'soldier',weaponId:WEAPON_IDS[Math.floor(random()*WEAPON_IDS.length)],spawnOffset:{x:0,z:0}};
    allSlots.push({index});
  }
  return {spawned,allSlots};
}

// Reusable population pools. Sectors allocate width, never constrain navigation.
export function useWavePool(team) {
  const levelRef=useRef(gameState.currentLevel);
  const rulesRef=useRef(null);
  if(!rulesRef.current)rulesRef.current=team==='enemy'?enemyRules(levelRef.current):BALANCE[team];
  const rules=rulesRef.current,size=team==='enemy'?rules.squad.length:rules.perSector;
  const [,publish]=useReducer(n=>n+1,0);
  const state=useRef(null);
  if(!state.current)state.current={slots:Array.from({length:rules.maxAlive},(_,slot)=>({
    slot,id:-slot-1,active:false,sectorIndex:Math.floor(slot/rules.maxPerSector),
    type:team==='enemy'?rules.squad[slot%size]:'soldier',weaponId:WEAPON_IDS[slot%WEAPON_IDS.length],spawnOffset:{x:0,z:0},squadId:0,
  })),timer:team==='enemy'?-(rules.startDelay??0):rules.interval,trilobiteTimer:0,nextId:0,waveId:0,breather:0};
  const despawn=useCallback(id=>{
    const s=state.current,index=s.slots.findIndex(u=>u.active&&u.id===id);
    if(index<0)return;s.slots[index]={...s.slots[index],active:false,elite:null};publish();
  },[]);
  useEffect(()=>{
    if(team==='enemy'){
      enemyPool={state,rulesRef,publish};
      towerDefenseState.beginMission();
    } else friendlyPool={state};
    const resetWaveState=()=>{
      if(team!=='enemy')return;
      Object.assign(waveState,{wave:0,maxWaves:getMaxWaves(gameState.currentLevel),level:gameState.currentLevel,nextWaveIn:0,
        holding:false,finalWaveSpawned:false,composition:null,nextComposition:compositionFor(1,gameState.currentLevel),boss:null,
        difficulty:towerDefenseState.difficultyId});
    };
    resetWaveState();
    const reset=()=>{
      const s=state.current;
      if(team==='enemy'){levelRef.current=gameState.currentLevel;rulesRef.current=enemyRules(levelRef.current);}
      s.slots=s.slots.map(u=>({...u,active:false,reserved:false,elite:null}));
      s.timer=team==='enemy'?-(rulesRef.current.startDelay??0):rulesRef.current.interval;s.trilobiteTimer=0;s.waveId=0;s.breather=0;
      if(team==='friendly'){cargoShipState.reset();reinforcementRequests.length=0;}
      resetWaveState();publish();
    };
    const onLevelChanged=()=>{
      levelRef.current=gameState.currentLevel;
      rulesRef.current=team==='enemy'?enemyRules(levelRef.current):BALANCE[team];
      const nr=rulesRef.current,ns=team==='enemy'?nr.squad.length:nr.perSector;
      const s=state.current;
      s.slots=s.slots.map((u,slot)=>({...u,active:false,reserved:false,elite:null,
        type:team==='enemy'?nr.squad[slot%ns]:'soldier'}));
      s.timer=team==='enemy'?-(nr.startDelay??0):nr.interval;
      s.trilobiteTimer=0;s.waveId=0;s.breather=0;resetWaveState();publish();
    };
    EventBus.on('reset-game',reset);EventBus.on('level-changed',onLevelChanged);
    return()=>{
      EventBus.off('reset-game',reset);EventBus.off('level-changed',onLevelChanged);
      if(team==='enemy'&&enemyPool?.state===state)enemyPool=null;
      if(team==='friendly'&&friendlyPool?.state===state)friendlyPool=null;
    };
  },[]);
  useFrame((_,delta)=>{
    if(gameState.paused)return;
    const s=state.current,rules=rulesRef.current;
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
      if(activated){cargoShipState.firstSquadDeployed=true;publish();}
    }
    // Commander reinforcements: an extra cargo-ship squad outside the regular cadence.
    if(team==='friendly'&&reinforcementRequests.length){
      const count=reinforcementRequests.shift();
      const free=[];s.slots.forEach((u,i)=>{if(!u.active&&!u.reserved)free.push(i);});
      if(free.length){
        const {allSlots}=dispatchFriendly(s,free,count,`reinforce-${s.nextId}`);
        if(allSlots.length){
          // Jump the queue: the commander's squad flies first.
          cargoShipState.pendingDeliveries.unshift({deliveryId:++cargoShipState.nextDeliveryId,slots:allSlots,waveId:'reinforce'});
          trimDeliveries(s,false);
        }
      }
    }
    const level=levelRef.current;
    if(team==='enemy'){
      const max=getMaxWaves(level);
      waveState.maxWaves=max;waveState.level=level;waveState.interval=rules.interval+s.breather;
      if(s.waveId>=max){waveState.finalWaveSpawned=true;waveState.nextWaveIn=0;waveState.holding=false;return;}
    }
    const interval=rules.interval+(team==='enemy'?s.breather:0);
    s.timer=Math.min(interval,s.timer+delta);
    // Preserve the existing level-specific fractional spawn budget and wave cadence.
    const budget=team==='enemy'?rules.squad.length*(rules.spawnScale??1):rules.perSector;
    const nextWave=s.waveId+1;
    const compositionId=team==='enemy'?compositionFor(nextWave,level):null;
    const sizeScale=team==='enemy'?(WAVES.compositions[compositionId]?.sizeScale??1):1;
    const waveOffset=Math.floor(s.waveId*budget);
    const waveSize=Math.max(team==='enemy'?3:1,Math.round((Math.floor((s.waveId+1)*budget)-waveOffset)*sizeScale));
    if(team==='enemy'){waveState.nextWaveIn=Math.max(0,interval-s.timer);waveState.nextComposition=compositionId;}
    // Slots belong to the faction pool, not permanently to a sector. Casualties
    // on one flank must not wait for an unrelated flank to free its own slots.
    const free=[];
    s.slots.forEach((u,i)=>{if(!u.active&&!(team==='friendly'&&u.reserved))free.push(i);});
    if(team==='enemy')waveState.holding=s.timer>=interval&&free.length<waveSize*SECTORS.length;
    if(s.timer<interval)return;
    if(free.length<waveSize*SECTORS.length)return;
    s.waveId++;
    let spawned=SECTORS.map(()=>0);
    if(team==='friendly'){
      // Reserve all slots first, then split them across a random number of ships
      // (1–6) so each wave feels different — sometimes one big drop, sometimes
      // many small ones, like real war logistics.
      const result=dispatchFriendly(s,free,waveSize*SECTORS.length,s.waveId);
      spawned=result.spawned;
      const allSlots=result.allSlots;
      const shipCount=Math.min(allSlots.length,1+Math.floor(random()*6));
      const perShip=Math.ceil(allSlots.length/shipCount);
      for(let ship=0;ship<shipCount;ship++){
        const start=ship*perShip;
        cargoShipState.pendingDeliveries.push({deliveryId:++cargoShipState.nextDeliveryId,
          slots:allSlots.slice(start,start+perShip),waveId:s.waveId});
      }
      trimDeliveries(s,true);
    } else {
      const wave=s.waveId,max=getMaxWaves(level),boss=compositionId==='boss';
      const comp=WAVES.compositions[compositionId];
      const final=wave>=max;
      const bossInfo=boss?bossProfile(level,final,rules):null;
      for(let squad=0;squad<SECTORS.length;squad++){
        const types=squadTypes(compositionId,waveSize,squad+wave);
        for(let member=0;member<waveSize;member++){
          const sectorIndex=squad;
          const index=free[squad*waveSize+member];spawned[sectorIndex]++;
          // The boss leads the centre squad.
          const elite=boss&&squad===1&&member===0?{boss:true,name:bossInfo.name,health:bossInfo.health,scale:bossInfo.scale,final,wave}:null;
          s.slots[index]={...s.slots[index],sectorIndex,id:++s.nextId,active:true,squadId:`${team}-${s.waveId}-${squad}`,
            type:elite?'trilobite':types[member],elite,speedScale:comp?.speed??1,
            healthScale:rules.healthScale??1,damageScale:rules.damageScale??1,
            spawnOffset:spawnPosition(sectorIndex,team,member,s.waveId,FRONT.sectionCenters.map(()=>0))};
        }
      }
      waveState.wave=wave;waveState.composition=compositionId;
      if(final)waveState.finalWaveSpawned=true;
      s.breather=boss?WAVES.bossBreather:0;
      if(bossInfo){
        waveState.boss={name:bossInfo.name,maxHealth:bossInfo.health,entry:null,wave,final};
        gameEvents.emit('boss-spawn',{name:bossInfo.name,maxHealth:bossInfo.health,wave,final,level});
      }
      gameEvents.emit('wave-composition',{wave,composition:compositionId,label:comp?.label??compositionId,size:waveSize*SECTORS.length,boss:!!bossInfo,level});
    }
    s.timer=0;recordWave(team,s.waveId,spawned);publish();
  });
  return {slots:state.current.slots,despawn};
}

// Skip the remaining breather for a scrap bonus. Returns the bonus, or 0 if unavailable.
export function callWaveEarly() {
  const pool=enemyPool;
  if(!pool||gameState.paused||battle.gameOver)return 0;
  const s=pool.state.current,rules=pool.rulesRef.current;
  if(s.waveId>=getMaxWaves(gameState.currentLevel))return 0;
  const interval=rules.interval+s.breather,remaining=interval-s.timer;
  if(remaining<1||waveState.holding)return 0;
  // Bonus is capped at one regular breather so the opening delay is not a scrap fountain.
  const bonus=Math.round(Math.min(remaining,interval)*WAVES.callEarlyScrapPerSecond*towerDefenseState.difficulty.scrap);
  s.timer=interval;
  towerDefenseState.addScrap(bonus);
  gameEvents.emit('wave-called-early',{wave:s.waveId+1,bonus,secondsSkipped:Math.round(remaining)});
  return bonus;
}
// Dev/QA: jump the director so wave n spawns next.
export function debugSkipToWave(n) {
  const pool=enemyPool;
  if(!pool)return false;
  const s=pool.state.current,max=getMaxWaves(gameState.currentLevel);
  const target=Math.max(1,Math.min(max,Math.floor(n)));
  s.waveId=target-1;s.breather=0;
  s.timer=pool.rulesRef.current.interval;
  battle.waves.enemy=target-1;towerDefenseState.wave=target-1;
  waveState.finalWaveSpawned=false;
  return true;
}
