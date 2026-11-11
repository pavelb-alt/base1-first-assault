// BASE1 audio system entry point. Importing this module (once, from main.jsx)
// installs the unlock/visibility listeners, the delegated UI-sound listener and
// the gameplay-event director. The AudioContext itself is created on the first
// user gesture, so nothing here touches Web Audio before it is allowed to.
//
// Public API:
//   playUi(name)        'click'|'hover'|'confirm'|'back'|'error'|'purchase'|'open'|'close'
//   duckMusic(depth, attack, hold, release)
//   audioStats()        debug snapshot (also window.__audio.stats())
// Mount <AudioListenerBridge /> inside the R3F canvas for positional audio.
import { initEngine, onReady, engine, audioStats, duckMusic } from '@/game/audio/engine';
import { prewarm } from '@/game/audio/sounds';
import { initMusic, musicState } from '@/game/audio/music';
import { initAmbience, ambienceState } from '@/game/audio/ambience';
import { installUiListeners, playUi } from '@/game/audio/ui';
import { initDirector, directorState } from '@/game/audio/director';

let initialised = false;

export function initAudio() {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;
  try {
    initEngine();
    installUiListeners();
    initDirector();
    onReady(() => {
      prewarm();
      initMusic();
      // loop beds render a few seconds of noise — keep that off the gesture frame
      setTimeout(() => { try { initAmbience(); } catch (err) { console.error('[audio] ambience', err); } }, 300);
    });
    window.__audio = { stats: audioStats, playUi, duckMusic, engine, music: musicState, ambience: ambienceState, director: directorState };
  } catch (err) {
    console.warn('[audio] init failed — continuing without sound', err);
  }
}

export { playUi, duckMusic, audioStats };

initAudio();
