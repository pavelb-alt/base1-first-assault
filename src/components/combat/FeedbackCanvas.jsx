// Single 2D canvas for all world-anchored / radial combat feedback:
//  - floating damage numbers for the player's hits (merged per target, bigger on kills)
//  - "+N" scrap popups at enemy deaths in strategic view (batched, pooled)
//  - directional damage arcs around screen centre pointing at the attacker
//  - friendly-base-under-attack marker / off-screen arrow
// Fixed-size pools, no per-event allocations, idle frames skip drawing entirely.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { gameEvents } from '@/game/gameEvents';
import { settings } from '@/game/settings';
import { gameState } from '@/game/3d/world';
import { BASES, TOWER_DEFENSE } from '@/game/config';
import { cameraView } from '@/game/3d/feedback/cameraFeedback';
import { addTicker } from '@/components/combat/ticker';
import { COLORS } from '@/components/combat/labels';

const NUMBER_POOL = 40, SCRAP_POOL = 24, ARC_POOL = 8;
const NUMBER_LIFE = 0.9, KILL_NUMBER_LIFE = 1.25, SCRAP_LIFE = 1.4, ARC_LIFE = 1.1, BASE_ALERT_LIFE = 2.8;
const FONT_STACK = '"Oxanium", "Rajdhani", ui-sans-serif, system-ui, sans-serif';

const makePool = (n, extra) => Array.from({ length: n }, () => ({ active: false, age: 0, life: 1, x: 0, y: 0, z: 0, value: 0, ...extra }));
const _v = new THREE.Vector3();
const _screen = { x: 0, y: 0, behind: false, dist: 0 };

function project(cam, x, y, z, w, h, out) {
  _v.set(x, y, z);
  out.dist = _v.distanceTo(cam.position);
  _v.project(cam);
  out.behind = _v.z > 1;
  out.x = (_v.x * 0.5 + 0.5) * w;
  out.y = (-_v.y * 0.5 + 0.5) * h;
  return !out.behind && _v.x >= -1.2 && _v.x <= 1.2 && _v.y >= -1.2 && _v.y <= 1.2;
}

// Reuse the free slot, else the oldest one.
function claim(pool) {
  let oldest = pool[0];
  for (const p of pool) {
    if (!p.active) return p;
    if (p.age / p.life > oldest.age / oldest.life) oldest = p;
  }
  return oldest;
}

export function FeedbackCanvas({ modeRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const numbers = makePool(NUMBER_POOL, { kill: false, pop: 0, drift: 0 });
    const scraps = makePool(SCRAP_POOL, {});
    const arcs = makePool(ARC_POOL, { fromX: 0, fromZ: 0, strength: 0 });
    const base = { active: false, age: 0 };
    let w = 0, h = 0, dpr = 1, dirty = false, driftSeed = 1;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = parent.clientWidth; h = parent.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      dirty = true;
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro && canvas.parentElement) ro.observe(canvas.parentElement);
    else window.addEventListener('resize', resize);

    // --- Event intake --------------------------------------------------------
    const onDamage = e => {
      if (e.playerTarget && modeRef.current === 'third_person') {
        const p = gameState.soldierPosition;
        if (Math.hypot(e.fromX - p.x, e.fromZ - p.z) > 0.5) {
          let slot = null;
          for (const a of arcs) if (a.active && Math.hypot(a.fromX - e.fromX, a.fromZ - e.fromZ) < 4) { slot = a; break; }
          if (!slot) { slot = claim(arcs); slot.strength = 0; }
          slot.active = true; slot.age = 0; slot.life = ARC_LIFE;
          slot.fromX = e.fromX; slot.fromZ = e.fromZ;
          slot.strength = Math.min(1, slot.strength + 0.35 + (e.amount ?? 0) / 40);
        }
      }
      if (!e.player || e.targetTeam === 'friendly' || !settings.get().showDamageNumbers) return;
      // Merge rapid hits on the same target into one climbing number.
      let n = null;
      for (const r of numbers) {
        if (r.active && !r.kill && r.age < 0.35 && Math.abs(r.x - e.x) < 1.6 && Math.abs(r.z - e.z) < 1.6) { n = r; break; }
      }
      if (n) { n.value += e.amount; n.age = Math.min(n.age, 0.06); n.pop = 1; }
      else {
        n = claim(numbers);
        n.active = true; n.age = 0; n.value = e.amount; n.kill = false; n.pop = 1;
        n.x = e.x; n.y = e.y + 0.4; n.z = e.z;
        driftSeed = (driftSeed * 16807) % 2147483647;
        n.drift = ((driftSeed % 1000) / 1000 - 0.5) * 36;
      }
      n.life = NUMBER_LIFE;
      if (e.killed) { n.kill = true; n.life = KILL_NUMBER_LIFE; n.pop = 1.6; }
      dirty = true;
    };
    const onKill = e => {
      if (modeRef.current !== 'strategic' || e.team !== 'friendly' || e.targetTeam !== 'enemy') return;
      const reward = e.scrap ?? TOWER_DEFENSE.scrapRewards?.[e.targetType] ?? 10;
      let s = null;
      for (const r of scraps) if (r.active && r.age < 0.5 && Math.abs(r.x - e.x) < 5 && Math.abs(r.z - e.z) < 5) { s = r; break; }
      if (s) { s.value += reward; s.age = Math.min(s.age, 0.1); }
      else {
        s = claim(scraps);
        s.active = true; s.age = 0; s.life = SCRAP_LIFE; s.value = reward;
        s.x = e.x; s.y = e.y + 1.2; s.z = e.z;
      }
      dirty = true;
    };
    const onBase = e => {
      if (e.team !== 'friendly') return;
      base.active = true; base.age = 0; dirty = true;
    };
    const offs = [gameEvents.on('damage', onDamage), gameEvents.on('kill', onKill), gameEvents.on('base-damage', onBase)];
    const onReset = () => { for (const pool of [numbers, scraps, arcs]) for (const p of pool) p.active = false; base.active = false; dirty = true; };
    const offReset = gameEvents.on('wave-start', e => { if (e.wave <= 1) onReset(); });

    // --- Drawing -------------------------------------------------------------
    const drawNumbers = (cam, dt) => {
      let any = false;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      for (const n of numbers) {
        if (!n.active) continue;
        n.age += dt; n.pop = Math.max(0, n.pop - dt * 7);
        if (n.age >= n.life) { n.active = false; continue; }
        any = true;
        if (!project(cam, n.x, n.y, n.z, w, h, _screen)) continue;
        const t = n.age / n.life;
        const distScale = Math.max(0.7, Math.min(1.15, 16 / Math.max(1, _screen.dist)));
        const size = (n.kill ? 30 : 19) * distScale * (1 + 0.35 * n.pop);
        const ease = 1 - (1 - t) * (1 - t);
        const x = _screen.x + n.drift * ease;
        const y = _screen.y - (n.kill ? 46 : 38) * ease;
        ctx.globalAlpha = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1;
        ctx.font = `${n.kill ? 800 : 700} ${size.toFixed(1)}px ${FONT_STACK}`;
        const label = String(Math.max(1, Math.round(n.value)));
        ctx.lineWidth = n.kill ? 5 : 3.5;
        ctx.strokeStyle = n.kill ? 'rgba(127,29,29,0.95)' : 'rgba(0,0,0,0.85)';
        ctx.strokeText(label, x, y);
        ctx.fillStyle = n.kill ? COLORS.accent : COLORS.white;
        ctx.fillText(label, x, y);
        if (n.kill) {
          ctx.font = `800 ${(size * 0.38).toFixed(1)}px ${FONT_STACK}`;
          ctx.lineWidth = 3; ctx.strokeText('ELIMINATED', x, y + size * 0.72);
          ctx.fillStyle = COLORS.enemy; ctx.fillText('ELIMINATED', x, y + size * 0.72);
        }
      }
      return any;
    };

    const drawScraps = (cam, dt) => {
      let any = false;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const s of scraps) {
        if (!s.active) continue;
        s.age += dt;
        if (s.age >= s.life) { s.active = false; continue; }
        any = true;
        if (!project(cam, s.x, s.y, s.z, w, h, _screen)) continue;
        const t = s.age / s.life;
        const ease = 1 - Math.pow(1 - t, 3);
        const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.55 : 1.15 - Math.min(0.15, (t - 0.12) * 1.5);
        const size = 15 * pop;
        const x = _screen.x, y = _screen.y - 34 * ease;
        ctx.globalAlpha = t > 0.6 ? Math.max(0, 1 - (t - 0.6) / 0.4) : 1;
        const label = `+${s.value}`;
        ctx.font = `800 ${size.toFixed(1)}px ${FONT_STACK}`;
        const tw = ctx.measureText(label).width;
        const r = size * 0.36, cx = x - tw / 2 - r - 3;
        // Scrap glyph: small hex nut.
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + i * Math.PI / 3;
          const px = cx + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = COLORS.accent; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke();
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(label, x - tw / 2, y);
        ctx.fillStyle = COLORS.accentSoft; ctx.fillText(label, x - tw / 2, y);
      }
      return any;
    };

    const drawArcs = (dt) => {
      let any = false;
      const p = gameState.soldierPosition;
      const yaw = cameraView.yaw;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      const cx = w / 2, cyScreen = h / 2;
      const radius = Math.max(70, Math.min(w, h) * 0.16);
      for (const a of arcs) {
        if (!a.active) continue;
        a.age += dt;
        if (a.age >= a.life) { a.active = false; continue; }
        any = true;
        const dx = a.fromX - p.x, dz = a.fromZ - p.z;
        const forward = dx * sy + dz * cy;
        const right = -dx * cy + dz * sy;
        const theta = Math.atan2(right, forward) - Math.PI / 2; // 0 = straight ahead = screen top
        const t = a.age / a.life;
        const alpha = (t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92) * (0.45 + 0.55 * a.strength);
        const span = 0.34 + 0.18 * a.strength;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.lineCap = 'round';
        ctx.lineWidth = 10 + 6 * a.strength;
        ctx.strokeStyle = 'rgba(127,29,29,0.55)';
        ctx.beginPath(); ctx.arc(cx, cyScreen, radius, theta - span, theta + span); ctx.stroke();
        ctx.lineWidth = 4 + 3 * a.strength;
        ctx.strokeStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(cx, cyScreen, radius, theta - span * 0.8, theta + span * 0.8); ctx.stroke();
        // Pointer tip
        const tx = cx + Math.cos(theta) * (radius + 14), ty = cyScreen + Math.sin(theta) * (radius + 14);
        const nx = Math.cos(theta), ny = Math.sin(theta);
        ctx.fillStyle = '#fca5a5';
        ctx.beginPath();
        ctx.moveTo(tx + nx * 9, ty + ny * 9);
        ctx.lineTo(tx - ny * 7, ty + nx * 7);
        ctx.lineTo(tx + ny * 7, ty - nx * 7);
        ctx.closePath(); ctx.fill();
      }
      return any;
    };

    const drawBase = (cam, dt, now) => {
      if (!base.active) return false;
      base.age += dt;
      if (base.age >= BASE_ALERT_LIFE) { base.active = false; return false; }
      const t = base.age / BASE_ALERT_LIFE;
      const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      const pulse = 0.6 + 0.4 * Math.sin(now / 90);
      const bp = BASES.friendly.position;
      const onScreen = project(cam, bp[0], bp[1] + 3, bp[2], w, h, _screen) &&
        _screen.x > 40 && _screen.x < w - 40 && _screen.y > 40 && _screen.y < h - 40;
      ctx.globalAlpha = fade;
      ctx.font = `800 12px ${FONT_STACK}`;
      ctx.textBaseline = 'middle';
      if (onScreen) {
        const r = 22 + 10 * (base.age % 0.7) / 0.7;
        ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(248,113,113,${(0.9 * pulse).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(_screen.x, _screen.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText('BASE UNDER ATTACK', _screen.x, _screen.y - r - 12);
        ctx.fillStyle = COLORS.enemy; ctx.fillText('BASE UNDER ATTACK', _screen.x, _screen.y - r - 12);
        return true;
      }
      // Off-screen: arrow on the screen edge pointing toward the base.
      let dx = _screen.x - w / 2, dy = _screen.y - h / 2;
      if (_screen.behind) { dx = -dx; dy = -dy; }
      if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) dy = 1;
      const margin = 56;
      const sx = (w / 2 - margin) / Math.max(0.001, Math.abs(dx));
      const sy = (h / 2 - margin) / Math.max(0.001, Math.abs(dy));
      const k = Math.min(sx, sy);
      const ax = w / 2 + dx * k, ay = h / 2 + dy * k;
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.fillStyle = `rgba(239,68,68,${(0.75 + 0.25 * pulse).toFixed(3)})`;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -13); ctx.lineTo(-4, 0); ctx.lineTo(-10, 13); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.textAlign = ax > w / 2 ? 'right' : 'left';
      const lx = ax + (ax > w / 2 ? -26 : 26), ly = ay + (ay > h / 2 ? -20 : 20);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText('BASE UNDER ATTACK', lx, ly);
      ctx.fillStyle = COLORS.enemy; ctx.fillText('BASE UNDER ATTACK', lx, ly);
      return true;
    };

    const tick = (dt, now) => {
      if (!dirty) return;
      const cam = cameraView.camera;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!cam || !w || !h) { dirty = false; return; }
      let any = drawNumbers(cam, dt);
      any = drawScraps(cam, dt) || any;
      any = drawArcs(dt) || any;
      any = drawBase(cam, dt, now) || any;
      ctx.globalAlpha = 1;
      // Keep drawing while anything is alive; one final clear pass otherwise.
      dirty = any;
    };
    const offTick = addTicker(tick);

    return () => {
      offTick(); offReset(); for (const off of offs) off();
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
    };
  }, [modeRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />;
}
