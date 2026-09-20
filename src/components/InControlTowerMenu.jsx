import { useState, useEffect, useCallback, useRef } from 'react';
import { EventBus } from '@/game/EventBus';
import { TOWER_DEFENSE } from '@/game/config';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { gameState } from '@/game/3d/world';

const TOWER_SLOTS = [
  { key: '1', type: 'mg' },
  { key: '2', type: 'cannon' },
  { key: '3', type: 'frost' },
];

export function InControlTowerMenu({ visible }) {
  const [open, setOpen] = useState(false);
  const [scrap, setScrap] = useState(towerDefenseState.scrap);
  const openRef = useRef(false);

  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => {
    const onCurrency = (amt) => setScrap(amt);
    EventBus.on('currency-changed', onCurrency);
    return () => EventBus.off('currency-changed', onCurrency);
  }, []);

  const deployTower = useCallback((type) => {
    const pos = gameState.soldierPosition;
    if (!pos) return;
    const position = { x: pos.x, z: pos.z };
    if (position.z <= TOWER_DEFENSE.friendlyHalfZ) return;
    for (const t of towerDefenseState.towers) {
      if (Math.hypot(t.position.x - position.x, t.position.z - position.z) < TOWER_DEFENSE.minSpacing) return;
    }
    if (towerDefenseState.spend(type, position)) {
      setScrap(towerDefenseState.scrap);
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) { setOpen(false); return; }
    const onKeyDown = (e) => {
      if (e.code === 'KeyE') {
        e.preventDefault();
        setOpen(prev => !prev);
      } else if (openRef.current) {
        if (e.code === 'Escape') { setOpen(false); }
        else if (e.code === 'Digit1') { e.preventDefault(); deployTower('mg'); }
        else if (e.code === 'Digit2') { e.preventDefault(); deployTower('cannon'); }
        else if (e.code === 'Digit3') { e.preventDefault(); deployTower('frost'); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, deployTower]);

  if (!visible) return null;

  return (
    <>
      {/* E hint when menu closed */}
      {!open && (
        <div className="absolute bottom-20 right-4 px-4 py-2 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10 pointer-events-none">
          <div className="text-slate-300 text-xs">
            <span className="text-white font-semibold">E</span> Deploy Tower
          </div>
        </div>
      )}

      {/* Tower selection panel */}
      {open && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 pointer-events-none z-40">
          <div className="flex gap-3 p-4 rounded-xl bg-black/80 backdrop-blur-md border border-orange-500/30 shadow-2xl">
            {TOWER_SLOTS.map(({ key, type }) => {
              const cfg = TOWER_DEFENSE.towers[type];
              const affordable = scrap >= cfg.cost;
              return (
                <div
                  key={type}
                  className={`flex flex-col items-center justify-center w-28 h-24 rounded-lg border ${
                    affordable ? 'border-orange-500/50 bg-orange-950/30' : 'border-slate-700 bg-slate-900/50 opacity-40'
                  }`}
                >
                  <div className="text-white font-bold text-sm">{cfg.name.split(' ')[0]}</div>
                  <div className="text-orange-400 text-xs mt-1">◈ {cfg.cost}</div>
                  <div className="mt-2 px-2 py-0.5 rounded bg-white/10 text-white text-xs font-mono">{key}</div>
                </div>
              );
            })}
          </div>
          <div className="text-center text-slate-400 text-xs mt-2">
            Press 1/2/3 to deploy at your position · E or Esc to close
          </div>
        </div>
      )}
    </>
  );
}