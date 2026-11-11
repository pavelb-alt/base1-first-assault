import { useRef, useEffect } from 'react';
import { combat } from '@/game/3d/combat';
import { gameState } from '@/game/3d/world';
import { MAP, BASES, FRONT, PERFORMANCE } from '@/game/config';

const SIZE = 160; // px
const PADDING = 6;
const INNER = SIZE - PADDING * 2;
const WORLD = MAP.SIZE;
const SCALE = INNER / WORLD;

const COLORS = {
  friendly: '#5eead4', enemy: '#f87171', friendlyBase: '#14b8a6', enemyBase: '#ef4444', you: '#fbbf24',
};

function worldToMini(x, z) {
  // World X → minimap X, world Z → minimap Y (flip Z so north = up)
  return {
    x: PADDING + (x + MAP.HALF) * SCALE,
    y: PADDING + (z + MAP.HALF) * SCALE,
  };
}

export function Minimap() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let lastDraw = -Infinity;

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (gameState.paused || now - lastDraw < 1000 / PERFORMANCE.minimapHz) return;
      lastDraw = now;

      ctx.clearRect(0, 0, SIZE, SIZE);

      // Background
      ctx.fillStyle = 'rgba(12, 16, 16, 0.82)';
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Grid
      ctx.strokeStyle = 'rgba(94, 234, 212, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        const g = PADDING + (INNER / 4) * i;
        ctx.moveTo(g, PADDING); ctx.lineTo(g, SIZE - PADDING);
        ctx.moveTo(PADDING, g); ctx.lineTo(SIZE - PADDING, g);
      }
      ctx.stroke();

      // Trench rows
      ctx.strokeStyle = 'rgba(180, 150, 100, 0.55)';
      ctx.lineWidth = 1;
      for (const z of FRONT.rows) {
        const p = worldToMini(0, z);
        ctx.beginPath();
        let left=-MAP.HALF;
        for(const crossing of FRONT.crossings) {
          ctx.moveTo(worldToMini(left,z).x,p.y);
          ctx.lineTo(worldToMini(crossing-FRONT.crossingHalfWidth,z).x,p.y);
          left=crossing+FRONT.crossingHalfWidth;
        }
        ctx.moveTo(worldToMini(left,z).x,p.y);
        ctx.lineTo(SIZE-PADDING,p.y);
        ctx.stroke();
      }

      // Friendly base
      const fb = worldToMini(BASES.friendly.position[0], BASES.friendly.position[2]);
      ctx.strokeStyle = COLORS.friendlyBase;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fb.x - 5, fb.y - 5, 10, 10);
      ctx.fillStyle = 'rgba(20, 184, 166, 0.35)';
      ctx.fillRect(fb.x - 5, fb.y - 5, 10, 10);

      // Enemy base
      const eb = worldToMini(BASES.enemy.position[0], BASES.enemy.position[2]);
      ctx.strokeStyle = COLORS.enemyBase;
      ctx.strokeRect(eb.x - 5, eb.y - 5, 10, 10);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.fillRect(eb.x - 5, eb.y - 5, 10, 10);

      // Units
      for (const u of combat.units) {
        if (!u.alive || !u.bodyRef?.current) continue;
        const p = u.bodyRef.current.translation();
        const m = worldToMini(p.x, p.z);
        ctx.fillStyle = u.team === 'friendly' ? COLORS.friendly : COLORS.enemy;
        const r = u.type === 'trilobite' || u.type === 'tank' || u.type === 'artillery' ? 3 : 2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Possessed unit highlight
      if (gameState.possessedSoldierId) {
        const u = combat.units.find(u => u.id === gameState.possessedSoldierId);
        if (u?.alive && u.bodyRef?.current) {
          const p = u.bodyRef.current.translation();
          const m = worldToMini(p.x, p.z);
          ctx.strokeStyle = COLORS.you;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 4.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const legend = [
    ['Friendly', COLORS.friendly, 'dot'], ['Hostile', COLORS.enemy, 'dot'], ['You', COLORS.you, 'ring'],
  ];

  return (
    <div className="absolute top-[60px] right-4 hud-root pointer-events-none select-none">
      <div className="hud-panel p-1.5">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="hud-label !text-[9px]">Tactical Map</span>
          <span className="hud-label !text-[9px] text-amber-400/90 flex items-center gap-1">
            <svg width="8" height="9" viewBox="0 0 8 9" aria-hidden="true"><path d="M4 0 L8 9 L4 6.5 L0 9 Z" fill="#fbbf24" /></svg>N
          </span>
        </div>
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="block border border-white/10"
            style={{ width: SIZE, height: SIZE }}
          />
          {/* Corner ticks */}
          <span className="absolute top-0 left-0 w-2 h-2 border-t border-l border-amber-400/70" />
          <span className="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-400/70" />
          <span className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-400/70" />
          <span className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-400/70" />
        </div>
        <div className="flex items-center justify-between gap-2 px-1 pt-1.5">
          {legend.map(([label, color, shape]) => (
            <span key={label} className="flex items-center gap-1 text-[10px] font-display font-bold tracking-wider uppercase text-stone-400">
              <span className="inline-block w-2 h-2 rounded-full"
                style={shape === 'ring' ? { border: `1.5px solid ${color}` } : { background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
