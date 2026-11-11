import { useEffect, useState } from 'react';
import { HeartPulse, Zap } from 'lucide-react';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { playerStatus } from '@/game/3d/objects/FriendlySoldierManager';
import { useTicker } from '@/components/tactical/useTicker';

// Sprint stamina + regen indicator for the possessed soldier (third-person, on foot).
function SoldierStatus() {
  useTicker(100);
  if (gameState.controlledStation || gameState.possessedSoldierId === null || playerStatus.id !== gameState.possessedSoldierId) return null;
  const pct = (playerStatus.stamina / playerStatus.maxStamina) * 100;
  return (
    <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 w-72 pointer-events-none hud-root" data-testid="soldier-status">
      <div className="flex items-center gap-2">
        <Zap size={12} className={playerStatus.exhausted ? 'text-red-400' : playerStatus.sprinting ? 'text-amber-300' : 'text-stone-400'} />
        <div className="flex-1 h-1 bg-white/10 rounded-sm overflow-hidden">
          <div className={`h-full ${playerStatus.exhausted ? 'bg-red-400' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="hud-label !text-[9px] w-20 text-right">{playerStatus.exhausted ? 'Winded' : 'Shift · Sprint'}</span>
      </div>
      {playerStatus.regenerating && (
        <div className="flex items-center justify-center gap-1 mt-1 text-[10px] tracking-[0.2em] text-teal-300 font-semibold">
          <HeartPulse size={11} /> REGENERATING
        </div>
      )}
    </div>
  );
}

export function StationControlHUD({visible}) {
  const [status,setStatus]=useState({active:null,nearby:null});
  useEffect(()=>{ const update=s=>setStatus(s); EventBus.on('station-status',update); return()=>EventBus.off('station-status',update); },[]);
  if(!visible) return null;
  const active=status.active;
  return <>
    <SoldierStatus />
    {(active || status.nearby) && (
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 hud-root hud-panel hud-panel-accent px-4 py-3 text-center max-w-[calc(100%-2rem)] pointer-events-auto">
        <div className="hud-title text-sm text-amber-300 tracking-[0.2em]">{active ? `${active.name} #${active.id}` : `Nearby ${status.nearby.type}`}</div>
        {active && <div className="mt-1 text-xs text-stone-200">
          {active.type==='tower' ? 'Mouse: aim · Left click: fire' : 'WASD: drive · Mouse: aim · Left click: fire'} ·{' '}
          <span className={active.fireBlocked ? 'text-red-300' : active.cooldown>0 ? 'text-amber-200' : 'text-teal-300'}>
            {active.fireBlocked ? 'Aim farther away: minimum range 14m' : active.cooldown>0 ? `Reloading ${active.cooldown.toFixed(1)}s` : 'Ready to fire'}
          </span>
        </div>}
        <button className="hud-btn hud-btn-primary mt-2 px-4 py-1.5 text-xs inline-flex items-center gap-2" onClick={()=>EventBus.emit('interact-station')}>
          {active ? 'Exit gun position' : 'Enter gun position'} <span className="hud-key !text-[10px]">E</span>
        </button>
      </div>
    )}
  </>;
}
