import { useState, useEffect, useCallback, useRef } from 'react';
import { EventBus } from '@/game/EventBus';
import { TOWER_DEFENSE } from '@/game/config';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { gameState } from '@/game/3d/world';
import { TOWER_ICONS } from '@/components/tactical/icons';

const TOWER_SLOTS = [
  { key: '1', type: 'mg' },
  { key: '2', type: 'cannon' },
  { key: '3', type: 'frost' },
];

export function InControlTowerMenu({ visible }) {
  const [open, setOpen] = useState(false);
  const [inStation, setInStation] = useState(false);
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    const update = s => { setInStation(!!s); setOpen(false); };
    EventBus.on('station-changed', update);
    return () => EventBus.off('station-changed', update);
  }, []);
  const [scrap, setScrap] = useState(towerDefenseState.scrap);
  const openRef = useRef(false);

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const onCurrency = (amt) => setScrap(amt);
    EventBus.on('currency-changed', onCurrency);
    return () => EventBus.off('currency-changed', onCurrency);
  }, []);

  const deployTower = useCallback((type) => {
    if (gameState.controlledStation || gameState.paused) return;
    const pos = gameState.soldierPosition;
    if (!pos) return;
    const position = { x: pos.x, z: pos.z };
    // Report why a deployment is refused instead of silently ignoring the key.
    const problem = towerDefenseState.placementProblem(type, position);
    if (problem) { setNotice({ text: problem, tone: 'bad' }); return; }
    if (towerDefenseState.spend(type, position)) {
      setScrap(towerDefenseState.scrap);
      setNotice({ text: `${TOWER_DEFENSE.towers[type].name} inbound`, tone: 'good' });
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) { setOpen(false); return; }
    const onKeyDown = (e) => {
      if (gameState.controlledStation || gameState.paused || e.repeat) return;
      if (e.code === 'KeyB') {
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

  if (!visible || inStation) return null;

  return (
    <>
      {notice && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[208px] pointer-events-none hud-root">
          <div className={`hud-panel px-3 py-1 text-xs font-semibold ${notice.tone === 'good' ? 'text-teal-300' : 'text-red-300'}`}>{notice.text}</div>
        </div>
      )}
      {!open && (
        <div className="absolute bottom-20 right-4 hud-root hud-panel px-3 py-1.5 pointer-events-none flex items-center gap-2 text-xs text-stone-300">
          <span className="hud-key">B</span> Deploy tower
        </div>
      )}

      {open && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-40 hud-root">
          <div className="hud-panel hud-panel-accent flex gap-2 p-3">
            {TOWER_SLOTS.map(({ key, type }) => {
              const cfg = TOWER_DEFENSE.towers[type], Icon = TOWER_ICONS[type];
              const affordable = scrap >= cfg.cost;
              return (
                <div key={type} className={`flex flex-col items-center justify-center w-24 h-24 rounded-sm border ${affordable ? 'border-amber-400/50 bg-amber-500/10' : 'border-white/10 bg-black/30 opacity-50'}`}>
                  <Icon size={18} className={affordable ? 'text-amber-300' : 'text-stone-500'} />
                  <div className="hud-title text-xs mt-1">{cfg.name.split(' ')[0]}</div>
                  <div className={`text-xs ${affordable ? 'text-amber-200' : 'text-red-400'}`}>{cfg.cost}</div>
                  <span className="hud-key mt-1">{key}</span>
                </div>
              );
            })}
          </div>
          <div className="text-center hud-label mt-2">1 / 2 / 3 deploy at your position · B or Esc to close</div>
        </div>
      )}
    </>
  );
}
