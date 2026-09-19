import { useState, useEffect, useRef } from 'react';
import { EventBus } from '@/game/EventBus';
import { COMBAT } from '@/game/config';

export function HealthBar() {
  const [visible, setVisible] = useState(false);
  const [health, setHealth] = useState(null);
  const rafRef = useRef();

  useEffect(() => {
    const onMode = (m) => setVisible(m === 'third_person');
    EventBus.on('mode-changed', onMode);
    return () => EventBus.off('mode-changed', onMode);
  }, []);

  useEffect(() => {
    if (!visible) { setHealth(null); return; }
    let mounted = true;
    let last = -1;
    const tick = () => {
      if (!mounted) return;
      const unit = window.game?.getControlledUnit?.();
      const hp = unit?.health ?? null;
      if (hp !== last) { last = hp; setHealth(hp); }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => { mounted = false; cancelAnimationFrame(rafRef.current); };
  }, [visible]);

  if (!visible || health === null) return null;
  const pct = Math.max(0, Math.min(100, (health / COMBAT.maxHealth) * 100));
  const color = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-72 pointer-events-none">
      <div className="flex items-center gap-2">
        <span className="text-white text-xs font-bold tracking-wider w-6">HP</span>
        <div className="flex-1 h-4 rounded-full bg-black/70 border border-white/20 overflow-hidden">
          <div className={`h-full ${color} transition-all duration-150`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-white text-xs font-mono w-12 text-right">{Math.ceil(health)}/{COMBAT.maxHealth}</span>
      </div>
    </div>
  );
}