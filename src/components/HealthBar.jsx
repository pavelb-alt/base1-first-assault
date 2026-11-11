import { useState, useEffect, useRef } from 'react';
import { EventBus } from '@/game/EventBus';
import { COMBAT } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { controlledEntry } from '@/game/3d/feedback/controlled';

const liveUnit = { health: 0, maxHealth: 0, type: 'soldier' }; // reused every frame

const TYPE_LABEL = {
  soldier: 'Rifleman', tank: 'Battle Tank', artillery: 'Artillery', tower: 'Gun Emplacement',
};
const LOW = 0.3;
const TRAIL_DELAY = 380;

/**
 * Possessed-unit health: segmented bar with a delayed white damage trail and a
 * low-health pulse. The per-frame poll writes to the DOM through refs; React only
 * re-renders when visibility or the unit type changes.
 */
export function HealthBar() {
  const [visible, setVisible] = useState(false);
  const [present, setPresent] = useState(false);
  const [type, setType] = useState('soldier');
  const fillRef = useRef(null);
  const trailRef = useRef(null);
  const textRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const onMode = (m) => setVisible(m === 'third_person');
    EventBus.on('mode-changed', onMode);
    return () => EventBus.off('mode-changed', onMode);
  }, []);

  useEffect(() => {
    if (!visible) { setPresent(false); return undefined; }
    let raf = 0;
    let lastHp = null;
    let lastMax = -1;
    let lastType = null;
    let trailTimer = 0;
    let shownPresent = false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      // Cheap per-frame lookup; the full window.game snapshot is only a fallback for
      // control targets whose registry entry carries no health (e.g. towers).
      const entry = controlledEntry();
      let unit;
      if (entry && Number.isFinite(entry.health)) {
        liveUnit.health = entry.health; liveUnit.maxHealth = entry.maxHealth;
        liveUnit.type = gameState.controlledStation?.type ?? 'soldier';
        unit = liveUnit;
      } else unit = window.game?.getControlledUnit?.();
      const hp = unit?.health ?? null;
      const has = hp !== null;
      if (has !== shownPresent) { shownPresent = has; setPresent(has); }
      if (!has) { lastHp = null; return; }
      if (unit.type !== lastType) { lastType = unit.type; setType(unit.type); }
      const max = unit.maxHealth ?? COMBAT.maxHealth;
      if (hp === lastHp && max === lastMax) return;
      const fill = fillRef.current, trail = trailRef.current;
      if (!fill || !trail) return; // bar mounts on the next render; retry next frame
      const frac = Math.max(0, Math.min(1, hp / max));
      const prevFrac = lastHp === null ? frac : Math.max(0, Math.min(1, lastHp / lastMax));
      lastHp = hp; lastMax = max;
      fill.style.width = `${frac * 100}%`;
      fill.style.background = frac > 0.5 ? 'linear-gradient(90deg,#14b8a6,#5eead4)' : frac > LOW ? 'linear-gradient(90deg,#d97706,#fbbf24)' : 'linear-gradient(90deg,#b91c1c,#f87171)';
      if (frac < prevFrac) {
        clearTimeout(trailTimer);
        trailTimer = setTimeout(() => { trail.style.width = `${frac * 100}%`; }, TRAIL_DELAY);
      } else {
        clearTimeout(trailTimer);
        trail.style.width = `${frac * 100}%`;
      }
      if (textRef.current) textRef.current.textContent = `${Math.ceil(hp)} / ${max}`;
      rootRef.current?.classList.toggle('hud-low-pulse', frac <= LOW && frac > 0);
    };
    tick();
    return () => { cancelAnimationFrame(raf); clearTimeout(trailTimer); };
  }, [visible]);

  if (!visible || !present) return null;

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[360px] max-w-[calc(100%-2rem)] pointer-events-none hud-root">
      <div className="flex items-end justify-between mb-1 px-0.5">
        <span className="hud-label !text-teal-300/90">{TYPE_LABEL[type] ?? type}</span>
        <span ref={textRef} className="hud-value text-xs" />
      </div>
      <div ref={rootRef} className="relative h-3.5 bg-black/70 border border-white/15 skew-x-[-12deg] overflow-hidden"
        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
        <div ref={trailRef} className="absolute inset-y-0 left-0 bg-white/85 transition-[width] duration-500 ease-out" style={{ width: '100%' }} />
        <div ref={fillRef} className="absolute inset-y-0 left-0 transition-[width] duration-100" style={{ width: '100%' }} />
        <div className="absolute inset-0 hud-segments" />
        <div className="absolute inset-x-0 top-0 h-1/2 bg-white/10" />
      </div>
    </div>
  );
}
