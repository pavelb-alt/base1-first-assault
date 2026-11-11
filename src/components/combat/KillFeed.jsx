// Top-right kill feed. Imperative DOM (React never re-renders per kill):
//  "[YOU] RIFLE ▸ Trilobite"   player kills (repeat kills of the same type stack ×N)
//  "ALLIES ▸ Trilobite"         notable kills by friendly forces
//  "Tank ▸ LOST"                notable friendly losses
import { useEffect, useRef } from 'react';
import { gameEvents } from '@/game/gameEvents';
import { controlledKind, controlledEntry } from '@/game/3d/feedback/controlled';
import { NOTABLE_ENEMIES, NOTABLE_FRIENDLY, WEAPON_TAGS, COLORS, unitName } from '@/components/combat/labels';

const MAX_ENTRIES = 5;
const LIFETIME = 4800; // ms
const STACK_WINDOW = 1600; // ms

function span(text, style) {
  const el = document.createElement('span');
  el.textContent = text;
  Object.assign(el.style, style);
  return el;
}

export function KillFeed() {
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const entries = []; // { el, key, count, countEl, born, timer }

    const remove = entry => {
      const i = entries.indexOf(entry);
      if (i >= 0) entries.splice(i, 1);
      clearTimeout(entry.timer);
      const anim = entry.el.animate?.([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(24px)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
      if (anim) anim.onfinish = () => entry.el.remove(); else entry.el.remove();
    };
    const schedule = entry => {
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => remove(entry), LIFETIME);
    };

    const push = (key, build, accent) => {
      const now = performance.now();
      const top = entries[0];
      if (top && top.key === key && now - top.born < STACK_WINDOW) {
        top.count++; top.born = now;
        top.countEl.textContent = `×${top.count}`;
        top.countEl.style.display = '';
        top.el.animate?.([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' });
        schedule(top);
        return;
      }
      const el = document.createElement('div');
      el.className = 'hud-panel flex items-center gap-2 px-3 py-1 text-[13px] leading-5 whitespace-nowrap';
      el.style.borderRight = `2px solid ${accent}`;
      el.style.fontFamily = 'var(--font-body)';
      el.style.fontWeight = '600';
      build(el);
      const countEl = span('×1', { display: 'none', fontFamily: 'var(--font-display)', fontWeight: '800', color: COLORS.accentSoft, fontSize: '12px' });
      el.appendChild(countEl);
      list.prepend(el);
      el.animate?.([{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
      const entry = { el, key, count: 1, countEl, born: now, timer: 0 };
      entries.unshift(entry);
      schedule(entry);
      while (entries.length > MAX_ENTRIES) remove(entries[entries.length - 1]);
    };

    const onKill = e => {
      if (e.player && e.targetTeam === 'enemy') {
        const kind = controlledKind() ?? 'soldier';
        const tower = kind === 'tower' ? controlledEntry()?.type : null;
        const tag = tower ? `${tower.toUpperCase()} TURRET` : WEAPON_TAGS[kind] ?? 'RIFLE';
        push(`you:${e.targetType}`, el => {
          el.appendChild(span('YOU', { fontFamily: 'var(--font-display)', fontWeight: '800', letterSpacing: '0.12em', color: '#1c1917', background: COLORS.accent, padding: '0 5px', borderRadius: '2px', fontSize: '11px' }));
          el.appendChild(span(tag, { fontFamily: 'var(--font-display)', fontSize: '10px', letterSpacing: '0.18em', color: 'rgba(231,229,228,0.55)' }));
          el.appendChild(span('▸', { color: COLORS.accent }));
          el.appendChild(span(unitName(e.targetType), { color: COLORS.enemy }));
        }, COLORS.accent);
      } else if (e.team === 'friendly' && e.targetTeam === 'enemy' && NOTABLE_ENEMIES.has(e.targetType)) {
        push(`ally:${e.targetType}`, el => {
          el.appendChild(span('ALLIES', { fontFamily: 'var(--font-display)', fontWeight: '800', letterSpacing: '0.12em', color: COLORS.friendly, fontSize: '11px' }));
          el.appendChild(span('▸', { color: COLORS.friendly }));
          el.appendChild(span(unitName(e.targetType), { color: COLORS.enemy }));
        }, COLORS.friendly);
      } else if (e.targetTeam === 'friendly' && NOTABLE_FRIENDLY.has(e.targetType)) {
        push(`lost:${e.targetType}`, el => {
          el.appendChild(span(unitName(e.targetType), { color: COLORS.friendly }));
          el.appendChild(span('▸', { color: COLORS.enemy }));
          el.appendChild(span('LOST', { fontFamily: 'var(--font-display)', fontWeight: '800', letterSpacing: '0.14em', color: COLORS.enemy, fontSize: '11px' }));
        }, COLORS.enemy);
      }
    };
    const off = gameEvents.on('kill', onKill);
    return () => {
      off();
      for (const entry of entries) clearTimeout(entry.timer);
      entries.length = 0;
      list.replaceChildren();
    };
  }, []);

  return <div ref={listRef} className="absolute right-4 top-16 flex flex-col items-end gap-1 pointer-events-none max-w-[calc(100%-2rem)]" aria-live="polite" />;
}
