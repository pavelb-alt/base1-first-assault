import { ShellModal } from './ShellModal';

// Source of truth for control bindings shown in menus and the in-game hint panel.
export const BINDINGS = {
  strategic: [
    { keys: ['W', 'A', 'S', 'D'], d: 'Pan camera' },
    { keys: ['Wheel'], d: 'Zoom' },
    { keys: ['Click'], alt: ['Drag'], d: 'Select unit / box-select squad' },
    { keys: ['Shift', 'Click'], combo: true, d: 'Add or remove unit' },
    { keys: ['Ctrl', 'A'], combo: true, d: 'Select all ground troops' },
    { keys: ['Click'], d: 'Order to ground (with selection)' },
    { keys: ['M'], alt: ['T'], alt2: ['H'], d: 'Move / Attack / Hold' },
    { keys: ['C'], d: 'Automatic orders' },
    { keys: ['Esc'], d: 'Deselect (pause when nothing selected)' },
    { keys: ['RMB'], d: 'Place tower' },
  ],
  third_person: [
    { keys: ['W', 'A', 'S', 'D'], d: 'Move soldier / drive vehicle' },
    { keys: ['Mouse'], d: 'Look around' },
    { keys: ['LMB'], d: 'Shoot' },
    { keys: ['RMB'], d: 'Aim down sights' },
    { keys: ['Space'], d: 'Jump / double jump' },
    { keys: ['E'], d: 'Enter / exit gun position' },
    { keys: ['B'], d: 'Deploy tower menu' },
    { keys: ['Tab'], alt: ['Esc'], d: 'Release control' },
  ],
  general: [
    { keys: ['P'], d: 'Pause menu' },
    { keys: ['?'], d: 'Show / hide control hints' },
    { keys: ['Space'], d: 'Hold to skip cinematics' },
  ],
};

export function KeyCombo({ item, size = 'md' }) {
  const cls = size === 'sm' ? 'hud-key !h-5 !min-w-[1.3rem] !text-[10px]' : 'hud-key';
  const group = keys => keys.map((k, i) => (
    <span key={k + i} className="inline-flex items-center gap-1">
      {i > 0 && item.combo ? <span className="text-stone-500 text-[10px]">+</span> : null}
      <span className={cls}>{k}</span>
    </span>
  ));
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {group(item.keys)}
      {item.alt && <><span className="text-stone-500 text-[10px] px-0.5">/</span>{group(item.alt)}</>}
      {item.alt2 && <><span className="text-stone-500 text-[10px] px-0.5">/</span>{group(item.alt2)}</>}
    </span>
  );
}

function Group({ title, items, accent }) {
  return (
    <div>
      <div className="hud-label mb-3" style={{ color: accent }}>{title}</div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.d} className="flex items-center justify-between gap-4 py-1 border-b border-white/5">
            <span className="text-stone-300 text-[15px]">{item.d}</span>
            <KeyCombo item={item} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ControlsPanel({ onClose }) {
  return (
    <ShellModal title="Controls" eyebrow="Field Manual" onClose={onClose} width="max-w-4xl">
      <div className="grid md:grid-cols-2 gap-x-10 gap-y-8">
        <Group title="Strategic Command" items={BINDINGS.strategic} accent="#fbbf24" />
        <div className="space-y-8">
          <Group title="Direct Control" items={BINDINGS.third_person} accent="#5eead4" />
          <Group title="General" items={BINDINGS.general} accent="rgba(231,229,228,0.6)" />
        </div>
      </div>
    </ShellModal>
  );
}

export function CreditsPanel({ onClose }) {
  const lines = [
    ['Game', 'BASE1: First Assault'],
    ['Engine', 'React Three Fiber · Rapier Physics'],
    ['Built with', 'Base44'],
    ['Typography', 'Oxanium · Rajdhani · JetBrains Mono'],
  ];
  return (
    <ShellModal title="Credits" eyebrow="Personnel" onClose={onClose} width="max-w-xl">
      <div className="space-y-4">
        {lines.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-6 border-b border-white/5 pb-3">
            <span className="hud-label">{k}</span>
            <span className="font-display font-bold tracking-wide text-stone-100 text-right">{v}</span>
          </div>
        ))}
        <p className="text-stone-400 text-sm pt-2">Thanks for playing. Hold the line.</p>
      </div>
    </ShellModal>
  );
}
