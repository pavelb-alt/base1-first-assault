import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { cargoShipState } from '@/game/3d/objects/cargoShipState';
import { missionInfo, TACTICAL_TIPS } from './missions';

/**
 * Mission handoff / loading overlay: operation header, live readiness checklist,
 * animated progress and rotating tactical tips. Progress is written to the DOM via
 * a ref (no per-frame React state); the checklist polls at 5 Hz.
 */
export function LoadingOverlay({ level, ready = false, title = 'Preparing mission', subtitle, expectedMs = 14000, showChecklist = true }) {
  const info = missionInfo(level);
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TACTICAL_TIPS.length));
  const [steps, setSteps] = useState({ uplink: false, landed: false, deployed: false });
  const barRef = useRef(null);
  const pctRef = useRef(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    const id = setInterval(() => setTip(t => (t + 1) % TACTICAL_TIPS.length), 4500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!showChecklist) return undefined;
    const poll = () => {
      const next = { uplink: !!window.game, landed: cargoShipState.firstLanded, deployed: cargoShipState.firstSquadDeployed };
      setSteps(s => (s.uplink === next.uplink && s.landed === next.landed && s.deployed === next.deployed ? s : next));
    };
    poll();
    const id = setInterval(poll, 200);
    return () => clearInterval(id);
  }, [showChecklist]);

  // Asymptotic progress toward 95% until ready, then snap to 100%.
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    let shown = 0;
    const tick = (now) => {
      const target = readyRef.current ? 100 : 95 * (1 - Math.exp(-(now - start) / expectedMs * 2.2));
      shown += (target - shown) * 0.08;
      if (barRef.current) barRef.current.style.width = `${shown}%`;
      if (pctRef.current) pctRef.current.textContent = `${Math.floor(shown)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [expectedMs]);

  const checklist = [
    { id: 'uplink', label: 'Tactical uplink established', done: steps.uplink },
    { id: 'landed', label: 'First cargo drop on the ground', done: steps.landed },
    { id: 'deployed', label: 'Squad deployed to the line', done: steps.deployed },
  ];

  return (
    <div className="hud-root absolute inset-0 z-30 pointer-events-auto overflow-hidden bg-black/85">
      <div className="absolute inset-0 hud-grid-bg opacity-60" />
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 40%, ${info.tint}22, transparent 60%)` }} />
      <div className="hud-screen-fx" />
      <div className="relative h-full flex flex-col justify-end p-6 md:p-12">
        <div className="max-w-2xl">
          <div className="hud-label" style={{ color: info.tint }}>Operation {info.opNumber} · {info.name}</div>
          <h1 className="hud-title text-4xl md:text-5xl text-stone-50 mt-1">{info.codename}</h1>
          <div className="mt-2 flex items-center gap-2 text-stone-300 font-display tracking-[0.18em] uppercase text-sm">
            <span className="inline-block w-2 h-2 bg-amber-400 hud-blink" /> {title}
            {subtitle && <span className="text-stone-500 normal-case tracking-normal font-body">· {subtitle}</span>}
          </div>

          {showChecklist && (
            <ul className="mt-5 space-y-1.5">
              {checklist.map(c => (
                <li key={c.id} className={`flex items-center gap-2.5 text-[15px] ${c.done ? 'text-stone-200' : 'text-stone-500'}`}>
                  <span className={`grid place-items-center w-4 h-4 border ${c.done ? 'border-teal-300 bg-teal-300/15' : 'border-stone-600'}`}>
                    {c.done && <Check size={11} className="text-teal-300" />}
                  </span>
                  {c.label}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-center gap-3">
            <div className="hud-meter flex-1 h-2">
              <span ref={barRef} style={{ width: '0%', background: 'linear-gradient(90deg,#d97706,#fbbf24)', transition: 'none' }} />
            </div>
            <span ref={pctRef} className="hud-value text-sm w-12 text-right">0%</span>
          </div>

          <div className="mt-6 hud-panel hud-panel-accent px-4 py-3 min-h-[68px]">
            <div className="hud-label text-amber-400/80">Field Tip</div>
            <AnimatePresence mode="wait">
              <motion.p key={tip} className="text-stone-200 text-[15px] leading-snug mt-0.5"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                {TACTICAL_TIPS[tip]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
