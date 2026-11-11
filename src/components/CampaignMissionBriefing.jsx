import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Shield, Swords, Package } from 'lucide-react';
import { EventBus } from '@/game/EventBus';
import { getLevelConfig } from '@/game/config';
import { missionInfo } from '@/components/shell/missions';
import { useKeyLayer } from '@/components/shell/keyLayers';

const CHAR_MS = 18;

/** Typewriter text written straight to the DOM (no per-character React renders). */
function Typewriter({ text, delay = 0, onDone }) {
  const ref = useRef(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let i = 0;
    let id = 0;
    el.textContent = '';
    const start = setTimeout(() => {
      id = setInterval(() => {
        i += 2;
        el.textContent = text.slice(0, i);
        if (i >= text.length) { clearInterval(id); done.current?.(); }
      }, CHAR_MS * 2);
    }, delay);
    return () => { clearTimeout(start); clearInterval(id); };
  }, [text, delay]);
  return <span ref={ref} />;
}

function TacticalMap({ tint, city }) {
  // Stylised sector map: grid, trench rows, friendly base south, enemy north, radar sweep.
  return (
    <div className="relative aspect-square w-full max-w-[340px] mx-auto hud-panel overflow-hidden hud-grid-bg">
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
        {[30, 45, 60].map(y => (
          <path key={y} d={`M5 ${y} L32 ${y} M38 ${y} L62 ${y} M68 ${y} L95 ${y}`} stroke="rgba(180,150,100,0.55)" strokeWidth="1.2" strokeDasharray={city ? '3 2' : '0'} />
        ))}
        {city && [20, 40, 60, 80].map(x => <rect key={x} x={x - 6} y="8" width="9" height="12" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.4" />)}
        <path d="M50 88 L50 70 M50 70 L35 52 M50 70 L65 52" stroke={tint} strokeWidth="0.8" strokeDasharray="2 1.5" fill="none" opacity="0.8">
          <animate attributeName="stroke-dashoffset" from="7" to="0" dur="1.2s" repeatCount="indefinite" />
        </path>
        <rect x="45" y="84" width="10" height="7" fill="none" stroke="#5eead4" strokeWidth="1" />
        <text x="50" y="97" textAnchor="middle" fontSize="3.6" fill="#5eead4" fontFamily="JetBrains Mono, monospace">BASE1</text>
        <rect x="45" y="6" width="10" height="6" fill="none" stroke="#f87171" strokeWidth="1" />
        {[[22, 22], [70, 18], [48, 25], [82, 30]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.4" fill="#f87171">
            <animate attributeName="opacity" values="1;0.2;1" dur={`${1.2 + i * 0.3}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>
      <div className="absolute left-1/2 top-1/2 w-[140%] aspect-square -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ background: `conic-gradient(from 0deg, transparent 0deg, ${tint}33 40deg, transparent 60deg)`, animation: 'hud-radar-sweep 5s linear infinite' }} />
      <div className="absolute top-2 left-2 hud-label !text-[9px]">Sector map · grid 10</div>
      <div className="absolute bottom-2 right-2 hud-label !text-[9px] text-red-300/80">Hostiles detected</div>
    </div>
  );
}

export function CampaignMissionBriefing({ currentLevel }) {
  const next = missionInfo(currentLevel + 1);
  const prev = getLevelConfig(currentLevel);
  const city = next.id === 5;
  const [typed, setTyped] = useState(false);
  const proceed = () => EventBus.emit(city ? 'proceed-to-city' : 'proceed-to-frost');

  const text = city
    ? `The battle reaches the city. Fight through barricades, wrecked cars and ruined walls beneath a shattered skyline and withstand ${next.maxWaves} enemy waves.`
    : `The campaign moves into winter. Hold the frozen trenches beneath falling snow and withstand ${next.maxWaves} enemy waves.`;

  useKeyLayer((e) => {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); proceed(); }
  });

  const objectives = [
    { icon: Shield, label: `Withstand ${next.maxWaves} enemy waves` },
    { icon: Swords, label: 'Keep base integrity above 90% for three stars' },
    { icon: Package, label: 'Your towers and scrap carry forward' },
  ];

  return (
    <div className="hud-root absolute inset-0 z-40 pointer-events-auto overflow-y-auto hud-scroll bg-[#06080b]/95">
      <div className="fixed inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 70% 30%, ${next.tint}22, transparent 60%)` }} />
      <div className="hud-screen-fx fixed" />
      <div className="relative min-h-full flex items-center justify-center p-4 md:p-10">
        <motion.section className="w-full max-w-5xl grid md:grid-cols-[1fr_1.15fr] gap-8 items-center"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <TacticalMap tint={next.tint} city={city} />
          <div>
            <div className="hud-label text-teal-300/90">{prev.name} secured · Incoming orders</div>
            <div className="hud-label mt-4" style={{ color: next.tint }}>Operation {next.opNumber} · {next.name}</div>
            <motion.h2 className="hud-title text-4xl md:text-5xl text-stone-50 mt-1"
              initial={{ letterSpacing: '0.4em', opacity: 0 }} animate={{ letterSpacing: '0.08em', opacity: 1 }} transition={{ duration: 0.7, delay: 0.15 }}>
              {next.codename}
            </motion.h2>
            <div className="mt-3 h-px w-48" style={{ background: `linear-gradient(90deg, ${next.tint}, transparent)` }} />
            <p className="mt-4 text-stone-200 text-lg leading-relaxed min-h-[5.5rem] font-body">
              <Typewriter text={text} delay={500} onDone={() => setTyped(true)} />
              <span className="hud-blink text-amber-400">▌</span>
            </p>
            <ul className="mt-4 space-y-2">
              {objectives.map((o, i) => (
                <motion.li key={o.label} className="flex items-center gap-3 text-stone-300"
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: typed ? 1 : 0.0, x: typed ? 0 : -8 }} transition={{ delay: typed ? i * 0.12 : 0 }}>
                  <o.icon size={15} style={{ color: next.tint }} /> {o.label}
                </motion.li>
              ))}
            </ul>
            <div className="mt-7 flex items-center gap-4">
              <button type="button" onClick={proceed} className="hud-btn hud-btn-primary flex items-center gap-2 px-7 py-3 text-sm">
                Deploy to {city ? 'City' : 'Frost'} <ChevronRight size={16} />
              </button>
              <span className="hidden sm:flex items-center gap-2 text-xs text-stone-500"><span className="hud-key">ENTER</span> Deploy</span>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
