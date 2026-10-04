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
        <div className="absolute bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 w-[420px] max-w-[calc(100%-2rem)] p-3 rounded-xl bg-black/85 border border-teal-400/30 text-slate-200 text-xs pointer-events-auto">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-teal-300 font-bold tracking-widest">GROUND COMMAND</span>
            <button onClick={() => EventBus.emit('select-all-units')} className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-white font-semibold">Select all troops</button>
          </div>
          Click a unit or drag a box to select a squad.<br />
          <span className="text-slate-400">Shift: add/remove units · Ctrl+A: select all · Right-click: towers</span>
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
      className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${mode === m ? 'bg-teal-400 text-slate-950' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
    >
      {label} <span className="opacity-60 text-xs">({key})</span>
    </button>
  );

  return (
    <>
    <RTSSelectionBox />
    <div className="absolute bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 w-[460px] max-w-[calc(100%-2rem)] rounded-xl bg-black/90 backdrop-blur-sm border border-teal-400/40 shadow-xl p-3 pointer-events-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="text-white font-bold text-sm tracking-wide">
          {count > 1 ? `${count} UNITS SELECTED` : `${unit.type === 'artillery' ? 'Artillery' : unit.type === 'tank' ? 'Tank' : 'Soldier'} #${unit.id}`}
          <button onClick={() => EventBus.emit('select-all-units')} className="ml-3 text-xs text-teal-300 hover:text-teal-100 font-normal">Select all troops</button>
        </div>
        <button onClick={() => EventBus.emit('deselect-unit')} className="text-slate-400 hover:text-white text-xs">
          Deselect (Esc)
        </button>
      </div>
      <div className="h-1.5 rounded bg-slate-700 overflow-hidden mb-2">
        <div className={`h-full ${hp > 0.5 ? 'bg-green-500' : hp > 0.25 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${hp * 100}%` }} />
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {count === 1 && ['tank','artillery','soldier'].includes(unit.type) && <button onClick={() => EventBus.emit('possess-unit',{type:unit.type,id:unit.id})} className="px-3 py-1.5 rounded-md text-sm font-bold bg-orange-600 hover:bg-orange-500 text-white">Take control</button>}
        {modeBtn('move', 'Move', 'M')}
        {modeBtn('target', artillery ? 'Fire Mission' : 'Attack', 'T')}
        <button onClick={() => EventBus.emit('hold-position')} className="px-3 py-1.5 rounded-md text-sm font-semibold bg-slate-800 text-white hover:bg-slate-700">Hold <span className="opacity-60 text-xs">(H)</span></button>
        <button
          onClick={() => EventBus.emit('clear-unit-orders')}
          disabled={!units.some(u => u.order)}
          className="ml-auto px-3 py-1.5 rounded-md text-sm bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40"
        >
          Auto <span className="opacity-60 text-xs">(C)</span>
        </button>
      </div>
      <div className="text-xs text-slate-300">
        {mode === 'move'
          ? 'Click ground to move in formation · Click enemy to attack.'
          : artillery ? 'Left-click an enemy or any area to shell it.' : 'Left-click an enemy to focus fire on it.'}
      </div>
      <div className="text-xs mt-1 text-teal-300">
        {mixedOrders ? 'Multiple orders active' : order ? ORDER_TEXT[order.type]?.(order) : 'Automatic (AI control)'}
      </div>
      <div className="text-[11px] mt-1 text-slate-400">Drag: select squad · Shift: add/remove · Ctrl+A: all troops</div>
      {feedback && <div className="text-xs mt-1 text-amber-300">{feedback}</div>}
    </div>
    </>
  );
}