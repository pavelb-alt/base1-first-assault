// Dynamic reticle for third-person control. One requestAnimationFrame loop drives
// every moving part through refs (bloom, ADS tighten, reload ring, hit markers,
// enemy-under-crosshair tint). React only re-renders when the reticle TYPE or the
// pointer-lock state changes — never per shot.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { gameEvents } from '@/game/gameEvents';
import { gameState } from '@/game/3d/world';
import { input } from '@/game/3d/input';
import { combat } from '@/game/3d/combat';
import { trace } from '@/game/3d/ballistics';
import { AIM } from '@/game/3d/weapons';
import { ARTILLERY, TOWER_DEFENSE } from '@/game/config';
import { cameraView } from '@/game/3d/feedback/cameraFeedback';
import { controlledEntry, controlledKind } from '@/game/3d/feedback/controlled';

const WHITE = '#f8fafc', ENEMY = '#f87171', AMBER = '#f59e0b', FROST = '#7dd3fc';
const SHADOW = 'drop-shadow(0 0 1px rgba(0,0,0,0.95)) drop-shadow(0 1px 2px rgba(0,0,0,0.6))';
// Per-shot bloom (0..1 scale) and the pixel spread it maps to, per reticle.
const BLOOM = { soldier: 0.16, tank: 0.9, artillery: 0.7, tower: 0.12 };
const SPREAD = { soldier: [7, 18], tower: [10, 12] }; // [base gap px, extra gap at full bloom]

const _center = new THREE.Vector2(0, 0);
const _ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _probeShooter = { team: 'friendly', bodyRef: { current: null } };

function towerType() {
  const e = controlledEntry();
  return gameState.controlledStation?.type === 'tower' ? e?.type ?? 'mg' : null;
}

// --- Reticle shapes -----------------------------------------------------------
function SoldierReticle({ arms, dot }) {
  return <>
    {[0, 1, 2, 3].map(i => (
      <span key={i} ref={el => { arms.current[i] = el; }} className="absolute left-1/2 top-1/2 rounded-[1px]"
        style={{ width: i < 2 ? 8 : 2, height: i < 2 ? 2 : 8, background: 'currentColor', willChange: 'transform' }} />
    ))}
    <span ref={dot} className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'currentColor' }} />
  </>;
}

function TowerReticle({ arms, dot, variant }) {
  // Four corner brackets that spread with bloom; cannon gets a centre ring.
  const corner = (i) => {
    const sx = i % 2 === 0 ? -1 : 1, sy = i < 2 ? -1 : 1;
    return (
      <span key={i} ref={el => { arms.current[i] = el; }} className="absolute left-1/2 top-1/2" style={{ width: 9, height: 9, willChange: 'transform',
        borderColor: 'currentColor', borderStyle: 'solid', borderWidth: 0,
        [sy < 0 ? 'borderTopWidth' : 'borderBottomWidth']: 2, [sx < 0 ? 'borderLeftWidth' : 'borderRightWidth']: 2 }} />
    );
  };
  return <>
    {[0, 1, 2, 3].map(corner)}
    {variant === 'cannon'
      ? <span ref={dot} className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ borderColor: 'currentColor' }} />
      : <span ref={dot} className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'currentColor' }} />}
  </>;
}

const RING_R = 40, RING_C = 2 * Math.PI * RING_R;
function TankReticle({ scaleRef, reloadRef }) {
  return (
    <svg width="132" height="132" viewBox="-66 -66 132 132" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible">
      <g ref={scaleRef} fill="none" stroke="currentColor" strokeWidth="1.6">
        {/* Segmented outer ring */}
        <circle r="32" strokeDasharray="40.3 9.9" strokeDashoffset="20" opacity="0.9" />
        <line x1="-52" y1="0" x2="-36" y2="0" /><line x1="36" y1="0" x2="52" y2="0" />
        <line x1="0" y1="-52" x2="0" y2="-38" />
      </g>
      {/* Chevron + stadia range ticks below centre */}
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <polyline points="-6,6 0,0 6,6" />
        <line x1="-10" y1="14" x2="10" y2="14" opacity="0.85" />
        <line x1="-7" y1="21" x2="7" y2="21" opacity="0.7" />
        <line x1="-4.5" y1="27" x2="4.5" y2="27" opacity="0.55" />
        <line x1="-2.5" y1="32" x2="2.5" y2="32" opacity="0.4" />
      </g>
      <g fontFamily="var(--font-mono)" fontSize="6" fill="currentColor" opacity="0.6">
        <text x="12" y="16">4</text><text x="9" y="23">8</text><text x="7" y="29">12</text>
      </g>
      {/* Reload ring */}
      <circle r={RING_R} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2.5" />
      <circle ref={reloadRef} r={RING_R} fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={RING_C} strokeDashoffset={RING_C} transform="rotate(-90)" />
    </svg>
  );
}

function ArtilleryReticle({ scaleRef, reloadRef, rangeRef }) {
  // Mortar arc: a ballistic curve with elevation ticks, diamond aim point.
  const ticks = [];
  for (let i = -4; i <= 4; i++) {
    const a = (i / 4) * 0.9; // radians along the arc
    const x = Math.sin(a) * 46, y = -Math.cos(a) * 46 + 22;
    const len = i % 2 === 0 ? 6 : 3.5;
    ticks.push(<line key={i} x1={x} y1={y} x2={x - Math.sin(a) * len} y2={y + Math.cos(a) * len} />);
  }
  return (
    <svg width="150" height="120" viewBox="-75 -60 150 120" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible">
      <g ref={scaleRef} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M -36.1 -6.6 A 46 46 0 0 1 36.1 -6.6" opacity="0.85" />
        {ticks}
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <polygon points="0,-6 6,0 0,6 -6,0" />
        <line x1="-20" y1="0" x2="-10" y2="0" /><line x1="10" y1="0" x2="20" y2="0" />
        <line x1="0" y1="10" x2="0" y2="18" opacity="0.7" />
      </g>
      <line x1="-30" y1="34" x2="30" y2="34" stroke="rgba(0,0,0,0.4)" strokeWidth="3" strokeLinecap="round" />
      <line ref={reloadRef} x1="-30" y1="34" x2="30" y2="34" stroke={AMBER} strokeWidth="3" strokeLinecap="round" strokeDasharray="60" strokeDashoffset="60" />
      <text ref={rangeRef} x="0" y="48" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="700" fontSize="9" letterSpacing="1.5" fill="currentColor">RNG —</text>
    </svg>
  );
}

function HitMarker({ markerRef }) {
  return (
    <div ref={markerRef} className="absolute left-1/2 top-1/2 h-0 w-0" style={{ opacity: 0, willChange: 'transform, opacity' }}>
      {[45, 135, 225, 315].map(r => (
        <span key={r} className="absolute left-0 top-0 h-[2px] w-[9px] rounded-full"
          style={{ background: 'currentColor', transform: `rotate(${r}deg) translateX(7px) translateY(-1px)`, transformOrigin: '0 1px' }} />
      ))}
    </div>
  );
}

export default function AimOverlay() {
  const [locked, setLocked] = useState(false);
  const [kind, setKind] = useState(() => controlledKind() ?? 'soldier');
  const [variant, setVariant] = useState(() => towerType());
  const rootRef = useRef(null), dotRef = useRef(null), markerRef = useRef(null);
  const armsRef = useRef([]);
  const scaleRef = useRef(null), reloadRef = useRef(null), rangeRef = useRef(null);
  const fx = useRef({ bloom: 0, hit: 0, hitKill: false, hitDur: 0.2, ads: 0, enemy: false, probe: 0, color: '' });
  const kindRef = useRef(kind);
  const variantRef = useRef(variant);

  useEffect(() => {
    const update = () => setLocked(!!document.pointerLockElement);
    update(); document.addEventListener('pointerlockchange', update);
    return () => document.removeEventListener('pointerlockchange', update);
  }, []);

  useEffect(() => {
    const f = fx.current;
    const onShot = e => { if (e.player) f.bloom = Math.min(1, f.bloom + (BLOOM[kindRef.current] ?? 0.15)); };
    const onArty = e => { if (e.player) f.bloom = Math.min(1, f.bloom + BLOOM.artillery); };
    const onDamage = e => {
      if (!e.player || e.targetTeam === 'friendly') return;
      if (e.killed) { f.hit = 1; f.hitKill = true; f.hitDur = 0.45; }
      else if (!f.hitKill || f.hit < 0.35) { f.hit = 1; f.hitKill = false; f.hitDur = 0.2; }
    };
    const offs = [gameEvents.on('shot', onShot), gameEvents.on('artillery-fire', onArty), gameEvents.on('damage', onDamage)];

    let raf = 0, last = performance.now();
    const tick = now => {
      raf = requestAnimationFrame(tick);
      const dt = gameState.paused ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      const k = controlledKind() ?? kindRef.current;
      if (k !== kindRef.current) { kindRef.current = k; setKind(k); }
      const tv = towerType();
      if (tv !== variantRef.current) { variantRef.current = tv; setVariant(tv); }
      const variant = variantRef.current;

      // Bloom recovers; ADS eases in.
      f.bloom = Math.max(0, f.bloom - dt * (k === 'soldier' ? 2.6 : 1.8));
      f.ads += ((input.rightMouseDown ? 1 : 0) - f.ads) * Math.min(1, dt * 12);
      const moving = k === 'soldier' && (input.keys.KeyW || input.keys.KeyA || input.keys.KeyS || input.keys.KeyD);
      const spreadMul = (1 - 0.45 * f.ads) * (moving ? 1.25 : 1);

      // Enemy under crosshair (cheap: one physics ray every 4th frame).
      if (++f.probe % 4 === 0) {
        const cam = cameraView.camera;
        f.enemy = false;
        if (cam && combat.physics) {
          _ray.setFromCamera(_center, cam);
          _origin.copy(_ray.ray.origin); _dir.copy(_ray.ray.direction);
          const hit = trace(_origin, _dir, AIM.distance, _probeShooter);
          f.enemy = !!(hit?.unit && hit.unit.team === 'enemy' && hit.unit.alive);
        }
      }
      const color = f.enemy ? ENEMY : variant === 'frost' && k === 'tower' ? FROST : WHITE;
      if (rootRef.current && color !== f.color) { f.color = color; rootRef.current.style.color = color; }

      // Soldier / tower arms spread.
      const sp = SPREAD[k];
      if (sp) {
        const gap = (sp[0] + sp[1] * f.bloom) * spreadMul;
        const a = armsRef.current;
        if (k === 'soldier') {
          if (a[0]) a[0].style.transform = `translate(${-gap - 8}px,-1px)`;
          if (a[1]) a[1].style.transform = `translate(${gap}px,-1px)`;
          if (a[2]) a[2].style.transform = `translate(-1px,${-gap - 8}px)`;
          if (a[3]) a[3].style.transform = `translate(-1px,${gap}px)`;
        } else {
          for (let i = 0; i < 4; i++) {
            const el = a[i]; if (!el) continue;
            const sx = i % 2 === 0 ? -1 : 1, sy = i < 2 ? -1 : 1;
            el.style.transform = `translate(${sx < 0 ? -gap - 9 : gap}px,${sy < 0 ? -gap - 9 : gap}px)`;
          }
        }
      }
      if (dotRef.current) dotRef.current.style.opacity = String(1 - 0.5 * f.bloom);
      if (scaleRef.current) scaleRef.current.setAttribute('transform', `scale(${((1 + 0.22 * f.bloom) * (1 - 0.12 * f.ads)).toFixed(4)})`);

      // Station reload + artillery range readout.
      if (k === 'tank' || k === 'artillery' || k === 'tower') {
        const e = controlledEntry();
        const max = k === 'tower' ? TOWER_DEFENSE.towers[e?.type]?.cooldown : e?.profile?.cooldown;
        const frac = e && max > 0 ? Math.max(0, Math.min(1, (e.cooldown ?? 0) / max)) : 0;
        if (reloadRef.current) {
          const len = k === 'tank' ? RING_C : 60;
          reloadRef.current.style.strokeDashoffset = String(len * frac);
          reloadRef.current.style.opacity = frac > 0.001 ? '1' : '0';
        }
        if (k === 'artillery' && rangeRef.current && e) {
          const r = e.aimRange ?? 0;
          const blocked = r < ARTILLERY.minRange;
          const label = blocked ? `MIN RANGE ${ARTILLERY.minRange}M` : `RNG ${Math.round(r)}M`;
          if (rangeRef.current.textContent !== label) rangeRef.current.textContent = label;
          rangeRef.current.style.fill = blocked ? ENEMY : 'currentColor';
        }
      }

      // Hit marker: punch in, fade out.
      const m = markerRef.current;
      if (m) {
        if (f.hit > 0) {
          f.hit = Math.max(0, f.hit - dt / f.hitDur);
          const t = f.hit;
          const s = (f.hitKill ? 1.35 : 1) * (1 + 0.45 * t * t);
          m.style.opacity = String(Math.min(1, t * 1.6));
          m.style.transform = `scale(${s})`;
          m.style.color = f.hitKill ? ENEMY : WHITE;
          if (t === 0) f.hitKill = false;
        } else if (m.style.opacity !== '0') m.style.opacity = '0';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); for (const off of offs) off(); };
  }, []);

  return <>
    <div ref={rootRef} aria-label="Aim crosshair" className="absolute left-1/2 top-1/2 h-0 w-0 pointer-events-none" style={{ filter: SHADOW, color: WHITE }}>
      {kind === 'soldier' && <SoldierReticle key="soldier" arms={armsRef} dot={dotRef} />}
      {kind === 'tower' && <TowerReticle key={`tower-${variant}`} arms={armsRef} dot={dotRef} variant={variant} />}
      {kind === 'tank' && <TankReticle key="tank" scaleRef={scaleRef} reloadRef={reloadRef} />}
      {kind === 'artillery' && <ArtilleryReticle key="artillery" scaleRef={scaleRef} reloadRef={reloadRef} rangeRef={rangeRef} />}
      <HitMarker markerRef={markerRef} />
    </div>
    {!locked && (
      <div className="hud-panel hud-panel-accent absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 text-sm text-stone-200 whitespace-nowrap max-w-[calc(100%-2rem)] overflow-hidden" style={{ fontFamily: 'var(--font-body)' }}>
        <span className="hud-label" style={{ color: AMBER }}>Click to capture mouse</span>
        <span className="h-3 w-px bg-white/15" />
        <span className="flex items-center gap-1.5"><span className="hud-key">LMB</span> Fire</span>
        <span className="flex items-center gap-1.5"><span className="hud-key">RMB</span> Aim</span>
      </div>
    )}
  </>;
}
