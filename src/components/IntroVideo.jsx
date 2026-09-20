import { useRef, useEffect, useState, useCallback } from 'react';

export function IntroVideo({ src, onEnd, onSkip }) {
  const videoRef = useRef(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const v = videoRef.current;
    if (v) { v.pause(); v.currentTime = 0; }
    onEnd();
  }, [onEnd]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => finish();
    const handleError = () => {
      setLoadFailed(true);
      // Auto-proceed after a brief pause so the user isn't stuck on a broken video.
      setTimeout(() => finish(), 1500);
    };

    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    video.play()
      .catch(() => { setAutoplayBlocked(true); });

    return () => {
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

  return (
    <div className="absolute inset-0 bg-black z-40 flex items-center justify-center">
      <video
        ref={videoRef}
        src={src}
        className="max-w-full max-h-full"
        style={{ objectFit: 'contain' }}
        playsInline
      />

      {loadFailed && (
        <div className="absolute inset-0 grid place-items-center bg-black">
          <div className="text-center">
            <div className="text-slate-400 text-sm mb-4">Intro video could not be played.</div>
            <button
              onClick={finish}
              className="px-6 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-medium transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {autoplayBlocked && !loadFailed && (
        <div className="absolute inset-0 grid place-items-center bg-black/80">
          <button
            onClick={handlePlay}
            className="px-8 py-4 rounded-full bg-orange-600 hover:bg-orange-500 text-white text-lg font-bold shadow-xl transition-colors"
          >
            ▶ Play Intro
          </button>
        </div>
      )}

      <button
        onClick={onSkip || finish}
        className="absolute top-4 right-4 px-5 py-2 rounded-lg bg-black/60 hover:bg-black/80 text-white text-sm font-medium transition-colors"
      >
        Skip ▶▶
      </button>
    </div>
  );
}