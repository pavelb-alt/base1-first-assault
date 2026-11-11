import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Star, Trophy, ChevronRight, RefreshCw, Home } from 'lucide-react';
import { useProgression, TOTAL_LEVELS } from '@/game/progression';
import { useKeyLayer } from './keyLayers';
import { missionInfo, formatTime, MISSION_IDS } from './missions';

/** Animated number: writes to the DOM directly (no React state per frame). */
export function CountUp({ value, format = v => Math.round(v).toLocaleString(), delay = 0, duration = 900 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let raf = 0;
    let start = 0;
    el.textContent = format(0);
    const tick = (now) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => { raf = requestAnimationFrame(tick); }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
    // format is a stable-per-row inline fn; re-running on identity change is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay, duration]);
  return <span ref={ref}>{format(value)}</span>;
}

export function StarRow({ stars, size = 44, delay = 0.35, animate = true }) {
  return (
    <div className="flex items-end justify-center gap-3" aria-label={`${stars} of 3 stars`}>
      {[0, 1, 2].map(i => {
        const earned = i < stars;
        const s = i === 1 ? size * 1.25 : size;
        return (
          <motion.div key={i} className="relative"
            initial={animate ? { scale: 0, rotate: -40, opacity: 0 } : false}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ delay: delay + i * 0.22, type: 'spring', stiffness: 380, damping: 14 }}>
            <Star size={s} strokeWidth={1.5}
              className={earned ? 'text-amber-400' : 'text-stone-600'}
              fill={earned ? 'currentColor' : 'rgba(255,255,255,0.04)'}
              style={earned ? { filter: 'drop-shadow(0 0 14px rgba(245,158,11,0.75))' } : undefined} />
          </motion.div>
        );
      })}
    </div>
  );
}

const pctFmt = v => `${Math.round(v)}%`;

function buildRows(stats) {
  return [
    { label: 'Mission Time', value: stats.time, format: formatTime },
    { label: 'Waves Survived', value: stats.wavesSurvived, format: v => `${Math.round(v)} / ${stats.maxWaves}` },
    { label: 'Enemies Killed', value: stats.enemiesKilled },
    { label: 'Your Kills', value: stats.playerKills },
    { label: 'Accuracy', value: stats.accuracy * 100, format: pctFmt },
    { label: 'Best Streak', value: stats.bestStreak },
    { label: 'Towers Built', value: stats.towersBuilt },
    { label: 'Scrap Earned', value: stats.scrapEarned },
    { label: 'Base Integrity', value: stats.baseHealth, format: pctFmt, tone: stats.baseHealth >= 90 ? 'text-teal-300' : stats.baseHealth >= 50 ? 'text-amber-300' : 'text-red-400' },
  ];
}

/**
 * Debrief after a mission outcome.
 * result: { kind: 'cleared'|'gameover', outcome: 'victory'|'defeat', level, stars, newRecord, stats }
 */
export function MissionDebrief({ result, onContinue, onRetry, onMenu, onNext }) {
  const { outcome, level, stars, newRecord, stats, kind } = result;
  const victory = outcome === 'victory';
  const info = missionInfo(level);
  const finalVictory = victory && level >= TOTAL_LEVELS;
  const [showCampaign, setShowCampaign] = useState(false);

  const actions = [];
  if (!victory) {
    actions.push({ id: 'retry', label: 'Retry Mission', icon: RefreshCw, run: onRetry, primary: true });
    actions.push({ id: 'menu', label: 'Main Menu', icon: Home, run: onMenu });
  } else if (finalVictory) {
    actions.push({ id: 'campaign', label: 'Continue', icon: ChevronRight, run: () => setShowCampaign(true), primary: true });
  } else if (kind === 'cleared') {
    actions.push({ id: 'continue', label: `Continue to Op ${String(level + 1).padStart(2, '0')}`, icon: ChevronRight, run: onContinue, primary: true });
    actions.push({ id: 'menu', label: 'Main Menu', icon: Home, run: onMenu });
  } else {
    actions.push({ id: 'next', label: 'Next Mission', icon: ChevronRight, run: onNext, primary: true });
    actions.push({ id: 'menu', label: 'Main Menu', icon: Home, run: onMenu });
  }
  const [focus, setFocus] = useState(0);

  useKeyLayer((e) => {
    if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(e.code)) { e.preventDefault(); setFocus(f => (f - 1 + actions.length) % actions.length); }
    else if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS', 'Tab'].includes(e.code)) { e.preventDefault(); setFocus(f => (f + 1) % actions.length); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); actions[focus]?.run?.(); }
  }, { active: !showCampaign, activationDelay: 1200 }); // buttons fade in at ~1.1s

  if (showCampaign) return <CampaignComplete onMenu={onMenu} />;

  const rows = buildRows(stats);
  const accent = victory ? '#f59e0b' : '#f87171';

  return (
    <motion.div className="hud-root absolute inset-0 z-[45] pointer-events-auto overflow-y-auto hud-scroll"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-md" />
      <div className="fixed inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 20%, ${victory ? 'rgba(245,158,11,0.18)' : 'rgba(248,113,113,0.18)'}, transparent 60%)` }} />
      <div className="hud-screen-fx fixed" />

      <div className="relative min-h-full flex items-center justify-center p-4 md:p-8">
        <section className="w-full max-w-3xl">
          <motion.div className="text-center" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
            <div className="hud-label" style={{ color: accent }}>Operation {info.opNumber} · {info.codename} · {info.name}</div>
            <motion.h1 className="hud-title text-4xl sm:text-5xl md:text-6xl mt-2"
              style={{ color: victory ? '#fafaf9' : '#fecaca', textShadow: `0 0 30px ${accent}66` }}
              initial={{ letterSpacing: '0.5em', opacity: 0 }} animate={{ letterSpacing: '0.08em', opacity: 1 }} transition={{ duration: 0.7, ease: 'easeOut' }}>
              {victory ? 'Mission Complete' : 'Mission Failed'}
            </motion.h1>
            <div className="mx-auto mt-3 h-px w-64" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
          </motion.div>

          <div className="mt-6 relative">
            {victory ? <StarRow stars={stars} /> : (
              <div className="text-center text-red-200/80 font-display tracking-[0.2em] uppercase text-sm">
                {stats.baseHealth <= 0 ? 'Friendly base overrun' : 'The front has collapsed'}
              </div>
            )}
            {newRecord && victory && (
              <motion.div className="absolute right-0 sm:right-8 -top-2 rotate-6 px-3 py-1 border-2 border-amber-400 text-amber-300 hud-title text-xs bg-amber-500/10"
                initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.2, type: 'spring', stiffness: 300, damping: 15 }}>
                <span className="inline-flex items-center gap-1"><Trophy size={12} /> New Record</span>
              </motion.div>
            )}
          </div>

          <motion.div className="hud-panel mt-6 p-2 sm:p-4 grid sm:grid-cols-2 gap-x-8"
            initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
            {rows.map((r, i) => (
              <motion.div key={r.label} className="flex items-baseline justify-between px-3 py-2 border-b border-white/5"
                initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.45 + i * 0.07 }}>
                <span className="hud-label">{r.label}</span>
                <span className={`hud-value text-lg ${r.tone ?? ''}`}>
                  <CountUp value={r.value} format={r.format} delay={500 + i * 70} />
                </span>
              </motion.div>
            ))}
          </motion.div>

          <motion.div className="mt-6 flex flex-wrap justify-center gap-3"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
            {actions.map((a, i) => {
              const Icon = a.icon;
              return (
                <button key={a.id} type="button" onMouseEnter={() => setFocus(i)} onClick={a.run}
                  className={`hud-btn flex items-center gap-2 px-6 py-3 text-sm ${a.primary ? 'hud-btn-primary' : ''}`}
                  style={i === focus ? { outline: '2px solid #fbbf24', outlineOffset: 3 } : undefined}>
                  <Icon size={16} />{a.label}
                </button>
              );
            })}
          </motion.div>
        </section>
      </div>
    </motion.div>
  );
}

function CampaignComplete({ onMenu }) {
  const progress = useProgression();
  const totalStars = MISSION_IDS.reduce((sum, id) => sum + (progress.levels[id]?.stars ?? 0), 0);
  const totalTime = MISSION_IDS.reduce((sum, id) => sum + (progress.levels[id]?.bestTime ?? 0), 0);
  useKeyLayer((e) => { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); onMenu(); } }, { activationDelay: 1200 });

  return (
    <motion.div className="hud-root absolute inset-0 z-[45] pointer-events-auto overflow-y-auto hud-scroll bg-black"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 35%, rgba(245,158,11,0.25), transparent 65%)' }} />
      <div className="hud-screen-fx fixed" />
      <div className="relative min-h-full flex items-center justify-center p-6">
        <section className="w-full max-w-2xl text-center">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 16 }}>
            <Trophy size={64} className="mx-auto text-amber-400" style={{ filter: 'drop-shadow(0 0 24px rgba(245,158,11,0.8))' }} />
          </motion.div>
          <div className="hud-label text-amber-400 mt-5">All five operations secured</div>
          <motion.h1 className="hud-title text-4xl sm:text-6xl text-stone-50 mt-2"
            initial={{ letterSpacing: '0.6em', opacity: 0 }} animate={{ letterSpacing: '0.08em', opacity: 1 }} transition={{ duration: 1 }}>
            Campaign Complete
          </motion.h1>
          <p className="text-stone-300 mt-3 text-lg">BASE1 holds. The first assault is broken, from the dawn trenches to the ruined city.</p>

          <div className="hud-panel mt-8 p-4 grid grid-cols-5 gap-2">
            {MISSION_IDS.map((id, i) => {
              const m = missionInfo(id);
              const st = progress.levels[id]?.stars ?? 0;
              return (
                <motion.div key={id} className="py-2" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 + i * 0.12 }}>
                  <div className="hud-label" style={{ color: m.tint }}>Op {m.opNumber}</div>
                  <div className="font-display font-bold text-stone-100 text-sm">{m.name}</div>
                  <div className="flex justify-center gap-0.5 mt-1">
                    {[0, 1, 2].map(k => <Star key={k} size={12} className={k < st ? 'text-amber-400' : 'text-stone-600'} fill={k < st ? 'currentColor' : 'none'} />)}
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-center gap-10">
            <div><div className="hud-label">Total Stars</div><div className="hud-value text-3xl"><CountUp value={totalStars} delay={1200} /> <span className="text-stone-500 text-lg">/ 15</span></div></div>
            <div><div className="hud-label">Best Times Combined</div><div className="hud-value text-3xl"><CountUp value={totalTime} format={formatTime} delay={1200} /></div></div>
          </div>
          <button type="button" onClick={onMenu} className="hud-btn hud-btn-primary mt-8 px-8 py-3 text-sm inline-flex items-center gap-2">
            <Home size={16} /> Main Menu
          </button>
        </section>
      </div>
    </motion.div>
  );
}
