import { useEffect, useState } from 'react';
export default function AimOverlay() {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const update = () => setLocked(!!document.pointerLockElement);
    update(); document.addEventListener('pointerlockchange', update);
    return () => document.removeEventListener('pointerlockchange', update);
  }, []);
  return <>
    <div aria-label="Aim crosshair" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" style={{filter:'drop-shadow(0 1px 2px #000)'}}>
      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-0.5 bg-white" />
      <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-0.5 bg-white" />
      <span className="absolute top-0 left-1/2 -translate-x-1/2 h-1.5 w-0.5 bg-white" />
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1.5 w-0.5 bg-white" />
    </div>
    {!locked && <div className="absolute top-20 left-1/2 -translate-x-1/2 rounded bg-black/80 px-4 py-2 text-sm text-white">Click battlefield to capture mouse · Left click to fire · Right click to aim</div>}
  </>;
}