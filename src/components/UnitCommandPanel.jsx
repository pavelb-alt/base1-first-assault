import { useEffect, useState } from 'react';
import { EventBus } from '@/game/EventBus';
import { RTSSelectionBox } from '@/components/RTSSelectionBox';

const ORDER_TEXT = {
  move: o => (o.arrived ? 'Holding position' : 'Moving to position'),
  attack: o => `Attacking ${o.targetType} #${o.targetId}`,
  bombard: () => 'Bombarding area',
  hold: () => 'Holding position · defensive fire enabled',
};

// Strategic-view panel for the selected unit. Leaf component: owns its ticking state.
export function UnitCommandPanel({ visible }) {
  const [sel, setSel] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const onSelection = s => setSel(s.unit ? s : null);
    const onFeedback = msg => setFeedback(msg);
    EventBus.on('selection-changed', onSelection);
    EventBus.on('command-feedback', onFeedback);
    return () => {
      EventBus.off('selection-changed', onSelection);
      EventBus.off('command-feedback', onFeedback);
    };
  }, []);
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(t);
  }, [feedback]);

  if (!visible) return null;
  if (!sel) {
    return (
      <>
        <RTSSelectionBox />
        <div className="absolute bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 w-[440px] max-w-[calc(100%-2rem)] px-3 py-2 hud-root hud-panel text-stone-300 text-xs pointer-events-auto">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="hud-title text-teal-300 text-xs tracking-[0.25em]">Ground command</span>
            <button onClick={() => EventBus.emit('select-all-units')} className="hud-btn px-3 py-1 text-[10px]">Select all troops</button>
          </div>
          Click a unit or drag a box to select a squad. Click a tower to upgrade it.
          <div className="text-stone-400 mt-0.5">
            <span className="hud-key !text-[9px] !h-4">1</span><span className="hud-key !text-[9px] !h-4 ml-0.5">2</span><span className="hud-key !text-[9px] !h-4 ml-0.5">3</span> / Right-click: build
            · <span className="hud-key !text-[9px] !h-4">N</span> call wave · <span className="hud-key !text-[9px] !h-4">Q</span><span className="hud-key !text-[9px] !h-4 ml-0.5">R</span><span className="hud-key !text-[9px] !h-4 ml-0.5">F</span> abilities
          </div>
        </div>
      </>
    );
  }

  const { unit, mode, order } = sel;
  const count = sel.count ?? 1;
  const artillery = count === 1 && unit.type === 'artillery';
  const units = sel.units ?? [unit];
  const mixedOrders = units.some(u => u.order?.type !== order?.type);
  const hp = units.reduce((n,u) => n + u.health, 0) / units.reduce((n,u) => n + u.maxHealth, 0);
  const modeBtn = (m, label, key) => (
    <button
      onClick={() => EventBus.emit('set-command-mode', m)}
      className={`hud-btn px-3 py-1.5 text-[11px] ${mode === m ? '!bg-teal-400 !text-stone-950 !border-teal-200' : ''}`}
    >
      {label} <span className="opacity-60">({key})</span>
    </button>
  );

  return (
    <>
    <RTSSelectionBox />
    <div className="absolute bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 w-[460px] max-w-[calc(100%-2rem)] hud-root hud-panel border-l-2 !border-l-teal-300 p-3 pointer-events-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="hud-title text-sm text-stone-50">
          {count > 1 ? `${count} units selected` : `${unit.type === 'artillery' ? 'Artillery' : unit.type === 'tank' ? 'Tank' : 'Soldier'} #${unit.id}`}
          <button onClick={() => EventBus.emit('select-all-units')} className="ml-3 text-[10px] text-teal-300 hover:text-teal-100 font-normal tracking-widest">Select all</button>
        </div>
        <button onClick={() => EventBus.emit('deselect-unit')} className="text-stone-400 hover:text-white text-[11px] tracking-wider">
          Deselect <span className="hud-key !text-[9px] !h-4">Esc</span>
        </button>
      </div>
      <div className="h-1.5 rounded-sm bg-white/10 overflow-hidden mb-2">
        <div className={`h-full ${hp > 0.5 ? 'bg-teal-300' : hp > 0.25 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${hp * 100}%` }} />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {count === 1 && ['tank','artillery','soldier'].includes(unit.type) && <button onClick={() => EventBus.emit('possess-unit',{type:unit.type,id:unit.id})} className="hud-btn hud-btn-primary px-3 py-1.5 text-[11px]">Take control</button>}
        {modeBtn('move', 'Move', 'M')}
        {modeBtn('target', artillery ? 'Fire Mission' : 'Attack', 'T')}
        <button onClick={() => EventBus.emit('hold-position')} className="hud-btn px-3 py-1.5 text-[11px]">Hold <span className="opacity-60">(H)</span></button>
        <button
          onClick={() => EventBus.emit('clear-unit-orders')}
          disabled={!units.some(u => u.order)}
          className="hud-btn ml-auto px-3 py-1.5 text-[11px]"
        >
          Auto <span className="opacity-60">(C)</span>
        </button>
      </div>
      <div className="text-xs text-stone-300">
        {mode === 'move'
          ? 'Click ground to move in formation · Click enemy to attack.'
          : artillery ? 'Left-click an enemy or any area to shell it.' : 'Left-click an enemy to focus fire on it.'}
      </div>
      <div className="text-xs mt-1 text-teal-300">
        {mixedOrders ? 'Multiple orders active' : order ? ORDER_TEXT[order.type]?.(order) : 'Automatic (AI control)'}
      </div>
      <div className="text-[11px] mt-1 text-stone-400">Drag: select squad · Shift: add/remove · Ctrl+A: all troops</div>
      {feedback && <div className="text-xs mt-1 text-amber-300">{feedback}</div>}
    </div>
    </>
  );
}
