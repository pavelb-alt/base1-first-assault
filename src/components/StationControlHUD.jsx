import { useEffect, useState } from 'react';
import { EventBus } from '@/game/EventBus';

export function StationControlHUD({visible}) {
  const [status,setStatus]=useState({active:null,nearby:null});
  useEffect(()=>{ const update=s=>setStatus(s); EventBus.on('station-status',update); return()=>EventBus.off('station-status',update); },[]);
  if(!visible || (!status.active && !status.nearby)) return null;
  const active=status.active;
  return <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-xl border border-orange-300/40 bg-black/90 p-4 text-center text-white max-w-[calc(100%-2rem)] pointer-events-auto">
    <div className="text-sm font-bold tracking-widest text-orange-300">{active ? `${active.name} #${active.id}` : `NEARBY ${status.nearby.type.toUpperCase()}`}</div>
    {active && <div className="mt-1 text-xs text-slate-200">{active.type==='tower' ? 'Mouse: aim · Left click: fire' : 'WASD: drive · Mouse: aim · Left click: fire'} · {active.cooldown>0 ? `Reloading ${active.cooldown.toFixed(1)}s` : 'Ready to fire'}</div>}
    <button className="mt-2 rounded bg-orange-600 hover:bg-orange-500 px-4 py-2 text-sm font-bold" onClick={()=>EventBus.emit('interact-station')}>{active ? 'Exit gun position (E)' : 'Enter gun position (E)'}</button>
  </div>;
}