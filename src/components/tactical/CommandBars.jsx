import { TOWER_DEFENSE } from '@/game/config';
import { getAbilities } from '@/game/3d/abilities/abilities';
import { useTicker, TOWER_ORDER } from '@/components/tactical/useTicker';
import { TOWER_ICONS, ABILITY_ICONS } from '@/components/tactical/icons';

// Commander ability bar (bottom-right): Q / R / F with cooldown sweep and scrap cost.
export function AbilityBar({ activeId, onTrigger }) {
  useTicker(150);
  const abilities = getAbilities();
  return (
    <div className="absolute right-4 bottom-20 pointer-events-auto hud-root" data-testid="ability-bar">
      <div className="hud-label text-right mb-1">Commander</div>
      <div className="flex gap-1.5">
        {abilities.map(a => {
          const Icon = ABILITY_ICONS[a.id];
          const usable = a.ready && a.affordable;
          const sweep = a.ready ? 0 : (a.remaining / a.cooldown) * 360;
          const active = activeId === a.id;
          return (
            <button key={a.id} onClick={() => onTrigger(a.id)} title={`${a.name} — ${a.cost} scrap, ${a.cooldown}s cooldown (${a.key})`}
              data-testid={`ability-${a.id}`}
              className={`hud-btn relative w-[68px] h-[68px] flex flex-col items-center justify-center gap-0.5 overflow-hidden ${active ? '!border-amber-400 !bg-amber-500/25' : ''} ${usable ? '' : 'opacity-70'}`}>
              {!a.ready && (
                <span className="absolute inset-0 pointer-events-none"
                  style={{ background: `conic-gradient(rgba(0,0,0,0.65) ${sweep}deg, transparent ${sweep}deg)` }} />
              )}
              <span className="hud-key absolute top-1 left-1 !min-w-[1.1rem] !h-[1.05rem] !text-[9px]">{a.key}</span>
              <Icon size={20} className={a.ready ? 'text-amber-300' : 'text-stone-400'} />
              <span className="text-[8px] leading-none tracking-wider relative">{a.name.split(' ')[0]}</span>
              <span className={`text-[10px] leading-none relative ${a.affordable ? 'text-amber-200' : 'text-red-400'}`}>
                {a.ready ? a.cost : `${Math.ceil(a.remaining)}s`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Build bar (left edge): pick a tower type, then click the ground. Keys 1 / 2 / 3.
export function BuildBar({ scrap, placeType, onPick }) {
  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-auto hud-root flex flex-col gap-1.5" data-testid="build-bar">
      <div className="hud-label mb-0.5">Build</div>
      {TOWER_ORDER.map((type, i) => {
        const cfg = TOWER_DEFENSE.towers[type], Icon = TOWER_ICONS[type];
        const affordable = scrap >= cfg.cost, active = placeType === type;
        return (
          <button key={type} onClick={() => onPick(type)} data-testid={`build-${type}`}
            title={`${cfg.name} — ${cfg.cost} scrap · range ${cfg.range}m (${i + 1})`}
            className={`hud-btn w-[120px] px-2 py-1.5 flex items-center gap-2 text-left ${active ? '!border-amber-400 !bg-amber-500/25' : ''}`}>
            <Icon size={16} className={affordable ? 'text-amber-300' : 'text-stone-500'} />
            <span className="flex-1 leading-tight">
              <span className="block text-[10px]">{cfg.name.split(' ')[0]}</span>
              <span className={`block text-[11px] ${affordable ? 'text-amber-200' : 'text-red-400'}`}>{cfg.cost}</span>
            </span>
            <span className="hud-key !min-w-[1.2rem] !h-[1.15rem]">{i + 1}</span>
          </button>
        );
      })}
    </div>
  );
}
