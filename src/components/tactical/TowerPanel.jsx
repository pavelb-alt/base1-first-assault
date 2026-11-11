import { ChevronsUp, Coins, X } from 'lucide-react';
import { TOWER_DEFENSE } from '@/game/config';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { useTicker } from '@/components/tactical/useTicker';
import { TOWER_ICONS, TARGETING_LABELS } from '@/components/tactical/icons';

function Stat({ label, value, next, better = 'up' }) {
  const improved = next !== undefined && next !== null && next !== value;
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="hud-label">{label}</span>
      <span className="hud-value text-[13px]">
        {value}
        {improved && <span className={`ml-1.5 text-[11px] ${better === 'up' ? 'text-teal-300' : 'text-teal-300'}`}>→ {next}</span>}
      </span>
    </div>
  );
}
const dps = s => (s.damage / s.cooldown).toFixed(0);

// Selected-tower panel: stats, upgrade (U), sell (Delete), targeting priority.
export function TowerPanel({ towerId, scrap, onFeedback }) {
  useTicker(250);
  const tower = towerDefenseState.getTower(towerId);
  const info = towerDefenseState.describe(tower);
  if (!info) return null;
  const Icon = TOWER_ICONS[info.type];
  const s = info.stats, n = info.nextStats;
  const canUpgrade = info.upgradeCost !== null && scrap >= info.upgradeCost;
  const upgrade = () => {
    if (towerDefenseState.upgrade(info.id)) onFeedback?.(`${info.name} upgraded to level ${info.level + 1}`, 'good');
    else onFeedback?.(info.upgradeCost === null ? 'Tower is at max level' : `Not enough scrap (${info.upgradeCost} needed)`, 'bad');
  };
  const sell = () => {
    const refund = towerDefenseState.sell(info.id);
    if (refund !== false) onFeedback?.(`${info.name} sold: +${refund} scrap`, 'good');
  };
  return (
    <div className="absolute right-4 bottom-44 w-64 pointer-events-auto hud-root hud-panel hud-panel-accent p-3" data-testid="tower-panel"
      onContextMenu={e => e.preventDefault()}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={18} className="text-amber-300" />
        <div className="flex-1">
          <div className="hud-title text-sm leading-tight">{info.name}</div>
          <div className="flex gap-1 mt-0.5">
            {Array.from({ length: info.maxLevel }, (_, i) => (
              <span key={i} className={`h-1 w-6 rounded-sm ${i < info.level ? 'bg-amber-400' : 'bg-white/15'}`} />
            ))}
            <span className="hud-label ml-1 !text-[9px]">LV {info.level}</span>
          </div>
        </div>
        <button className="text-stone-400 hover:text-white" onClick={() => towerDefenseState.selectTower(null)} title="Deselect (Esc)"><X size={16} /></button>
      </div>
      <div className="space-y-0.5 mb-2">
        <Stat label="Damage" value={s.damage.toFixed(0)} next={n?.damage.toFixed(0)} />
        <Stat label="DPS" value={dps(s)} next={n ? dps(n) : null} />
        <Stat label="Range" value={`${s.range.toFixed(1)}m`} next={n ? `${n.range.toFixed(1)}m` : null} />
        {s.splashRadius && <Stat label="Splash" value={`${s.splashRadius.toFixed(1)}m`} next={n ? `${n.splashRadius.toFixed(1)}m` : null} />}
        {s.slowFactor && <Stat label="Slow" value={`${Math.round((1 - s.slowFactor) * 100)}%`} next={n ? `${Math.round((1 - n.slowFactor) * 100)}%` : null} />}
        <Stat label="Kills" value={info.kills} />
      </div>
      <div className="hud-label mb-1">Target priority</div>
      <div className="grid grid-cols-3 gap-1 mb-2">
        {TOWER_DEFENSE.targetingModes.map(mode => (
          <button key={mode} onClick={() => towerDefenseState.setTargeting(info.id, mode)} data-testid={`targeting-${mode}`}
            className={`hud-btn py-1 text-[9px] ${info.targeting === mode ? 'hud-btn-primary' : ''}`}>{TARGETING_LABELS[mode]}</button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button className={`hud-btn flex-1 py-1.5 text-[10px] flex items-center justify-center gap-1 ${canUpgrade ? 'hud-btn-primary' : ''}`}
          disabled={info.upgradeCost === null} onClick={upgrade} data-testid="tower-upgrade">
          <ChevronsUp size={13} />
          {info.upgradeCost === null ? 'Max level' : <>Upgrade <span className={canUpgrade ? '' : 'text-red-400'}>{info.upgradeCost}</span></>}
          {info.upgradeCost !== null && <span className="hud-key !min-w-[1rem] !h-[1rem] !text-[9px] ml-0.5">U</span>}
        </button>
        <button className="hud-btn px-2 py-1.5 text-[10px] flex items-center gap-1" onClick={sell} title="Sell (Delete)" data-testid="tower-sell">
          <Coins size={12} /> Sell {info.sellValue}
        </button>
      </div>
    </div>
  );
}
