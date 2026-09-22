import { useEffect, useState } from 'react';
import { EventBus } from '@/game/EventBus';

const ORDER_TEXT = {
  move: o => (o.arrived ? 'Holding position' : 'Moving to position'),
  attack: o => `Attacking ${o.targetType} #${o.targetId}`,
  bombard: () => 'Bombarding area',
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
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/60 border border-white/10 text-slate-300 text-xs">
        Left-click a soldier or artillery piece to give it orders
      </div>
    );
  }

  const { unit, mode, order } = sel;
  const artillery = unit.type === 'artillery';
  const hp = unit.health / unit.maxHealth;
  const modeBtn = (m, label, key) => (
    <button
      onClick={() => EventBus.emit('set-command-mode', m)}
      className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${mode === m ? 'bg-teal-400 text-slate-950' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
    >
      {label} <span className="opacity-60 text-xs">({key})</span>
    </button>
  );

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[360px] rounded-xl bg-black/80 backdrop-blur-sm border border-teal-400/40 shadow-xl p-3 pointer-events-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="text-white font-bold text-sm tracking-wide">
          {artillery ? '🎯 Artillery' : '🪖 Soldier'} <span className="text-slate-400 font-normal">#{unit.id}</span>
        </div>
        <button onClick={() => EventBus.emit('deselect-unit')} className="text-slate-400 hover:text-white text-xs">
          Deselect (Esc)
        </button>
      </div>
      <div className="h-1.5 rounded bg-slate-700 overflow-hidden mb-2">
        <div className={`h-full ${hp > 0.5 ? 'bg-green-500' : hp > 0.25 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${hp * 100}%` }} />
      </div>
      <div className="flex gap-2 mb-2">
        {modeBtn('move', 'Move', 'M')}
        {modeBtn('target', artillery ? 'Fire Mission' : 'Attack', 'T')}
        <button
          onClick={() => EventBus.emit('clear-unit-orders')}
          disabled={!order}
          className="ml-auto px-3 py-1.5 rounded-md text-sm bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40"
        >
          Auto <span className="opacity-60 text-xs">(C)</span>
        </button>
      </div>
      <div className="text-xs text-slate-300">
        {mode === 'move'
          ? 'Left-click the ground to move there.'
          : artillery ? 'Left-click an enemy or any area to shell it.' : 'Left-click an enemy to focus fire on it.'}
      </div>
      <div className="text-xs mt-1 text-teal-300">
        {order ? ORDER_TEXT[order.type](order) : 'Automatic (AI control)'}
      </div>
      {feedback && <div className="text-xs mt-1 text-amber-300">{feedback}</div>}
    </div>
  );
}