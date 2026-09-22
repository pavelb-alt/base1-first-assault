import { useState, useCallback } from 'react';
import { OPENING, LEVELS } from '@/game/config';

const BINDINGS = [
  { mode: 'Strategic View', keys: [
    { k: 'WASD', d: 'Pan Camera' },
    { k: 'Wheel', d: 'Zoom' },
    { k: 'Click Soldier', d: 'Select' },
  ]},
  { mode: 'Third-Person', keys: [
    { k: 'WASD', d: 'Move Soldier' },
    { k: 'Space', d: 'Jump / Double Jump' },
    { k: 'Mouse', d: 'Look Around' },
    { k: 'Left Click', d: 'Shoot' },
    { k: 'Right Click', d: 'Aim Down Sights' },
    { k: 'Tab / Esc', d: 'Release Control' },
  ]},
];

export function MainMenu({ onStart }) {
  const [showControls, setShowControls] = useState(false);

  const handleStart = useCallback(() => { onStart(); }, [onStart]);
  const handleStartNight = useCallback(() => { onStart(2); }, [onStart]);
  const handleStartForest = useCallback(() => { onStart(3); }, [onStart]);

  return (
    <div className="absolute inset-0 z-50 overflow-hidden">
      <img
        src={OPENING.menuBackgroundUrl}
        className="absolute inset-0 w-full h-full object-cover"
        alt=""
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/80" />

      <div className="absolute right-0 top-0 bottom-0 w-full md:w-1/2 flex flex-col items-center justify-center px-8">
        <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-2 tracking-wider text-center"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>
          BASE1 : FIRST ASSAULT
        </h1>
        <div className="text-orange-400 text-sm font-semibold tracking-[0.3em] uppercase mb-10">
          Tactical Warfare Simulation
        </div>

        <button
          onClick={handleStart}
          className="px-12 py-4 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white text-xl font-bold rounded-lg shadow-xl transition-colors mb-4 focus:outline-none focus:ring-4 focus:ring-orange-400/50"
        >
          START MISSION
        </button>

        <button
          onClick={handleStartNight}
          className="px-8 py-2 bg-indigo-700/90 hover:bg-indigo-600 active:bg-indigo-800 text-white text-base font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-4"
        >
          ☾ NIGHT LEVEL (TEST)
        </button>

        <button
          onClick={handleStartForest}
          className="px-8 py-2 bg-green-700/90 hover:bg-green-600 active:bg-green-800 text-white text-base font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-400 mb-4"
        >
          🌲 FOREST LEVEL (TEST)
        </button>

        <button
          onClick={() => setShowControls(true)}
          className="px-8 py-2 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-900 text-white text-base rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          CONTROLS
        </button>
      </div>

      {showControls && (
        <div
          className="absolute inset-0 grid place-items-center bg-black/85 backdrop-blur-sm"
          onClick={() => setShowControls(false)}
        >
          <div
            className="bg-slate-900/95 rounded-2xl p-8 max-w-lg border border-white/10 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Control Bindings</h2>
              <button
                onClick={() => setShowControls(false)}
                className="text-slate-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-6">
              {BINDINGS.map(group => (
                <div key={group.mode}>
                  <div className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">
                    {group.mode}
                  </div>
                  <div className="space-y-1.5">
                    {group.keys.map(item => (
                      <div key={item.k} className="flex items-center gap-3">
                        <span className="inline-block min-w-[110px] px-2.5 py-1 bg-slate-800 text-white text-sm font-mono rounded text-center">
                          {item.k}
                        </span>
                        <span className="text-slate-300 text-sm">{item.d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}