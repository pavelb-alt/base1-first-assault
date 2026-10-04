import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { getStation, stationPosition, interactStation, exitStation, stationSnapshot } from '@/game/3d/stationControl';

export function StationControlSystem() {
  const timer=useRef(0);
  useEffect(()=>{
    const interact=()=>interactStation();
    const key=e=>{ if(e.code==='KeyE' && !e.repeat && !/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) && !e.target?.isContentEditable && gameState.mode==='third_person') { e.preventDefault(); interact(); } };
    const reset=()=>exitStation();
    EventBus.on('interact-station',interact); EventBus.on('reset-game',reset);
    window.addEventListener('keydown',key);
    return ()=>{ EventBus.off('interact-station',interact); EventBus.off('reset-game',reset); window.removeEventListener('keydown',key); exitStation(); };
  },[]);
  useFrame((_,delta)=>{
    if(gameState.paused) return;
    if(gameState.controlledStation) {
      const s=getStation(), p=stationPosition(s);
      if(!p) { const soldier=exitStation(); if(!soldier) EventBus.emit('release-soldier'); }
      else gameState.soldierPosition.set(p.x,p.y,p.z);
    }
    timer.current+=delta;
    if(timer.current>=0.2) { timer.current=0; EventBus.emit('station-status',stationSnapshot()); }
  },-1.5);
  return null;
}