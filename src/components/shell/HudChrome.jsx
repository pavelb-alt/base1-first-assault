// In-game HUD chrome owned by the shell: objective tracker, wave banner, mode
// indicator, controls hints, action buttons and toasts. Everything here sits inside
// the pointer-events-none HUD container; only real controls opt back in.
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crosshair, Radar, Pause, ChevronDown, ChevronUp, Users, Skull, Shield, Truck, Target, LogOut, AlertTriangle } from 'lucide-react';
import { gameEvents } from '@/game/gameEvents';
import { getMaxWaves } from '@/game/config';
import { useSettings } from '@/game/settings';
import { missionInfo } from './missions';
import { BINDINGS, KeyCombo } from './ControlsPanel';
import { uiPrefs, useUiPrefs } from './uiPrefs';

// TowerDefenseHUD (gameplay agent) draws its scrap pill top-center in strategic
// mode; the tracker sits directly below it there, and at the very top otherwise.
const TRACKER_TOP = { strategic: 70, third_person: 12 };

function barColor(pct) {
  if (pct > 60) return '#5eead4';
  if (pct > 30) return '#fbbf24';
  return '#f87171';
}

/**
 * Top-center objective tracker. Polls window.game at 4 Hz and only re-renders on change.
 */
export function ObjectiveTracker({ level, wave, mode, tankCount, artilleryCount }) {
  const info = missionInfo(level);
  const maxWaves = getMaxWaves(level);
  const [live, setLive] = useState({ friendly: 100, enemy: 100, enemies: 0, soldiers: 0 });
  const lastKey = useRef('');

  useEffect(() => {
    const poll = () => {
      const g = window.game;
      if (!g?.getBattle) return;
      const b = g.getBattle().baseHealth ?? {};
      const next = {
        friendly: Math.max(0, b.friendly ?? 100), enemy: Math.max(0, b.enemy ?? 100),
        enemies: g.getEnemyCount?.() ?? 0, soldiers: g.getSoldierCount?.() ?? 0,
      };
      const key = `${next.friendly}|${next.enemy}|${next.enemies}|${next.soldiers}`;
      if (key !== lastKey.current) { lastKey.current = key; setLive(next); }
    };
    poll();
    const id = setInterval(poll, 250);
    return () => clearInterval(id);
  }, []);

  const waveP = Math.min(100, (wave / maxWaves) * 100);
  const low = live.friendly <= 30;

  return (
    <div className="absolute left-1/2 -translate-x-1/2 w-[440px] max-w-[calc(100%-2rem)] transition-[top] duration-300"
      style={{ top: TRACKER_TOP[mode] ?? 12 }}>
      <div className="hud-panel px-4 pt-2.5 pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="hud-label truncate" style={{ color: info.tint }}>Op {info.opNumber} · {info.operation}</div>
          </div>
          <div className="hud-value text-sm whitespace-nowrap">
            <span className="text-stone-400 font-semibold mr-1.5 text-[11px] tracking-[0.2em]">WAVE</span>
            {wave}<span className="text-stone-500"> / {maxWaves}</span>
          </div>
        </div>
        <div className="hud-meter hud-segments mt-1.5 h-[7px]">
          <span style={{ width: `${waveP}%`, background: 'linear-gradient(90deg,#d97706,#fbbf24)' }} />
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 items-center">
          <div>
            <div className="flex items-center justify-between">
              <span className={`hud-label flex items-center gap-1 ${low ? 'text-red-300 hud-low-pulse' : ''}`}>
                <Shield size={10} /> Base Integrity
              </span>
              <span className="hud-value text-xs" style={{ color: barColor(live.friendly) }}>{Math.round(live.friendly)}%</span>
            </div>
            <div className="hud-meter mt-1">
              <span style={{ width: `${live.friendly}%`, background: barColor(live.friendly) }} />
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <Counter icon={Users} value={live.soldiers} color="#5eead4" title="Friendly units" />
            {tankCount > 0 && <Counter icon={Truck} value={tankCount} color="#5eead4" title="Tanks" />}
            {artilleryCount > 0 && <Counter icon={Target} value={artilleryCount} color="#5eead4" title="Artillery" />}
            <Counter icon={Skull} value={live.enemies} color="#f87171" title="Hostiles on field" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Counter({ icon: Icon, value, color, title }) {
  return (
    <span className="inline-flex items-center gap-1 hud-value" title={title} aria-label={`${title}: ${value}`}>
      <Icon size={13} style={{ color }} />{value}
    </span>
  );
}

/** "WAVE N INCOMING" banner on gameEvents 'wave-start'. */
export function WaveBanner() {
  const [banner, setBanner] = useState(null);
  useEffect(() => {
    let timer;
    const off = gameEvents.on('wave-start', (e) => {
      if (!e || e.wave >= e.maxWaves) return; // reaching maxWaves clears the level, so no banner
      const final = e.wave === e.maxWaves - 1;
      setBanner({ wave: e.wave, maxWaves: e.maxWaves, final, id: `${e.level}-${e.wave}` });
      clearTimeout(timer);
      timer = setTimeout(() => setBanner(null), final ? 4200 : 2800);
    });
    return () => { off(); clearTimeout(timer); };
  }, []);

  return (
    <div className="absolute inset-x-0 top-[22%] flex justify-center pointer-events-none">
      <AnimatePresence>
        {banner && (
          <motion.div key={banner.id} className="relative text-center"
            initial={{ opacity: 0, scaleX: 1.6 }} animate={{ opacity: 1, scaleX: 1 }} exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}>
            <motion.div className="absolute inset-x-[-15%] top-1/2 -translate-y-1/2 h-[120%]"
              style={{ background: `linear-gradient(90deg, transparent, ${banner.final ? 'rgba(127,29,29,0.75)' : 'rgba(0,0,0,0.6)'} 25%, ${banner.final ? 'rgba(127,29,29,0.75)' : 'rgba(0,0,0,0.6)'} 75%, transparent)` }}
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.4 }} />
            <div className="relative px-10 py-3">
              <div className={`hud-label ${banner.final ? 'text-red-200' : 'text-amber-300'}`}>
                {banner.final ? 'Hold the line' : 'Hostile contact'}
              </div>
              <div className={`hud-title ${banner.final ? 'text-5xl md:text-6xl text-red-100' : 'text-3xl md:text-4xl text-stone-50'}`}
                style={{ textShadow: banner.final ? '0 0 28px rgba(248,113,113,0.9)' : '0 0 20px rgba(245,158,11,0.55)' }}>
                {banner.final ? 'Final Wave' : `Wave ${banner.wave} Incoming`}
              </div>
              <div className="mt-1 flex items-center justify-center gap-2">
                <span className="h-px w-16 bg-gradient-to-r from-transparent to-amber-400/80" />
                <span className="hud-value text-xs text-stone-300">{banner.wave} / {banner.maxWaves}</span>
                <span className="h-px w-16 bg-gradient-to-l from-transparent to-amber-400/80" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ModeIndicator({ mode, level }) {
  const info = missionInfo(level);
  const strategic = mode === 'strategic';
  const Icon = strategic ? Radar : Crosshair;
  return (
    <div className="absolute top-4 left-4 hud-panel hud-panel-accent flex items-center gap-3 pl-3 pr-4 py-1"
      style={{ borderLeftColor: strategic ? '#f59e0b' : '#5eead4' }}>
      <Icon size={18} className={strategic ? 'text-amber-400' : 'text-teal-300'} />
      <div className="leading-tight">
        <div className="hud-title text-[13px] text-stone-50">{strategic ? 'Strategic Command' : 'Direct Control'}</div>
        <div className="hud-label !text-[9px]">{info.name} Operation · {strategic ? 'Overview' : 'Possessed unit'}</div>
      </div>
    </div>
  );
}

const HINT_KEYS = {
  strategic: ['Pan camera', 'Zoom', 'Select unit / box-select squad', 'Move / Attack / Hold', 'Place tower', 'Deselect (pause when nothing selected)'],
  third_person: ['Move soldier / drive vehicle', 'Shoot', 'Aim down sights', 'Space', 'Enter / exit gun position', 'Deploy tower menu', 'Release control'],
};

/** Contextual controls panel; collapsible by click or the ? key. Hidden if tutorial hints are off. */
export function ControlsHint({ mode }) {
  const { showTutorialHints } = useSettings();
  const { hintsCollapsed } = useUiPrefs();
  if (!showTutorialHints) return null;
  const wanted = HINT_KEYS[mode] ?? [];
  const items = (BINDINGS[mode] ?? []).filter(b => wanted.includes(b.d) || wanted.includes(b.keys[0]));
  const toggle = () => uiPrefs.set({ hintsCollapsed: !hintsCollapsed });

  return (
    <div className="absolute bottom-4 left-4 hidden sm:block">
      <div className="hud-panel w-[290px] pointer-events-auto">
        <button type="button" onClick={toggle} aria-expanded={!hintsCollapsed}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left">
          <span className="hud-label">Controls · {mode === 'strategic' ? 'Command' : 'Direct'}</span>
          <span className="flex items-center gap-1.5">
            <span className="hud-key !h-5 !text-[10px]">?</span>
            {hintsCollapsed ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />}
          </span>
        </button>
        <AnimatePresence initial={false}>
          {!hintsCollapsed && (
            <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }} className="overflow-hidden">
              <div className="px-3 pb-2.5 space-y-1">
                {items.map(item => (
                  <div key={item.d} className="flex items-center justify-between gap-3">
                    <span className="text-stone-300 text-[13px] leading-tight">{item.d.replace(' (pause when nothing selected)', ' / pause')}</span>
                    <KeyCombo item={item} size="sm" />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/5">
                  <span className="text-stone-400 text-[13px]">Pause menu</span>
                  <span className="hud-key !h-5 !text-[10px]">P</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function PauseButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label="Pause (P)" title="Pause (P)"
      className="absolute top-4 right-4 hud-btn hud-panel flex items-center gap-2 px-2.5 py-1.5 pointer-events-auto text-[11px]">
      <Pause size={14} /> <span className="hud-key !h-5 !min-w-[1.2rem] !text-[10px]">P</span>
    </button>
  );
}

export function ActionButton({ mode, waiting, onJoin, onRelease }) {
  if (mode === 'strategic') {
    return (
      <button type="button" onClick={onJoin}
        className={`absolute bottom-4 right-4 hud-btn pointer-events-auto flex items-center gap-3 pl-4 pr-5 py-3 text-sm shadow-xl ${waiting ? '' : 'hud-btn-primary'}`}>
        <Crosshair size={18} />
        <span className="flex flex-col items-start leading-none">
          <span>{waiting ? 'Awaiting Units' : 'Join the Fight'}</span>
          <span className="text-[9px] tracking-[0.25em] opacity-70 mt-1">{waiting ? 'No soldier available' : 'Possess a soldier'}</span>
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={onRelease}
      className="absolute bottom-4 right-4 hud-btn pointer-events-auto flex items-center gap-3 px-4 py-2.5 text-xs shadow-xl"
      style={{ borderColor: 'rgba(94,234,212,0.5)' }}>
      <LogOut size={15} className="text-teal-300" /> Release <span className="hud-key !h-5 !text-[10px]">TAB</span>
    </button>
  );
}

export function ReinforcementToast({ show }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div key="reinf" className="absolute bottom-24 right-4 hud-panel hud-panel-accent flex items-center gap-3 px-4 py-2.5 max-w-[320px]"
          initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
          </span>
          <div className="leading-tight">
            <div className="hud-title text-[12px] text-amber-200">Waiting for reinforcements</div>
            <div className="text-stone-400 text-[13px]">No soldier available to possess. The next cargo drop is inbound.</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Generic full-screen error panel (load failures). */
export function ErrorPanel({ title, message, actions }) {
  return (
    <div className="hud-root absolute inset-0 z-40 grid place-items-center bg-black/85 backdrop-blur-sm pointer-events-auto p-4">
      <div className="hud-panel hud-brackets w-full max-w-md p-6" style={{ borderColor: 'rgba(248,113,113,0.35)' }}>
        <div className="flex items-center gap-2 hud-label text-red-300"><AlertTriangle size={13} /> System fault</div>
        <div className="hud-title text-xl text-red-100 mt-1">{title}</div>
        <p className="text-stone-300 mt-2 leading-snug">{message}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {actions.map(a => (
            <button key={a.label} type="button" onClick={a.run}
              className={`hud-btn px-5 py-2 text-xs ${a.primary ? 'hud-btn-primary' : ''}`}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
