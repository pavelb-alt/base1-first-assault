import { useState, useEffect, useRef, useCallback } from 'react';
import { GameContainer } from '@/components/game/GameContainer';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { cargoShipState } from '@/game/3d/objects/cargoShipState';
import { OPENING } from '@/game/config';
import { MainMenu } from '@/components/MainMenu';
import { IntroVideo } from '@/components/IntroVideo';
import AimOverlay from '@/components/AimOverlay';
import { HealthBar } from '@/components/HealthBar';
import { Minimap } from '@/components/Minimap';
import { TowerDefenseHUD } from '@/components/TowerDefenseHUD';
import { towerDefenseState } from '@/game/3d/towerDefenseState';

export default function GamePage() {
  // Opening flow: 'menu' → 'intro' → 'handoff' → 'playing'
  const [phase, setPhase] = useState('menu');
  const [fading, setFading] = useState(false);
  const [missionReady, setMissionReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const initStarted = useRef(false);

  // Gameplay state (existing)
  const [mode, setMode] = useState('strategic');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [waitingForReinforcements, setWaitingForReinforcements] = useState(false);
  const [gameOver, setGameOver] = useState(null);
  const [scrapAmount, setScrapAmount] = useState(towerDefenseState.scrap);
  const [waveNumber, setWaveNumber] = useState(0);

  // EventBus subscriptions for gameplay events
  useEffect(() => {
    const onMode = (m) => { setMode(m); setWaitingForReinforcements(false); };
    const onLoaded = () => { setLoaded(true); setError(null); };
    const onError = (e) => setError(e);
    const onNoEligible = () => {
      setWaitingForReinforcements(true);
      setTimeout(() => setWaitingForReinforcements(false), 3000);
    };
    const onGameOver = (result) => setGameOver(result);

    const onCurrency = (amt) => setScrapAmount(amt);
    const onWave = (w) => setWaveNumber(w);

    EventBus.on('mode-changed', onMode);
    EventBus.on('soldier-loaded', onLoaded);
    EventBus.on('soldier-error', onError);
    EventBus.on('no-eligible-soldier', onNoEligible);
    EventBus.on('game-over', onGameOver);
    EventBus.on('currency-changed', onCurrency);
    EventBus.on('wave-changed', onWave);

    return () => {
      EventBus.off('mode-changed', onMode);
      EventBus.off('soldier-loaded', onLoaded);
      EventBus.off('soldier-error', onError);
      EventBus.off('no-eligible-soldier', onNoEligible);
      EventBus.off('game-over', onGameOver);
      EventBus.off('currency-changed', onCurrency);
      EventBus.off('wave-changed', onWave);
    };
  }, []);

  // Phase: menu → intro (mount game running so cargo ships land during the video)
  const startMission = useCallback(() => {
    if (initStarted.current) return;
    initStarted.current = true;
    gameState.paused = false;
    gameState.preparing = true; // block player input during video
    setPhase('intro');
  }, []);

  // Phase: intro → handoff (game already running; just frame the landing area)
  const onVideoComplete = useCallback(() => {
    setPhase('handoff');
    EventBus.emit('frame-landing-area');
  }, []);

  // Handoff: poll for mission readiness (first cargo ship landed + squad deployed)
  useEffect(() => {
    if (phase !== 'handoff') return;
    setMissionReady(false);
    setLoadError(null);

    const check = setInterval(() => {
      if (window.game?.ready && cargoShipState.firstSquadDeployed) {
        setMissionReady(true);
        clearInterval(check);
      }
    }, 200);

    const timeout = setTimeout(() => {
      if (!cargoShipState.firstSquadDeployed) {
        setLoadError('Mission initialization timed out. The first reinforcement delivery did not complete.');
        clearInterval(check);
      }
    }, OPENING.handoffTimeout);

    return () => { clearInterval(check); clearTimeout(timeout); };
  }, [phase]);

  // Handoff → playing: fade through black into the prepared scene
  useEffect(() => {
    if (!missionReady) return;
    setFading(true);
    const t = setTimeout(() => {
      setPhase('playing');
      setFading(false);
      gameState.preparing = false;
    }, OPENING.fadeDuration);
    return () => clearTimeout(t);
  }, [missionReady]);

  // Reset everything and return to menu
  const handleReset = useCallback(() => {
    EventBus.emit('reset-game');
    EventBus.emit('mode-changed', 'strategic');
    initStarted.current = false;
    cargoShipState.firstLanded = false;
    cargoShipState.firstSquadDeployed = false;
    towerDefenseState.reset();
    gameState.preparing = false;
    gameState.paused = false;
    setMissionReady(false);
    setLoadError(null);
    setMode('strategic');
    setWaitingForReinforcements(false);
    setGameOver(null);
    setScrapAmount(towerDefenseState.scrap);
    setWaveNumber(0);
    setPhase('menu');
  }, []);

  // Retry from handoff failure
  const retryHandoff = useCallback(() => {
    EventBus.emit('reset-game');
    initStarted.current = false;
    cargoShipState.firstLanded = false;
    cargoShipState.firstSquadDeployed = false;
    gameState.preparing = false;
    setMissionReady(false);
    setLoadError(null);
    gameState.paused = true;
    setPhase('intro');
  }, []);

  // Back to menu from handoff failure
  const backToMenu = useCallback(() => {
    EventBus.emit('reset-game');
    initStarted.current = false;
    cargoShipState.firstLanded = false;
    cargoShipState.firstSquadDeployed = false;
    gameState.preparing = false;
    gameState.paused = false;
    setMissionReady(false);
    setLoadError(null);
    setPhase('menu');
  }, []);

  const gameMounted = phase !== 'menu';

  return (
    <main className="game-page">
      <div className="game-frame">
        {gameMounted && <GameContainer />}

        {/* Main Menu */}
        {phase === 'menu' && <MainMenu onStart={startMission} />}

        {/* Intro Video */}
        {phase === 'intro' && (
          <IntroVideo
            src={OPENING.introVideoUrl}
            onEnd={onVideoComplete}
            onSkip={onVideoComplete}
          />
        )}

        {/* Handoff overlay */}
        {phase === 'handoff' && (
          <div className="absolute inset-0 grid place-items-center bg-black/85 pointer-events-auto z-30">
            {!missionReady && !loadError && (
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-slate-600 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
                <div className="text-white font-medium">Preparing mission…</div>
                <div className="text-slate-400 text-xs mt-1">Awaiting first reinforcement delivery</div>
              </div>
            )}
            {loadError && (
              <div className="text-center max-w-md px-6">
                <div className="text-red-400 font-bold text-lg mb-2">Mission Loading Failed</div>
                <div className="text-slate-400 text-sm mb-6">{loadError}</div>
                <button
                  onClick={retryHandoff}
                  className="px-6 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-medium transition-colors mr-3"
                >
                  Retry
                </button>
                <button
                  onClick={backToMenu}
                  className="px-6 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
                >
                  Back to Menu
                </button>
              </div>
            )}
          </div>
        )}

        {/* Gameplay HUD (only during active play) */}
        {phase === 'playing' && (
          <div className="absolute inset-0 pointer-events-none select-none">
            {mode === 'third_person' && <AimOverlay />}
            <HealthBar />
            <Minimap />
            <TowerDefenseHUD visible={mode === 'strategic'} />

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
                    <div><span className="text-white font-semibold">Right Click</span> Place Tower</div>
                    <div><span className="text-white font-semibold">Tab</span> Join the Fight</div>
                  </>
                ) : (
                  <>
                    <div><span className="text-white font-semibold">WASD</span> Move Soldier</div>
                    <div><span className="text-white font-semibold">Space</span> Jump / Double Jump</div>
                    <div><span className="text-white font-semibold">Mouse</span> Look Around</div>
                    <div><span className="text-white font-semibold">Left Click</span> Shoot</div>
                    <div><span className="text-white font-semibold">Right Click</span> Aim Down Sights</div>
                    <div><span className="text-white font-semibold">Tab / Esc</span> Release Control</div>
                  </>
                )}
              </div>
            </div>

            {/* Action buttons */}
            {mode === 'strategic' && (
              <button
                className="absolute bottom-4 right-4 px-6 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold pointer-events-auto transition-colors shadow-lg"
                onClick={() => EventBus.emit('possess-soldier')}
              >
                {waitingForReinforcements ? 'Waiting for reinforcements' : 'Join the Fight'}
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

            {/* Reset button */}
            <button
              className="absolute top-4 right-4 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium pointer-events-auto transition-colors shadow-lg"
              onClick={handleReset}
            >
              Reset Test
            </button>

            {/* Victory / Defeat overlay */}
            {gameOver && (
              <div className="absolute inset-0 grid place-items-center bg-black/80 pointer-events-auto">
                <div className="text-center max-w-md px-6">
                  <div className={`text-5xl font-extrabold mb-2 ${gameOver === 'victory' ? 'text-green-400' : 'text-red-400'}`}>
                    {gameOver === 'victory' ? '★ VICTORY ★' : '✖ DEFEAT ✖'}
                  </div>
                  <div className="text-slate-300 text-sm mb-6">
                    {gameOver === 'victory'
                      ? 'Friendly forces destroyed the enemy base. The battlefield is yours.'
                      : 'Enemy forces breached your base. The front has collapsed.'}
                  </div>
                  <button
                    className="px-8 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold text-lg transition-colors shadow-lg"
                    onClick={handleReset}
                  >
                    Restart Match
                  </button>
                </div>
              </div>
            )}

            {/* Loading overlay (during gameplay if model loads late) */}
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
        )}

        {/* Fade through black (handoff → gameplay transition) */}
        {fading && <div className="absolute inset-0 bg-black z-50" />}
      </div>
    </main>
  );
}