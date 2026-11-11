import { useState, useRef, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { settings, useSettings, DEFAULT_SETTINGS } from '@/game/settings';
import { ShellModal } from './ShellModal';
import { useKeyLayer } from './keyLayers';
import { uiPrefs, useUiPrefs } from './uiPrefs';

const pct = v => `${Math.round(v * 100)}%`;
const mult = v => `${v.toFixed(2)}×`;

// Every settings.js field is represented here. `store: 'ui'` rows live in uiPrefs.
const TABS = [
  { id: 'audio', label: 'Audio', rows: [
    { key: 'masterVolume', label: 'Master Volume', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pct },
    { key: 'musicVolume', label: 'Music', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pct },
    { key: 'sfxVolume', label: 'Effects', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pct },
    { key: 'uiVolume', label: 'Interface', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pct },
  ]},
  { id: 'graphics', label: 'Graphics', rows: [
    { key: 'quality', label: 'Render Quality', type: 'choice', options: ['low', 'medium', 'high', 'ultra'],
      desc: 'Shadows, draw distance and effect density.' },
    { key: 'postProcessing', label: 'Post Processing', type: 'toggle', desc: 'Bloom, color grading and cinematic effects.' },
    { key: 'screenShake', label: 'Screen Shake', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pct },
    { key: 'showDamageNumbers', label: 'Damage Numbers', type: 'toggle' },
  ]},
  { id: 'controls', label: 'Controls', rows: [
    { key: 'mouseSensitivity', label: 'Mouse Sensitivity', type: 'slider', min: 0.2, max: 3, step: 0.05, fmt: mult },
    { key: 'invertY', label: 'Invert Y Axis', type: 'toggle', desc: 'Applies to third-person aiming.' },
  ]},
  { id: 'gameplay', label: 'Gameplay', rows: [
    { key: 'difficulty', label: 'Difficulty', type: 'choice', options: ['easy', 'normal', 'hard'] },
    { key: 'showTutorialHints', label: 'Tutorial Hints', type: 'toggle', desc: 'Show the controls panel during missions.' },
    { key: 'unlockAllMissions', store: 'ui', label: 'Unlock All Missions', type: 'toggle',
      desc: 'Developer option: any mission can be played from Mission Select.' },
  ]},
];

function Slider({ row, value, onChange }) {
  const fill = ((value - row.min) / (row.max - row.min)) * 100;
  return (
    <div className="flex items-center gap-3 w-full sm:w-64">
      <input
        type="range" className="hud-slider" aria-label={row.label}
        min={row.min} max={row.max} step={row.step} value={value}
        style={{ '--pct': `${fill}%` }}
        onChange={e => onChange(Number(e.target.value))}
        tabIndex={-1}
      />
      <span className="hud-value text-sm w-14 text-right">{row.fmt(value)}</span>
    </div>
  );
}

function Toggle({ row, value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <span className="hud-label w-8 text-right">{value ? 'On' : 'Off'}</span>
      <button type="button" role="switch" aria-checked={!!value} aria-label={row.label}
        className="hud-toggle" onClick={() => onChange(!value)} tabIndex={-1} />
    </div>
  );
}

function Choice({ row, value, onChange }) {
  return (
    <div className="hud-seg" role="group" aria-label={row.label}>
      {row.options.map(o => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)} tabIndex={-1}>{o}</button>
      ))}
    </div>
  );
}

function step(row, value, dir) {
  if (row.type === 'slider') {
    const next = Math.round((value + dir * row.step) / row.step) * row.step;
    return Math.min(row.max, Math.max(row.min, Number(next.toFixed(4))));
  }
  if (row.type === 'toggle') return !value;
  const i = row.options.indexOf(value);
  return row.options[Math.min(row.options.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
}

/** Settings modal. Arrow keys: ↑↓ row, ←→ adjust, Tab/Q/E switch tab, Esc close. */
export function SettingsPanel({ onClose, initialTab = 'audio' }) {
  const s = useSettings();
  const ui = useUiPrefs();
  const [tab, setTab] = useState(Math.max(0, TABS.findIndex(t => t.id === initialTab)));
  const [row, setRow] = useState(0);
  const listRef = useRef(null);
  const rows = TABS[tab].rows;

  const valueOf = r => (r.store === 'ui' ? ui[r.key] : s[r.key]);
  const setValue = (r, v) => (r.store === 'ui' ? uiPrefs.set({ [r.key]: v }) : settings.set({ [r.key]: v }));

  const switchTab = (dir) => { setTab(t => (t + dir + TABS.length) % TABS.length); setRow(0); };

  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${row}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [row, tab]);

  useKeyLayer((e) => {
    const r = rows[row];
    switch (e.code) {
      case 'Escape': case 'Backspace': e.preventDefault(); onClose(); break;
      case 'Tab': e.preventDefault(); switchTab(e.shiftKey ? -1 : 1); break;
      case 'KeyQ': case 'BracketLeft': switchTab(-1); break;
      case 'KeyE': case 'BracketRight': switchTab(1); break;
      case 'ArrowUp': case 'KeyW': e.preventDefault(); setRow(i => (i - 1 + rows.length) % rows.length); break;
      case 'ArrowDown': case 'KeyS': e.preventDefault(); setRow(i => (i + 1) % rows.length); break;
      case 'ArrowLeft': case 'KeyA': e.preventDefault(); if (r) setValue(r, step(r, valueOf(r), -1)); break;
      case 'ArrowRight': case 'KeyD': e.preventDefault(); if (r) setValue(r, step(r, valueOf(r), 1)); break;
      case 'Enter': case 'Space':
        e.preventDefault();
        if (r?.type === 'toggle') setValue(r, !valueOf(r));
        else if (r?.type === 'choice') setValue(r, r.options[(r.options.indexOf(valueOf(r)) + 1) % r.options.length]);
        break;
      default: break;
    }
  });

  const isDefault = Object.keys(DEFAULT_SETTINGS).every(k => s[k] === DEFAULT_SETTINGS[k]);

  return (
    <ShellModal
      title="Settings" eyebrow="System Configuration" onClose={onClose} handleKeys={false}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-stone-400">
            <span className="hud-key">↑↓</span> Select <span className="hud-key">←→</span> Adjust
            <span className="hud-key">TAB</span> Category <span className="hud-key">ESC</span> Back
          </div>
          <button type="button" className="hud-btn flex items-center gap-2 px-3 py-2 text-[11px]"
            disabled={isDefault} onClick={() => settings.reset()}>
            <RotateCcw size={13} /> Reset to defaults
          </button>
        </div>
      }
    >
      <nav className="flex flex-wrap gap-1 border-b border-white/10 -mt-2 mb-4" role="tablist">
        {TABS.map((t, i) => (
          <button key={t.id} type="button" role="tab" aria-selected={i === tab} data-active={i === tab}
            className="hud-tab" onClick={() => { setTab(i); setRow(0); }}>
            {t.label}
          </button>
        ))}
      </nav>
      <div ref={listRef} className="space-y-1.5 min-h-[260px]">
        {rows.map((r, i) => {
          const Control = r.type === 'slider' ? Slider : r.type === 'toggle' ? Toggle : Choice;
          const active = i === row;
          return (
            <div key={r.key} data-row={i} onMouseEnter={() => setRow(i)}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-6 px-4 py-3 border transition-colors ${
                active ? 'bg-amber-500/10 border-amber-500/40' : 'bg-white/[0.02] border-white/5'}`}>
              <div className="min-w-0">
                <div className={`font-display font-bold tracking-[0.12em] uppercase text-sm ${active ? 'text-amber-200' : 'text-stone-200'}`}>
                  {r.label}
                </div>
                {r.desc && <div className="text-stone-400 text-sm leading-snug">{r.desc}</div>}
              </div>
              <Control row={r} value={valueOf(r)} onChange={v => setValue(r, v)} />
            </div>
          );
        })}
      </div>
    </ShellModal>
  );
}
