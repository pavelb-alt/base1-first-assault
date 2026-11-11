import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Lock, Star, ChevronLeft, Clock, Waves, Play } from 'lucide-react';
import { OPENING } from '@/game/config';
import { useProgression, TOTAL_LEVELS } from '@/game/progression';
import { useKeyLayer } from '@/components/shell/keyLayers';
import { useUiPrefs } from '@/components/shell/uiPrefs';
import { SettingsPanel } from '@/components/shell/SettingsPanel';
import { ControlsPanel, CreditsPanel } from '@/components/shell/ControlsPanel';
import { missionInfo, MISSION_IDS, formatTime } from '@/components/shell/missions';

const TITLE = 'BASE1'.split('');

function Backdrop() {
  // Mouse parallax via motion values (no React renders on mouse move) + CSS Ken Burns.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 40, damping: 18 });
  const sy = useSpring(my, { stiffness: 40, damping: 18 });
  const x = useTransform(sx, v => v * -26);
  const y = useTransform(sy, v => v * -16);
  const fx = useTransform(sx, v => v * -48);
  const fy = useTransform(sy, v => v * -26);

  useEffect(() => {
    const onMove = (e) => {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [mx, my]);

  return (
    <>
      <motion.div className="absolute -inset-[5%]" style={{ x, y }}>
        <motion.img
          src={OPENING.menuBackgroundUrl} alt="" draggable={false}
          className="hud-kenburns absolute inset-0 w-full h-full object-cover"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.6 }}
        />
      </motion.div>
      {/* Foreground haze layer moves faster for depth */}
      <motion.div className="absolute -inset-[8%] pointer-events-none" style={{ x: fx, y: fy,
        background: 'radial-gradient(ellipse at 75% 80%, rgba(245,158,11,0.16), transparent 45%), radial-gradient(ellipse at 20% 10%, rgba(94,234,212,0.06), transparent 40%)' }} />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
      <div className="hud-screen-fx" />
    </>
  );
}

function TitleLockup() {
  return (
    <div className="select-none">
      <motion.div className="hud-label !text-[11px] !tracking-[0.45em] text-amber-400/90"
        initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2, duration: 0.6 }}>
        Tactical Warfare Simulation
      </motion.div>
      <h1 className="font-display font-extrabold leading-[0.9] text-[clamp(4rem,9vw,8rem)] tracking-[0.06em] text-stone-50 mt-2"
        style={{ textShadow: '0 6px 40px rgba(0,0,0,0.7)' }} aria-label="BASE1">
        {TITLE.map((ch, i) => (
          <motion.span key={i} className={`inline-block ${ch === '1' ? 'text-amber-400' : ''}`}
            style={ch === '1' ? { textShadow: '0 0 40px rgba(245,158,11,0.6)' } : undefined}
            initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: 0.35 + i * 0.08, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}>
            {ch}
          </motion.span>
        ))}
      </h1>
      <div className="flex items-center gap-4 mt-2">
        <motion.span className="h-[2px] bg-amber-400 origin-left" style={{ width: 56 }}
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.9, duration: 0.5 }} />
        <motion.span className="font-display font-bold uppercase text-stone-200 tracking-[0.42em] text-[clamp(0.9rem,1.6vw,1.35rem)]"
          initial={{ opacity: 0, letterSpacing: '0.9em' }} animate={{ opacity: 1, letterSpacing: '0.42em' }} transition={{ delay: 0.95, duration: 0.8 }}>
          First Assault
        </motion.span>
      </div>
    </div>
  );
}

function MissionCard({ id, unlocked, record, active, onHover, onSelect, index }) {
  const m = missionInfo(id);
  const stars = record?.stars ?? 0;
  return (
    <motion.button
      type="button" onMouseEnter={onHover} onClick={onSelect} disabled={!unlocked}
      aria-label={`Operation ${m.opNumber} ${m.name}${unlocked ? '' : ' (locked)'}`}
      className={`group relative text-left hud-panel overflow-hidden flex flex-col transition-[transform,border-color,box-shadow] duration-200 ${
        active ? '-translate-y-1' : ''} ${unlocked ? 'cursor-pointer' : 'cursor-not-allowed'}`}
      style={{ borderColor: active ? m.tint : undefined, boxShadow: active ? `0 0 0 1px ${m.tint}, 0 18px 40px rgba(0,0,0,0.55), 0 0 40px ${m.tint}33` : undefined }}
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + index * 0.06 }}
    >
      <div className="relative h-28 overflow-hidden">
        <img src={OPENING.menuBackgroundUrl} alt="" draggable={false}
          className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 ${active ? 'scale-110' : 'scale-100'} ${unlocked ? '' : 'grayscale'}`}
          style={{ objectPosition: `${15 + id * 15}% 50%` }} />
        <div className="absolute inset-0 mix-blend-multiply" style={{ background: `linear-gradient(160deg, ${m.tint}, ${m.tint2})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c0e] via-transparent to-transparent" />
        <div className="absolute top-2 left-3 font-display font-extrabold text-4xl text-white/90 leading-none" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>
          {m.opNumber}
        </div>
        {!unlocked && (
          <div className="absolute inset-0 grid place-items-center bg-black/55">
            <Lock size={26} className="text-stone-300" />
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col p-3.5 pt-2.5">
        <div className="hud-label !text-[9px]" style={{ color: m.tint }}>{m.codename}</div>
        <div className="hud-title text-xl text-stone-50">{m.name}</div>
        <p className="text-stone-400 text-[13px] leading-snug mt-1 line-clamp-3 min-h-[3.4em]">
          {unlocked ? m.blurb : `Clear Operation ${String(id - 1).padStart(2, '0')} to unlock.`}
        </p>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <div className="flex gap-0.5" aria-label={`${stars} stars`}>
            {[0, 1, 2].map(k => (
              <Star key={k} size={14} className={k < stars ? 'text-amber-400' : 'text-stone-600'} fill={k < stars ? 'currentColor' : 'none'} />
            ))}
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-stone-400">
            <span className="flex items-center gap-1" title="Waves"><Waves size={11} />{m.maxWaves}</span>
            <span className="flex items-center gap-1" title="Best time"><Clock size={11} />{formatTime(record?.bestTime)}</span>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

function MissionSelect({ onBack, onStart, unlockAll, progress }) {
  const [active, setActive] = useState(Math.max(0, Math.min(TOTAL_LEVELS, progress.unlockedLevel) - 1));
  const isUnlocked = id => unlockAll || id <= progress.unlockedLevel;
  const launch = (id) => { if (isUnlocked(id)) onStart(id); };

  useKeyLayer((e) => {
    switch (e.code) {
      case 'Escape': case 'Backspace': e.preventDefault(); onBack(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'KeyA': case 'KeyW': e.preventDefault(); setActive(a => (a - 1 + MISSION_IDS.length) % MISSION_IDS.length); break;
      case 'ArrowRight': case 'ArrowDown': case 'KeyD': case 'KeyS': case 'Tab': e.preventDefault(); setActive(a => (a + 1) % MISSION_IDS.length); break;
      case 'Enter': case 'Space': e.preventDefault(); launch(MISSION_IDS[active]); break;
      default: break;
    }
  });

  const current = missionInfo(MISSION_IDS[active]);
  return (
    <motion.div className="absolute inset-0 z-10 flex flex-col p-4 sm:p-8 lg:p-12 overflow-y-auto hud-scroll"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm -z-10" />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <button type="button" onClick={onBack} className="hud-btn flex items-center gap-1.5 px-3 py-1.5 text-[11px] mb-4">
            <ChevronLeft size={14} /> Back <span className="hud-key !h-5 !text-[10px] ml-1">ESC</span>
          </button>
          <div className="hud-label text-amber-400/90">Campaign</div>
          <h2 className="hud-title text-3xl sm:text-4xl text-stone-50">Mission Select</h2>
        </div>
        {unlockAll && (
          <div className="hud-label !text-amber-300 border border-amber-500/40 bg-amber-500/10 px-3 py-1.5">Developer: all missions unlocked</div>
        )}
      </div>
      <div className="mt-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {MISSION_IDS.map((id, i) => (
          <MissionCard key={id} id={id} index={i} unlocked={isUnlocked(id)} record={progress.levels[id]}
            active={i === active} onHover={() => setActive(i)} onSelect={() => launch(id)} />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="text-stone-300 max-w-xl">
          <span className="hud-label mr-2" style={{ color: current.tint }}>{current.operation}</span>
          <span className="text-sm text-stone-400">{current.maxWaves} waves</span>
        </div>
        <button type="button" disabled={!isUnlocked(current.id)} onClick={() => launch(current.id)}
          className="hud-btn hud-btn-primary flex items-center gap-2 px-7 py-3 text-sm">
          <Play size={15} fill="currentColor" /> Deploy · Op {current.opNumber}
        </button>
      </div>
      <div className="mt-4 hidden sm:flex items-center gap-2 text-xs text-stone-500">
        <span className="hud-key">←→</span> Select <span className="hud-key">ENTER</span> Deploy
        <span className="ml-3">Hold <span className="hud-key">SHIFT</span> to unlock every mission (developer)</span>
      </div>
    </motion.div>
  );
}

export function MainMenu({ onStart }) {
  const progress = useProgression();
  const ui = useUiPrefs();
  const [screen, setScreen] = useState('main'); // main | missions | settings | controls | credits
  const [shiftHeld, setShiftHeld] = useState(false);
  const unlockAll = ui.unlockAllMissions || shiftHeld;

  const continueLevel = Math.max(1, Math.min(TOTAL_LEVELS, progress.unlockedLevel));
  const hasProgress = progress.unlockedLevel > 1 || Object.keys(progress.levels).length > 0;
  const cont = missionInfo(continueLevel);
  const totalStars = MISSION_IDS.reduce((s, id) => s + (progress.levels[id]?.stars ?? 0), 0);

  const items = [
    { id: 'continue', label: 'Continue Campaign', sub: hasProgress ? `Op ${cont.opNumber} · ${cont.name}` : 'No campaign in progress', disabled: !hasProgress, run: () => onStart(continueLevel) },
    { id: 'new', label: 'New Campaign', sub: 'Op 01 · Day', run: () => onStart(1) },
    { id: 'missions', label: 'Mission Select', sub: `${totalStars} / ${TOTAL_LEVELS * 3} stars`, run: () => setScreen('missions') },
    { id: 'settings', label: 'Settings', run: () => setScreen('settings') },
    { id: 'controls', label: 'Controls', run: () => setScreen('controls') },
    { id: 'credits', label: 'Credits', run: () => setScreen('credits') },
  ];
  const [index, setIndex] = useState(hasProgress ? 0 : 1);

  const move = useCallback((dir) => {
    setIndex(i => {
      let n = i;
      for (let k = 0; k < items.length; k++) {
        n = (n + dir + items.length) % items.length;
        if (!items[n].disabled) return n;
      }
      return i;
    });
  }, [items]);

  // Shift-to-unlock (developer). Capture listeners on window still fire while a key layer is open.
  useEffect(() => {
    const down = (e) => { if (e.key === 'Shift') setShiftHeld(true); };
    const up = (e) => { if (e.key === 'Shift') setShiftHeld(false); };
    const blur = () => setShiftHeld(false);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur); };
  }, []);

  useKeyLayer((e) => {
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': e.preventDefault(); move(-1); break;
      case 'ArrowDown': case 'KeyS': case 'Tab': e.preventDefault(); move(e.shiftKey && e.code === 'Tab' ? -1 : 1); break;
      case 'Enter': case 'Space': e.preventDefault(); if (!items[index].disabled) items[index].run(); break;
      default: break;
    }
  }, { active: screen === 'main' });

  return (
    <div className="hud-root absolute inset-0 z-50 overflow-hidden bg-black">
      <Backdrop />

      <AnimatePresence>
        {screen !== 'missions' && (
          <motion.div key="main" className="absolute inset-0 flex flex-col justify-between p-6 sm:p-10 lg:p-14 overflow-y-auto hud-scroll"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}>
            <TitleLockup />

            <motion.nav className="w-full max-w-sm mt-6" aria-label="Main menu"
              initial="hidden" animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 1.05 } } }}>
              {items.map((item, i) => (
                <motion.button key={item.id} type="button" disabled={item.disabled}
                  className="hud-menu-item text-[clamp(0.95rem,1.25vw,1.1rem)]" data-active={i === index}
                  variants={{ hidden: { opacity: 0, x: -24 }, show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } } }}
                  onMouseEnter={() => !item.disabled && setIndex(i)} onFocus={() => !item.disabled && setIndex(i)} onClick={item.run}>
                  <span className={`font-mono text-[11px] ${i === index ? 'text-amber-400' : 'text-stone-600'}`}>{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.sub && <span className="hud-label !text-[9px] !tracking-[0.16em] text-right">{item.sub}</span>}
                </motion.button>
              ))}
            </motion.nav>

            <motion.footer className="flex flex-wrap items-end justify-between gap-4 mt-6"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}>
              <div className="hidden sm:flex items-center gap-2 text-xs text-stone-400">
                <span className="hud-key">↑↓</span> Navigate <span className="hud-key">ENTER</span> Select <span className="hud-key">ESC</span> Back
              </div>
              <div className="font-mono text-[10px] tracking-[0.2em] text-stone-500 uppercase">BASE1 // First Assault · Build 1.0</div>
            </motion.footer>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {screen === 'missions' && (
          <MissionSelect key="missions" progress={progress} unlockAll={unlockAll}
            onBack={() => setScreen('main')} onStart={onStart} />
        )}
        {screen === 'settings' && <SettingsPanel key="settings" onClose={() => setScreen('main')} />}
        {screen === 'controls' && <ControlsPanel key="controls" onClose={() => setScreen('main')} />}
        {screen === 'credits' && <CreditsPanel key="credits" onClose={() => setScreen('main')} />}
      </AnimatePresence>
    </div>
  );
}
