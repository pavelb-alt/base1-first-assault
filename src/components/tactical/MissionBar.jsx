import { useEffect, useState } from 'react';
import { Coins, FastForward, Shield, Skull, Timer } from 'lucide-react';
import { WAVES, getLevelConfig } from '@/game/config';
import { gameEvents } from '@/game/gameEvents';
import { waveState, bossSnapshot, callWaveEarly } from '@/game/3d/waves';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { battle } from '@/game/3d/battleMetrics';
import { combat } from '@/game/3d/combat';
import { useTicker } from '@/components/tactical/useTicker';

const compLabel = id => WAVES.compositions[id]?.label ?? 'ASSAULT';

// Top-centre mission strip: wave progress, next-wave countdown + CALL EARLY, scrap, base integrity.
export function MissionBar({ level, scrap, onFeedback }) {
  useTicker(200);
  const w = waveState;
  const base = Math.max(0, Math.round(battle.baseHealth.friendly));
  const hostiles = w.finalWaveSpawned ? combat.units.filter(u => u.team === 'enemy' && u.alive).length : 0;
  const bonus = Math.round(Math.min(w.nextWaveIn, w.interval) * WAVES.callEarlyScrapPerSecond * towerDefenseState.difficulty.scrap);
  const canCallEarly = !w.finalWaveSpawned && !w.holding && w.nextWaveIn >= 1 && !battle.gameOver;
  const nextIsBoss = w.nextComposition === 'boss';
  const callEarly = () => {
    const got = callWaveEarly();
    if (got) onFeedback?.(`Wave called early: +${got} scrap`, 'good');
  };
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-3 pointer-events-auto hud-root flex items-stretch gap-px max-w-[calc(100%-2rem)]" data-testid="mission-bar">
      <div className="hud-panel hud-panel-accent px-3 py-1.5 flex flex-col justify-center">
        <div className="hud-label">{getLevelConfig(level).name} · {towerDefenseState.difficulty.label}</div>
        <div className="hud-value text-lg leading-tight">
          WAVE {w.wave}<span className="text-stone-400 text-sm">/{w.maxWaves || '—'}</span>
        </div>
      </div>
      <div className="hud-panel px-3 py-1.5 flex items-center gap-3 min-w-[220px]">
        {w.finalWaveSpawned ? (
          <div className="flex items-center gap-2">
            <Skull size={16} className="text-red-400" />
            <div>
              <div className="hud-label text-red-300">Final wave</div>
              <div className="hud-value text-sm">Eliminate all hostiles · {hostiles} left</div>
            </div>
          </div>
        ) : (
          <>
            <Timer size={16} className={nextIsBoss ? 'text-red-400' : 'text-amber-400'} />
            <div className="flex-1">
              <div className="hud-label">{w.holding ? 'Field saturated' : nextIsBoss ? 'Boss wave in' : 'Next wave in'}</div>
              <div className="hud-value text-sm">
                {w.holding ? 'Holding' : `${Math.ceil(w.nextWaveIn)}s`}
                <span className={`ml-2 text-[11px] tracking-widest ${nextIsBoss ? 'text-red-300' : 'text-stone-400'}`}>{compLabel(w.nextComposition)}</span>
              </div>
            </div>
            <button className="hud-btn px-2 py-1 text-[10px] flex items-center gap-1" disabled={!canCallEarly} onClick={callEarly}
              title="Call the next wave now for bonus scrap (N)" data-testid="call-wave-early">
              <FastForward size={12} /> Call early <span className="text-amber-300">+{bonus}</span>
            </button>
          </>
        )}
      </div>
      <div className="hud-panel px-3 py-1.5 flex items-center gap-2">
        <Coins size={16} className="text-amber-400" />
        <div>
          <div className="hud-label">Scrap</div>
          <div className="hud-value text-lg leading-tight text-amber-200" data-testid="scrap">{scrap}</div>
        </div>
      </div>
      <div className="hud-panel px-3 py-1.5 flex items-center gap-2 w-36">
        <Shield size={16} className={base > 50 ? 'text-teal-300' : base > 25 ? 'text-amber-400' : 'text-red-400'} />
        <div className="flex-1">
          <div className="hud-label">Base</div>
          <div className="h-1.5 mt-1 bg-white/10 rounded-sm overflow-hidden">
            <div className={`h-full transition-all ${base > 50 ? 'bg-teal-300' : base > 25 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${base}%` }} />
          </div>
          <div className="hud-value text-[11px] mt-0.5">{base}%</div>
        </div>
      </div>
    </div>
  );
}

// Boss health bar, shown while an elite boss is on the field.
export function BossBar() {
  useTicker(150);
  const [defeated, setDefeated] = useState(null);
  useEffect(() => {
    let timer = null;
    const off = gameEvents.on('boss-defeated', ({ name }) => {
      setDefeated(name);
      clearTimeout(timer);
      timer = setTimeout(() => setDefeated(null), 3500);
    });
    return () => { off(); clearTimeout(timer); };
  }, []);
  const boss = bossSnapshot();
  if (defeated && !(boss?.alive)) {
    return (
      <div className="absolute left-1/2 -translate-x-1/2 top-[76px] pointer-events-none hud-root">
        <div className="hud-panel px-5 py-2 text-center border-amber-400/60">
          <div className="hud-title text-amber-300 text-sm tracking-[0.3em]">{defeated} destroyed</div>
        </div>
      </div>
    );
  }
  if (!boss || (!boss.alive && !boss.pending)) return null;
  const pct = boss.pending ? 100 : (boss.health / boss.maxHealth) * 100;
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-[76px] w-[min(520px,calc(100%-2rem))] pointer-events-none hud-root" data-testid="boss-bar">
      <div className="flex items-baseline justify-between px-0.5 mb-1">
        <span className="hud-title text-red-300 text-sm tracking-[0.25em] flex items-center gap-2"><Skull size={14} /> {boss.name}</span>
        <span className="hud-label">{boss.final ? 'Final boss' : 'Elite'} · {boss.health.toLocaleString()} / {boss.maxHealth.toLocaleString()}</span>
      </div>
      <div className="h-3 bg-black/70 border border-red-400/50 rounded-sm overflow-hidden">
        <div className="h-full bg-gradient-to-r from-red-700 via-red-500 to-amber-400 transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
