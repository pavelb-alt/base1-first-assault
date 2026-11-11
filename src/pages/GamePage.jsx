import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { GameContainer } from '@/components/game/GameContainer';
import { EventBus } from '@/game/EventBus';
import { gameEvents } from '@/game/gameEvents';
import { gameState } from '@/game/3d/world';
import { cargoShipState } from '@/game/3d/objects/cargoShipState';
import { OPENING, LEVELS, getLevelConfig, getMaxWaves } from '@/game/config';
import { resetMissionStats, missionStats, missionElapsedSeconds, missionAccuracy, progression } from '@/game/progression';
import { MainMenu } from '@/components/MainMenu';
import { CampaignMissionBriefing } from '@/components/CampaignMissionBriefing';
import { IntroVideo } from '@/components/IntroVideo';
import AimOverlay from '@/components/AimOverlay';
import { CombatFeedbackLayer } from '@/components/combat/CombatFeedbackLayer';
import { HealthBar } from '@/components/HealthBar';
import { Minimap } from '@/components/Minimap';
import { TowerDefenseHUD } from '@/components/TowerDefenseHUD';
import { InControlTowerMenu } from '@/components/InControlTowerMenu';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { UnitCommandPanel } from '@/components/UnitCommandPanel';
import { StationControlHUD } from '@/components/StationControlHUD';
import { PauseMenu } from '@/components/shell/PauseMenu';
import { MissionDebrief } from '@/components/shell/MissionDebrief';
import { LoadingOverlay } from '@/components/shell/LoadingOverlay';
import { isEditableTarget } from '@/components/shell/keyLayers';
import { uiPrefs } from '@/components/shell/uiPrefs';
import {
  ObjectiveTracker, WaveBanner, ModeIndicator, ControlsHint, PauseButton, ActionButton, ReinforcementToast, ErrorPanel,
} from '@/components/shell/HudChrome';

// Dev-only hooks for playtesting the shell (e.g. __debugEmit('game-over', 'defeat')).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__debugEmit = (event, ...args) => EventBus.emit(event, ...args);
  window.__debugGameEvent = (event, payload) => gameEvents.emit(event, payload);
}

export default function GamePage() {
  // Opening flow: 'opening' → 'menu' → 'intro' → 'handoff' → 'playing'
  const [phase, setPhase] = useState('opening');
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
  const [currentLevel, setCurrentLevel] = useState(1);
  const [levelTransition, setLevelTransition] = useState(false);
  const [tankCount, setTankCount] = useState(0);
  const [artilleryCount, setArtilleryCount] = useState(0);
  const [resultVideoDone, setResultVideoDone] = useState(false);

  // Shell state
  const [pauseOpen, setPauseOpen] = useState(false);
  const [debrief, setDebrief] = useState(null);                       // outcome snapshot for MissionDebrief
  const [transitionRevealed, setTransitionRevealed] = useState(false); // cleared level: debrief dismissed → show transition
  const [pendingStart, setPendingStart] = useState(null);             // level to launch after a full game unmount
  const recordedRef = useRef(false);

  // Mission stats lifecycle: reset when a mission/level starts, record exactly once per outcome.
  const beginMissionStats = useCallback((level) => {
    resetMissionStats(level);
    recordedRef.current = false;
  }, []);

  const recordOutcome = useCallback((kind, result) => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    const level = gameState.currentLevel;
    const maxWaves = getMaxWaves(level);
    // Base health persists across level transitions; sync the real value before stars are scored.
    const battle = window.game?.getBattle?.();
    if (battle?.baseHealth) missionStats.baseHealth = Math.max(0, battle.baseHealth.friendly);
    const { stars, newRecord } = progression.recordMissionResult(level, result);
    const clearedAllWaves = kind === 'cleared' || (result === 'victory' && towerDefenseState.wave >= maxWaves);
    if (document.pointerLockElement) document.exitPointerLock?.();
    setDebrief({
      kind, outcome: result, level, stars, newRecord,
      stats: {
        time: missionElapsedSeconds(),
        wavesSurvived: clearedAllWaves ? maxWaves : missionStats.wavesSurvived,
        maxWaves,
        enemiesKilled: missionStats.enemiesKilled,
        playerKills: missionStats.playerKills,
        accuracy: missionAccuracy(),
        bestStreak: missionStats.bestStreak,
        towersBuilt: missionStats.towersBuilt,
        scrapEarned: missionStats.scrapEarned,
        baseHealth: missionStats.baseHealth,
      },
    });
  }, []);

  // EventBus subscriptions for gameplay events
  useEffect(() => {
    const onMode = (m) => { setMode(m); setWaitingForReinforcements(false); };
    const onLoaded = () => { setLoaded(true); setError(null); };
    const onError = (e) => setError(e);
    const onNoEligible = () => {
      setWaitingForReinforcements(true);
      setTimeout(() => setWaitingForReinforcements(false), 3000);
    };
    const onGameOver = (result) => {
      setGameOver(result);
      setPauseOpen(false);
      recordOutcome('gameover', result);
      // First mission outcomes play their cinematics before the result panel.
      if (gameState.currentLevel === 1 && (result === 'defeat' || result === 'victory')) {
        setResultVideoDone(false);
        EventBus.emit('pause-game');
      } else setResultVideoDone(true);
    };
    const onCurrency = (amt) => setScrapAmount(amt);
    const onWave = (w) => setWaveNumber(w);
    const onLevelTransition = () => {
      setLevelTransition(true);
      setTransitionRevealed(false);
      setPauseOpen(false);
      recordOutcome('cleared', 'victory');
    };
    const onLevelChanged = (level) => {
      setCurrentLevel(level);
      setLevelTransition(false);
      setWaveNumber(0);
      setGameOver(null);
      setResultVideoDone(false);
      setDebrief(null);
      setTransitionRevealed(false);
      beginMissionStats(level);
    };
    const onTankCount = (count) => setTankCount(count);
    const onArtilleryCount = (count) => setArtilleryCount(count);
    EventBus.on('artillery-count-changed', onArtilleryCount);

    EventBus.on('mode-changed', onMode);
    EventBus.on('soldier-loaded', onLoaded);
    EventBus.on('soldier-error', onError);
    EventBus.on('no-eligible-soldier', onNoEligible);
    EventBus.on('game-over', onGameOver);
    EventBus.on('currency-changed', onCurrency);
    EventBus.on('wave-changed', onWave);
    EventBus.on('level-transition', onLevelTransition);
    EventBus.on('level-changed', onLevelChanged);
    EventBus.on('tank-count-changed', onTankCount);

    return () => {
      EventBus.off('mode-changed', onMode);
      EventBus.off('soldier-loaded', onLoaded);
      EventBus.off('soldier-error', onError);
      EventBus.off('no-eligible-soldier', onNoEligible);
      EventBus.off('game-over', onGameOver);
      EventBus.off('currency-changed', onCurrency);
      EventBus.off('wave-changed', onWave);
      EventBus.off('level-transition', onLevelTransition);
      EventBus.off('level-changed', onLevelChanged);
      EventBus.off('tank-count-changed', onTankCount);
      EventBus.off('artillery-count-changed', onArtilleryCount);
    };
  }, [recordOutcome, beginMissionStats]);

  // Phase: menu → intro (mount game running so cargo ships land during the video)
  const startMission = useCallback((level = 1) => {
    if (initStarted.current) return;
    initStarted.current = true;
    gameState.paused = false;
    gameState.preparing = true; // block player input during video
    setCurrentLevel(level);
    beginMissionStats(level);
    if (level > 1) {
      gameState.currentLevel = level;
      towerDefenseState.reset();
      EventBus.emit('level-changed', level);
    }
    setPhase('intro');
  }, [beginMissionStats]);

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
      // The mission clock starts when the player gets control, not during the intro video.
      missionStats.startedAt = performance.now();
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
    gameState.currentLevel = 1;
    setMissionReady(false);
    setLoadError(null);
    setMode('strategic');
    setWaitingForReinforcements(false);
    setGameOver(null);
    setResultVideoDone(false);
    setScrapAmount(towerDefenseState.scrap);
    setWaveNumber(0);
    setCurrentLevel(1);
    setLevelTransition(false);
    setTankCount(0);
    setArtilleryCount(0);
    setPauseOpen(false);
    setDebrief(null);
    setTransitionRevealed(false);
    setPhase('menu');
  }, []);

  // Restart / next mission: full reset (unmounts the game), then launch `level` fresh.
  const launchFresh = useCallback((level) => {
    handleReset();
    setPendingStart(level);
  }, [handleReset]);

  useEffect(() => {
    if (phase !== 'menu' || pendingStart == null) return;
    const level = pendingStart;
    setPendingStart(null);
    startMission(level);
  }, [phase, pendingStart, startMission]);

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

  // --- Pause -----------------------------------------------------------------
  const canPause = phase === 'playing' && !gameOver && !levelTransition && !debrief && loaded && !error;
  const openPause = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock?.();
    EventBus.emit('pause-game');
    setPauseOpen(true);
  }, []);
  const resumeGame = useCallback(() => {
    setPauseOpen(false);
    EventBus.emit('resume-game');
  }, []);

  // Page-level hotkeys. Registered once at mount, so this bubble listener runs BEFORE
  // the game's own window listeners (which mount later) and can inspect the selection
  // before SelectionSystem clears it on Esc. Open menus swallow keys via key layers.
  const hotkeys = useRef({});
  hotkeys.current = { canPause, pauseOpen, phase, openPause };
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || isEditableTarget(e)) return;
      const s = hotkeys.current;
      if (s.phase !== 'playing') return;
      if (e.code === 'Slash') { uiPrefs.set({ hintsCollapsed: !uiPrefs.get().hintsCollapsed }); return; }
      if (!s.canPause || s.pauseOpen) return;
      if (e.code === 'KeyP') { e.preventDefault(); s.openPause(); return; }
      // Esc: third-person keeps its release behaviour; strategic pauses unless it is deselecting.
      if (e.code === 'Escape' && gameState.mode === 'strategic') {
        const sel = window.game?.getSelection?.();
        if (!sel || !sel.count) s.openPause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const gameMounted = phase !== 'opening' && phase !== 'menu';
  const showDebrief = phase === 'playing' && debrief &&
    (debrief.kind === 'cleared' ? levelTransition && !transitionRevealed : gameOver && resultVideoDone);
  const showTransition = levelTransition && (transitionRevealed || !debrief);

  return (
    <main className="game-page bg-black">
      <div className="game-frame">
        {gameMounted && <GameContainer />}

        {/* Opening cinematic shown before the main menu */}
        {phase === 'opening' && (
          <IntroVideo
            src={OPENING.preMenuVideoUrl}
            onEnd={() => setPhase('menu')}
            onSkip={() => setPhase('menu')}
          />
        )}

        {/* Main Menu (held back while a restart is relaunching the mission) */}
        {phase === 'menu' && pendingStart == null && <MainMenu onStart={startMission} />}
        {phase === 'menu' && pendingStart != null && <div className="absolute inset-0 bg-black z-50" />}

        {/* Intro Video */}
        {phase === 'intro' && (
          <IntroVideo
            src={getLevelConfig(currentLevel).introVideoUrl ?? OPENING.introVideoUrl}
            onEnd={onVideoComplete}
            onSkip={onVideoComplete}
          />
        )}

        {/* Handoff overlay */}
        {phase === 'handoff' && !loadError && (
          <LoadingOverlay level={currentLevel} ready={missionReady} subtitle="Awaiting first reinforcement delivery" />
        )}
        {phase === 'handoff' && loadError && (
          <ErrorPanel title="Mission Loading Failed" message={loadError}
            actions={[{ label: 'Back to Menu', run: backToMenu }, { label: 'Retry', run: retryHandoff, primary: true }]} />
        )}

        {/* Gameplay HUD (only during active play) */}
        {phase === 'playing' && (
          <div className="hud-root absolute inset-0 pointer-events-none select-none">
            {mode === 'third_person' && <AimOverlay />}
            <HealthBar />
            <Minimap />
            <TowerDefenseHUD visible={mode === 'strategic'} />
            <InControlTowerMenu visible={mode === 'third_person'} />
            <StationControlHUD visible={mode === 'third_person'} />
            <UnitCommandPanel visible={mode === 'strategic'} />

            <CombatFeedbackLayer mode={mode} />

            <ModeIndicator mode={mode} level={currentLevel} />
            <ObjectiveTracker level={currentLevel} wave={waveNumber} mode={mode} tankCount={tankCount} artilleryCount={artilleryCount} />
            <WaveBanner />
            <ControlsHint mode={mode} />
            <ActionButton mode={mode} waiting={waitingForReinforcements}
              onJoin={() => EventBus.emit('possess-soldier')} onRelease={() => EventBus.emit('release-soldier')} />
            <ReinforcementToast show={waitingForReinforcements && mode === 'strategic'} />
            {canPause && <PauseButton onClick={openPause} />}

            {/* Loading overlay (during gameplay if model loads late) */}
            {!loaded && !error && (
              <LoadingOverlay level={currentLevel} title="Loading soldier model" showChecklist={false} expectedMs={6000} />
            )}

            {/* Error overlay */}
            {error && (
              <ErrorPanel title="Failed to Load Soldier" message={String(error)}
                actions={[{ label: 'Main Menu', run: handleReset }, { label: 'Retry Mission', run: () => launchFresh(currentLevel), primary: true }]} />
            )}
          </div>
        )}

        {/* Pause menu */}
        <AnimatePresence>
          {phase === 'playing' && pauseOpen && (
            <PauseMenu key="pause" level={currentLevel} wave={waveNumber}
              onResume={resumeGame} onRestart={() => launchFresh(currentLevel)} onQuit={handleReset} />
          )}
        </AnimatePresence>

        {/* First mission result cinematic — plays before the debrief */}
        {phase === 'playing' && gameOver && currentLevel === 1 && !resultVideoDone && (
          <IntroVideo
            src={gameOver === 'victory' ? LEVELS.day.victoryVideoUrl : LEVELS.day.defeatVideoUrl}
            onEnd={() => setResultVideoDone(true)}
            onSkip={() => setResultVideoDone(true)}
          />
        )}

        {/* Mission debrief: game over (after any result video) or a cleared level (before its transition) */}
        {showDebrief && (
          <MissionDebrief
            key={`${debrief.kind}-${debrief.level}`}
            result={debrief}
            onContinue={() => setTransitionRevealed(true)}
            onRetry={() => launchFresh(debrief.level)}
            onNext={() => launchFresh(Math.min(5, debrief.level + 1))}
            onMenu={handleReset}
          />
        )}

        {/* Level transition: cinematic for day→night or night→forest, briefing for later levels */}
        {showTransition && currentLevel >= 3 && <CampaignMissionBriefing currentLevel={currentLevel} />}
        {showTransition && currentLevel < 3 && (
          <IntroVideo
            src={currentLevel === 1 ? LEVELS.night.introVideoUrl : LEVELS.forest.introVideoUrl}
            onEnd={() => EventBus.emit(currentLevel === 1 ? 'proceed-to-night' : 'proceed-to-forest')}
            onSkip={() => EventBus.emit(currentLevel === 1 ? 'proceed-to-night' : 'proceed-to-forest')}
          />
        )}

        {/* Fade through black (handoff → gameplay transition) */}
        {fading && <div className="absolute inset-0 bg-black z-50" />}
      </div>
    </main>
  );
}
