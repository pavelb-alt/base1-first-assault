// Centre-lower kill-streak callouts: DOUBLE / TRIPLE / MULTI KILL for player kills
// chained within 3s, plus streak milestones (missionStats.killStreak 5/10/20).
// Imperative text + Web Animations; no React state.
import { useEffect, useRef } from 'react';
import { gameEvents } from '@/game/gameEvents';
import { missionStats } from '@/game/progression';
import { COLORS } from '@/components/combat/labels';

const CHAIN_WINDOW = 3000; // ms
const CHAIN_TITLES = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL' };
const MILESTONES = { 5: ['KILLING SPREE', '5 KILL STREAK'], 10: ['UNSTOPPABLE', '10 KILL STREAK'], 20: ['LEGENDARY', '20 KILL STREAK'] };

export function StreakCallout() {
  const boxRef = useRef(null), titleRef = useRef(null), subRef = useRef(null), barRef = useRef(null);

  useEffect(() => {
    let chain = 0, lastKill = -Infinity, anim = null, barAnim = null;

    const show = (title, sub, color, big) => {
      const box = boxRef.current, t = titleRef.current, s = subRef.current, bar = barRef.current;
      if (!box || !t || !s) return;
      t.textContent = title;
      t.style.color = color;
      t.style.fontSize = big ? '44px' : '34px';
      s.textContent = sub;
      s.style.display = sub ? '' : 'none';
      if (bar) bar.style.background = `linear-gradient(90deg, transparent, ${color}, transparent)`;
      anim?.cancel(); barAnim?.cancel();
      if (!box.animate) { box.style.opacity = '1'; setTimeout(() => { box.style.opacity = '0'; }, 1500); return; }
      anim = box.animate([
        { opacity: 0, transform: 'translateX(-50%) scale(1.9)', filter: 'blur(6px)' },
        { opacity: 1, transform: 'translateX(-50%) scale(0.94)', filter: 'blur(0px)', offset: 0.1 },
        { opacity: 1, transform: 'translateX(-50%) scale(1.03)', offset: 0.17 },
        { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.24 },
        { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.8 },
        { opacity: 0, transform: 'translateX(-50%) scale(0.96) translateY(-8px)' },
      ], { duration: big ? 2100 : 1600, easing: 'ease-out', fill: 'forwards' });
      if (bar) barAnim = bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)', offset: 0.25 }, { transform: 'scaleX(1)' }],
        { duration: big ? 2100 : 1600, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' });
    };

    const onKill = e => {
      if (!e.player || e.targetTeam !== 'enemy') return;
      const now = performance.now();
      chain = now - lastKill <= CHAIN_WINDOW ? chain + 1 : 1;
      lastKill = now;
      const streak = missionStats.killStreak;
      const milestone = MILESTONES[streak];
      if (milestone) show(milestone[0], chain >= 2 ? `${CHAIN_TITLES[chain] ?? 'MULTI KILL'} · ${milestone[1]}` : milestone[1], COLORS.accent, true);
      else if (chain >= 2) show(CHAIN_TITLES[chain] ?? 'MULTI KILL', chain > 3 ? `×${chain}` : '', chain >= 3 ? COLORS.accent : COLORS.white, false);
    };
    const onDamage = e => { if (e.playerTarget && e.killed) chain = 0; };
    const offs = [gameEvents.on('kill', onKill), gameEvents.on('damage', onDamage)];
    return () => { for (const off of offs) off(); anim?.cancel(); barAnim?.cancel(); };
  }, []);

  return (
    <div ref={boxRef} className="absolute left-1/2 top-[66%] flex flex-col items-center pointer-events-none select-none whitespace-nowrap"
      style={{ opacity: 0, transform: 'translateX(-50%)', willChange: 'transform, opacity' }} aria-live="polite">
      <div ref={titleRef} className="hud-title leading-none" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', letterSpacing: '0.06em',
        textShadow: '0 0 18px rgba(245,158,11,0.45), 0 2px 0 rgba(0,0,0,0.9), 0 3px 10px rgba(0,0,0,0.7)' }} />
      <div ref={barRef} className="mt-1.5 h-[2px] w-56" style={{ transformOrigin: '50% 50%' }} />
      <div ref={subRef} className="hud-label mt-1.5" style={{ color: 'rgba(250,250,249,0.85)', letterSpacing: '0.3em', textShadow: '0 1px 3px #000' }} />
    </div>
  );
}
