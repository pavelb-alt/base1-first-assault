import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, RefreshCw, Settings, Keyboard, LogOut } from 'lucide-react';
import { missionStats, missionElapsedSeconds } from '@/game/progression';
import { useKeyLayer } from './keyLayers';
import { SettingsPanel } from './SettingsPanel';
import { ControlsPanel } from './ControlsPanel';
import { missionInfo, formatTime } from './missions';

const ITEMS = [
  { id: 'resume', label: 'Resume', icon: Play },
  { id: 'restart', label: 'Restart Mission', icon: RefreshCw, confirm: 'Restart this mission? Progress in the current run will be lost.' },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'controls', label: 'Controls', icon: Keyboard },
  { id: 'quit', label: 'Quit to Main Menu', icon: LogOut, confirm: 'Abandon the mission and return to the main menu?' },
];

/** In-mission pause menu. The page owns pause-game / resume-game emission. */
export function PauseMenu({ level, wave, onResume, onRestart, onQuit }) {
  const [index, setIndex] = useState(0);
  const [sub, setSub] = useState(null);        // 'settings' | 'controls'
  const [confirm, setConfirm] = useState(null); // item awaiting confirmation
  const [confirmYes, setConfirmYes] = useState(false);
  const info = missionInfo(level);
  // Snapshot once when the menu opens: the mission is paused, numbers don't move.
  const snap = useMemo(() => ({
    time: missionElapsedSeconds(), kills: missionStats.playerKills, enemies: missionStats.enemiesKilled, base: missionStats.baseHealth,
  }), []);

  const activate = (item) => {
    if (item.confirm) { setConfirm(item); setConfirmYes(false); return; }
    if (item.id === 'resume') onResume();
    else setSub(item.id);
  };
  const runConfirmed = () => {
    const id = confirm?.id;
    setConfirm(null);
    if (id === 'restart') onRestart();
    else if (id === 'quit') onQuit();
  };

  useKeyLayer((e) => {
    if (confirm) {
      if (e.code === 'Escape') { e.preventDefault(); setConfirm(null); }
      else if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Tab'].includes(e.code)) { e.preventDefault(); setConfirmYes(v => !v); }
      else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); if (confirmYes) runConfirmed(); else setConfirm(null); }
      return;
    }
    switch (e.code) {
      case 'Escape': case 'KeyP': e.preventDefault(); onResume(); break;
      case 'ArrowUp': case 'KeyW': e.preventDefault(); setIndex(i => (i - 1 + ITEMS.length) % ITEMS.length); break;
      case 'ArrowDown': case 'KeyS': e.preventDefault(); setIndex(i => (i + 1) % ITEMS.length); break;
      case 'Enter': case 'Space': e.preventDefault(); activate(ITEMS[index]); break;
      default: break;
    }
  }, { active: !sub });

  return (
    <motion.div className="hud-root absolute inset-0 z-[55] pointer-events-auto"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[6px]" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30" />
      <div className="hud-screen-fx opacity-70" />
      <div className="relative h-full flex items-center px-6 md:px-16">
        <motion.div className="w-full max-w-sm" initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
          <div className="hud-label text-amber-400/90">Operation {info.opNumber} · {info.name}</div>
          <h1 className="hud-title text-5xl text-stone-50 mt-1 mb-1">Paused</h1>
          <div className="h-px w-40 bg-gradient-to-r from-amber-500 to-transparent mb-6" />
          <nav className="space-y-1" aria-label="Pause menu">
            {ITEMS.map((item, i) => {
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" className="hud-menu-item text-[15px]" data-active={i === index}
                  onMouseEnter={() => setIndex(i)} onClick={() => activate(item)}>
                  <Icon size={16} className={i === index ? 'text-amber-400' : 'text-stone-500'} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-8 flex items-center gap-2 text-xs text-stone-400">
            <span className="hud-key">↑↓</span> Navigate <span className="hud-key">ENTER</span> Select <span className="hud-key">P</span> Resume
          </div>
        </motion.div>

        {/* Mission status sidebar */}
        <motion.aside className="hidden lg:block ml-auto w-72 hud-panel hud-panel-accent p-5"
          initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.08, type: 'spring', stiffness: 260, damping: 28 }}>
          <div className="hud-label">{info.operation}</div>
          <div className="font-display text-stone-300 text-sm mt-1 mb-4 leading-snug">{info.blurb}</div>
          {[
            ['Wave', `${wave} / ${info.maxWaves}`],
            ['Mission Time', formatTime(snap.time)],
            ['Enemies Down', snap.enemies],
            ['Your Kills', snap.kills],
            ['Base Integrity', `${Math.round(snap.base)}%`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between items-baseline py-1.5 border-b border-white/5">
              <span className="hud-label">{k}</span><span className="hud-value">{v}</span>
            </div>
          ))}
        </motion.aside>
      </div>

      <AnimatePresence>
        {confirm && (
          <motion.div key="confirm" className="absolute inset-0 z-10 grid place-items-center bg-black/60 p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="hud-panel hud-brackets w-full max-w-md p-6" initial={{ scale: 0.96 }} animate={{ scale: 1 }}>
              <div className="hud-label text-amber-400">Confirm</div>
              <div className="hud-title text-xl text-stone-50 mt-1">{confirm.label}</div>
              <p className="text-stone-300 mt-2">{confirm.confirm}</p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" className="hud-btn px-5 py-2 text-xs" data-active={!confirmYes}
                  style={!confirmYes ? { borderColor: '#f59e0b' } : undefined}
                  onMouseEnter={() => setConfirmYes(false)} onClick={() => setConfirm(null)}>Cancel</button>
                <button type="button" className={`hud-btn px-5 py-2 text-xs ${confirmYes ? 'hud-btn-primary' : ''}`}
                  onMouseEnter={() => setConfirmYes(true)} onClick={runConfirmed}>Confirm</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sub === 'settings' && <SettingsPanel key="settings" onClose={() => setSub(null)} />}
        {sub === 'controls' && <ControlsPanel key="controls" onClose={() => setSub(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}
