import { useRef, useEffect } from 'react';
import { combat } from '@/game/3d/combat';
import { gameState } from '@/game/3d/world';
import { MAP, BASES, FRONT, PERFORMANCE } from '@/game/config';

const SIZE = 160; // px
const PADDING = 6;
const INNER = SIZE - PADDING * 2;
const WORLD = MAP.SIZE;
const SCALE = INNER / WORLD;

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
      ctx.fillStyle = 'rgba(20, 24, 20, 0.85)';
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Trench rows
      ctx.strokeStyle = 'rgba(120, 100, 70, 0.5)';
      ctx.lineWidth = 1;
      for (const z of FRONT.rows) {
        const p = worldToMini(0, z);
        ctx.beginPath();
        ctx.moveTo(PADDING, p.y);
        ctx.lineTo(SIZE - PADDING, p.y);
        ctx.stroke();
      }

      // Friendly base
      const fb = worldToMini(BASES.friendly.position[0], BASES.friendly.position[2]);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(fb.x - 4, fb.y - 4, 8, 8);

      // Enemy base
      const eb = worldToMini(BASES.enemy.position[0], BASES.enemy.position[2]);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(eb.x - 4, eb.y - 4, 8, 8);

      // Units
      for (const u of combat.units) {
        if (!u.alive || !u.bodyRef?.current) continue;
        const p = u.bodyRef.current.translation();
        const m = worldToMini(p.x, p.z);
        ctx.fillStyle = u.team === 'friendly' ? '#4ade80' : '#f87171';
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
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      className="absolute top-4 right-4 mt-12 rounded-lg border border-white/15 shadow-lg"
      style={{ width: SIZE, height: SIZE }}
    />
  );
}