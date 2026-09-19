import { useState, useEffect } from 'react';
import { GameContainer } from '@/components/game/GameContainer';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';

export default function GamePage() {
  const [mode, setMode] = useState('strategic');
  const [selected, setSelected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  // EventBus subscriptions
  useEffect(() => {
    const onMode = (m) => { setMode(m); if (m === 'strategic') setSelected(false); };
    const onSelected = () => setSelected(true);
    const onDeselected = () => setSelected(false);
    const onLoaded = () => { setLoaded(true); setError(null); };
    const onError = (e) => setError(e);

    EventBus.on('mode-changed', onMode);
    EventBus.on('soldier-selected', onSelected);
    EventBus.on('soldier-deselected', onDeselected);
    EventBus.on('soldier-loaded', onLoaded);
    EventBus.on('soldier-error', onError);

    return () => {
      EventBus.off('mode-changed', onMode);
      EventBus.off('soldier-selected', onSelected);
      EventBus.off('soldier-deselected', onDeselected);
      EventBus.off('soldier-loaded', onLoaded);
      EventBus.off('soldier-error', onError);
    };
  }, []);

  // E key to possess when soldier is selected in strategic mode
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'KeyE' && mode === 'strategic' && selected) {
        EventBus.emit('possess-soldier');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, selected]);

  const handleReset = () => {
    gameState.mode = 'strategic';
    gameState.selectedSoldierId = null;
    gameState.possessedSoldierId = null;
    EventBus.emit('reset-game');
    EventBus.emit('mode-changed', 'strategic');
    setMode('strategic');
    setSelected(false);
  };

  return (
    <main className="game-page">
      <div className="game-frame">
        <GameContainer />
        <div className="absolute inset-0 pointer-events-none select-none">
          {/* Mode indicator */}
          <div className="absolute top-4 left-4 px-4 py-2 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10">
            <div className="text-white font-bold text-sm tracking-wider">
              {mode === 'strategic' ? '◉ STRATEGIC VIEW' : '🎮 THIRD-PERSON'}
            </div>
            <div className="text-slate-400 text-xs mt-0.5">
              {mode === 'strategic' ? 'Overview Mode' : 'Possessing Soldier'}
            </div>
          </div>

          {/* Control hints */}
          <div className="absolute bottom-4 left-4 px-4 py-2 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10">
            <div className="text-slate-300 text-xs space-y-0.5">
              {mode === 'strategic' ? (
                <>
                  <div><span className="text-white font-semibold">WASD</span> Pan Camera</div>
                  <div><span className="text-white font-semibold">Wheel</span> Zoom</div>
                  <div><span className="text-white font-semibold">Click</span> Select Soldier</div>
                  {selected && <div className="text-green-400"><span className="font-semibold">E</span> Take Control</div>}
                </>
              ) : (
                <>
                  <div><span className="text-white font-semibold">WASD</span> Move Soldier</div>
                  <div><span className="text-white font-semibold">Space</span> Jump / Double Jump</div>
                  <div><span className="text-white font-semibold">Mouse</span> Look Around</div>
                  <div><span className="text-white font-semibold">Left Click</span> Shoot</div>
                  <div><span className="text-white font-semibold">Tab / Esc</span> Release Control</div>
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {mode === 'strategic' && selected && (
            <button
              className="absolute bottom-4 right-4 px-6 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold pointer-events-auto transition-colors shadow-lg"
              onClick={() => EventBus.emit('possess-soldier')}
            >
              Take Control (E)
            </button>
          )}
          {mode === 'third_person' && (
            <button
              className="absolute bottom-4 right-4 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold pointer-events-auto transition-colors shadow-lg"
              onClick={() => EventBus.emit('release-soldier')}
            >
              Release (Tab)
            </button>
          )}

          {/* Reset test button */}
          <button
            className="absolute top-4 right-4 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium pointer-events-auto transition-colors shadow-lg"
            onClick={handleReset}
          >
            Reset Test
          </button>

          {/* Loading overlay */}
          {!loaded && !error && (
            <div className="absolute inset-0 grid place-items-center bg-black/80 pointer-events-auto">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-slate-600 border-t-green-500 rounded-full animate-spin mx-auto mb-3" />
                <div className="text-white font-medium">Loading Soldier Model…</div>
              </div>
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 grid place-items-center bg-black/80 pointer-events-auto">
              <div className="text-center max-w-md px-6">
                <div className="text-red-400 font-bold text-lg mb-2">Failed to Load Soldier</div>
                <div className="text-slate-400 text-sm mb-4">{error}</div>
                <button
                  className="px-6 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
                  onClick={handleReset}
                >
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}