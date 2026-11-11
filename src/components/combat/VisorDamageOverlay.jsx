// Sci-fi "visor damage" overlay for the controlled unit:
//  - red edge vignette + heartbeat pulse below 30% health
//  - short sharp edge flash on hits (scaled by damage), stronger on heavy hits
//  - faint scanlines + corner fractures + CRITICAL label when critical
// Everything is driven by refs from the shared ticker; no React state.
import { useEffect, useRef } from 'react';
import { gameEvents } from '@/game/gameEvents';
import { gameState } from '@/game/3d/world';
import { controlledEntry, controlledHealthRatio } from '@/game/3d/feedback/controlled';
import { addTicker } from '@/components/combat/ticker';

const CRITICAL = 0.3;

function Fracture({ className, flip }) {
  return (
    <svg viewBox="0 0 160 120" className={`absolute w-[22vmin] h-[16vmin] ${className}`} style={{ transform: flip }} fill="none" strokeLinecap="round">
      <g stroke="rgba(254,202,202,0.55)" strokeWidth="1.2">
        <path d="M0 8 L34 22 L52 18 L78 40 L96 38 L120 62" />
        <path d="M34 22 L40 46 L62 58" />
        <path d="M78 40 L74 66 L92 84" />
        <path d="M0 40 L22 44 L40 46" />
      </g>
      <g stroke="rgba(248,113,113,0.35)" strokeWidth="3">
        <path d="M0 8 L34 22 L52 18 L78 40" />
      </g>
    </svg>
  );
}

export function VisorDamageOverlay({ modeRef }) {
  const vignetteRef = useRef(null), flashRef = useRef(null), critRef = useRef(null), labelRef = useRef(null);

  useEffect(() => {
    const st = { flash: 0, pulse: 0, crit: 0, vignette: 0, label: '' };
    const onDamage = e => {
      if (!e.playerTarget) return;
      const u = controlledEntry();
      const max = u?.maxHealth > 0 ? u.maxHealth : 120;
      st.flash = Math.min(1, st.flash + 0.28 + (e.amount / max) * 3.2 + (e.killed ? 0.6 : 0));
    };
    const off = gameEvents.on('damage', onDamage);

    const tick = (dt, now) => {
      const active = modeRef.current === 'third_person' && !gameState.transitioning;
      const ratio = active ? controlledHealthRatio() : 1;
      const critTarget = active && ratio < CRITICAL ? 1 - ratio / CRITICAL : 0;
      st.crit += (critTarget - st.crit) * Math.min(1, dt * 4);
      st.flash = Math.max(0, st.flash - dt * 2.6);
      if (!active) st.flash = 0;
      // Heartbeat: rate climbs as health drops (≈ 70 → 140 bpm), double-thump shape.
      if (st.crit > 0.01) {
        const bpm = 70 + 70 * st.crit;
        const beat = ((now / 1000) * bpm / 60) % 1;
        const thump = Math.exp(-((beat - 0.05) ** 2) / 0.004) + 0.6 * Math.exp(-((beat - 0.28) ** 2) / 0.004);
        st.pulse = thump;
      } else st.pulse = 0;

      const vig = Math.min(1, st.crit * (0.55 + 0.3 * st.pulse));
      if (vignetteRef.current && Math.abs(vig - st.vignette) > 0.003) {
        st.vignette = vig;
        vignetteRef.current.style.opacity = vig.toFixed(3);
      }
      if (flashRef.current) {
        const f = Math.min(1, st.flash);
        const cur = flashRef.current.style.opacity;
        const next = f.toFixed(3);
        if (cur !== next) flashRef.current.style.opacity = next;
      }
      if (critRef.current) critRef.current.style.opacity = (st.crit * 0.9).toFixed(3);
      if (labelRef.current) {
        const show = st.crit > 0.15;
        const blink = show && Math.floor(now / 420) % 2 === 0;
        labelRef.current.style.opacity = show ? (blink ? '1' : '0.45') : '0';
        const text = gameState.controlledStation && gameState.controlledStation.type !== 'soldier' ? 'HULL INTEGRITY CRITICAL' : 'VITALS CRITICAL';
        if (show && text !== st.label) { st.label = text; labelRef.current.textContent = text; }
      }
    };
    const offTick = addTicker(tick);
    return () => { off(); offTick(); };
  }, [modeRef]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {/* Persistent low-health vignette */}
      <div ref={vignetteRef} className="absolute inset-0" style={{ opacity: 0, willChange: 'opacity',
        background: 'radial-gradient(ellipse 75% 70% at 50% 50%, transparent 52%, rgba(185,28,28,0.38) 78%, rgba(127,29,29,0.78) 100%)' }} />
      {/* Hit flash: tight bright edge */}
      <div ref={flashRef} className="absolute inset-0" style={{ opacity: 0, willChange: 'opacity',
        background: 'radial-gradient(ellipse 80% 78% at 50% 50%, transparent 62%, rgba(239,68,68,0.32) 84%, rgba(248,113,113,0.62) 100%)',
        boxShadow: 'inset 0 0 0 2px rgba(254,202,202,0.35)' }} />
      {/* Critical: scanlines + visor fractures */}
      <div ref={critRef} className="absolute inset-0" style={{ opacity: 0, willChange: 'opacity' }}>
        <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(0deg, rgba(248,113,113,0.05) 0px, rgba(248,113,113,0.05) 1px, transparent 1px, transparent 3px)', mixBlendMode: 'screen' }} />
        <Fracture className="left-0 top-0" />
        <Fracture className="right-0 bottom-0" flip="scale(-1,-1)" />
        <Fracture className="right-0 top-0" flip="scale(-1,1)" />
      </div>
      <div ref={labelRef} className="hud-title absolute left-1/2 top-[30%] -translate-x-1/2 text-[13px] tracking-[0.35em] text-red-300 whitespace-nowrap"
        style={{ opacity: 0, textShadow: '0 0 10px rgba(239,68,68,0.8), 0 1px 2px #000' }}>VITALS CRITICAL</div>
    </div>
  );
}
