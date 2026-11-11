import { useRef, useEffect, useState, useCallback } from 'react';
import { Play, FastForward } from 'lucide-react';
import { settings } from '@/game/settings';
import { useKeyLayer } from '@/components/shell/keyLayers';

const HOLD_MS = 900;     // hold Space this long to skip
const FADE_MS = 380;     // fade-to-black before handing control back
const RING = 2 * Math.PI * 15;

/**
 * Cinematic video player: letterbox, fade in/out, hold-Space (or click) to skip.
 * Swallows keyboard input while mounted so game hotkeys don't fire under a cutscene.
 */
export function IntroVideo({ src, onEnd, onSkip }) {
  const videoRef = useRef(null);
  const ringRef = useRef(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [shown, setShown] = useState(false);     // fade-in done
  const [closing, setClosing] = useState(false); // fading out
  const [holding, setHolding] = useState(false);
  const finishedRef = useRef(false);
  const hold = useRef({ raf: 0, start: 0 });
  const exitTimer = useRef(0);
  useEffect(() => () => clearTimeout(exitTimer.current), []);

  const exit = useCallback((cb) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setClosing(true);
    exitTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v) { v.pause(); v.currentTime = 0; }
      cb?.();
    }, FADE_MS);
  }, []);
  const finish = useCallback(() => exit(onEnd), [exit, onEnd]);
  const skip = useCallback(() => exit(onSkip || onEnd), [exit, onSkip, onEnd]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const s = settings.get();
    video.volume = Math.max(0, Math.min(1, s.masterVolume * Math.max(s.musicVolume, s.sfxVolume)));

    const handleEnded = () => finish();
    let errorTimer;
    const handleError = () => {
      setLoadFailed(true);
      // Auto-proceed after a brief pause so the user isn't stuck on a broken video.
      errorTimer = setTimeout(() => finish(), 1500);
    };

    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    video.play()
      .catch(() => { setAutoplayBlocked(true); });

    return () => {
      clearTimeout(errorTimer);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      video.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const handlePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setAutoplayBlocked(false);
    video.play()
      .then(() => setAutoplayBlocked(false))
      .catch(() => finish());
  }, [finish]);

  const stopHold = useCallback(() => {
    cancelAnimationFrame(hold.current.raf);
    hold.current.start = 0;
    setHolding(false);
    if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING);
  }, []);

  const startHold = useCallback(() => {
    if (hold.current.start || finishedRef.current) return;
    hold.current.start = performance.now();
    setHolding(true);
    const tick = (now) => {
      const t = Math.min(1, (now - hold.current.start) / HOLD_MS);
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING * (1 - t));
      if (t >= 1) { stopHold(); skip(); return; }
      hold.current.raf = requestAnimationFrame(tick);
    };
    hold.current.raf = requestAnimationFrame(tick);
  }, [skip, stopHold]);

  useEffect(() => {
    const up = (e) => { if (e.code === 'Space') stopHold(); };
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', stopHold);
    return () => { window.removeEventListener('keyup', up, true); window.removeEventListener('blur', stopHold); stopHold(); };
  }, [stopHold]);

  useKeyLayer((e) => {
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) startHold(); }
    else if (e.code === 'Enter' && (autoplayBlocked || loadFailed)) { e.preventDefault(); if (loadFailed) finish(); else handlePlay(); }
  });

  return (
    <div className="hud-root absolute inset-0 bg-black z-40 flex items-center justify-center overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full"
        style={{ objectFit: 'contain' }}
        playsInline
      />

      {/* Letterbox bars */}
      <div className="absolute inset-x-0 top-0 bg-black transition-[height] duration-700 ease-out pointer-events-none"
        style={{ height: shown ? '7vh' : '0' }} />
      <div className="absolute inset-x-0 bottom-0 bg-black transition-[height] duration-700 ease-out pointer-events-none"
        style={{ height: shown ? '7vh' : '0' }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.45) 100%)' }} />

      {loadFailed && (
        <div className="absolute inset-0 grid place-items-center bg-black">
          <div className="text-center">
            <div className="hud-label mb-4">Cinematic unavailable</div>
            <button type="button" onClick={finish} className="hud-btn hud-btn-primary px-6 py-2.5 text-xs">Continue</button>
          </div>
        </div>
      )}

      {autoplayBlocked && !loadFailed && (
        <div className="absolute inset-0 grid place-items-center bg-black/80">
          <button type="button" onClick={handlePlay}
            className="hud-btn hud-btn-primary flex items-center gap-3 px-8 py-4 text-base shadow-xl">
            <Play size={18} fill="currentColor" /> Play Cinematic
          </button>
        </div>
      )}

      {/* Skip control: hold Space, or click */}
      <button
        type="button"
        onClick={skip}
        className={`absolute right-5 md:right-8 bottom-[calc(7vh+12px)] flex items-center gap-3 pl-2 pr-4 py-2 rounded-sm transition-opacity duration-300 hover:bg-white/10 ${holding ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
        aria-label="Skip cinematic"
      >
        <svg width="38" height="38" viewBox="0 0 38 38" className="-rotate-90">
          <circle cx="19" cy="19" r="15" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.18)" strokeWidth="2.5" />
          <circle ref={ringRef} cx="19" cy="19" r="15" fill="none" stroke="#f59e0b" strokeWidth="2.5"
            strokeDasharray={RING} strokeDashoffset={RING} strokeLinecap="round" />
        </svg>
        <FastForward size={14} className="absolute left-[21px] text-stone-100" fill="currentColor" />
        <span className="text-left leading-tight">
          <span className="block font-display text-[11px] font-bold tracking-[0.22em] uppercase text-stone-100">
            Hold <span className="hud-key !h-5 !text-[10px] mx-0.5">SPACE</span> to skip
          </span>
          <span className="block hud-label !text-[9px] mt-0.5">or click</span>
        </span>
      </button>

      {/* Fade in / out */}
      <div className="absolute inset-0 bg-black pointer-events-none transition-opacity ease-in-out"
        style={{ opacity: closing || !shown ? 1 : 0, transitionDuration: `${closing ? FADE_MS : 700}ms` }} />
    </div>
  );
}
