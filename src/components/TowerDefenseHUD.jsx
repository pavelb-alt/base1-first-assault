import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { EventBus } from '@/game/EventBus';
import { TOWER_DEFENSE, ABILITIES } from '@/game/config';
import { towerDefenseState, placementProblem } from '@/game/3d/towerDefenseState';
import { gameState } from '@/game/3d/world';
import { canCommand } from '@/game/3d/commands';
import { callWaveEarly } from '@/game/3d/waves';
import { tacticalState, startPlacement, startTargeting, cancelTactical, flashInvalid } from '@/game/3d/abilities/tacticalState';
import { activateAbility, abilityProblem, TARGETED } from '@/game/3d/abilities/abilities';
import { MissionBar, BossBar } from '@/components/tactical/MissionBar';
import { AbilityBar, BuildBar } from '@/components/tactical/CommandBars';
import { TowerPanel } from '@/components/tactical/TowerPanel';
import { TOWER_ORDER } from '@/components/tactical/useTicker';
import { TOWER_ICONS } from '@/components/tactical/icons';

const KEY_TO_TOWER = { Digit1: 'mg', Digit2: 'cannon', Digit3: 'frost' };
const KEY_TO_ABILITY = Object.fromEntries(Object.entries(ABILITIES).map(([id, cfg]) => [cfg.key, id]));
const typing = e => /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) || e.target?.isContentEditable;

export function TowerDefenseHUD({ visible }) {
  const [scrap, setScrap] = useState(towerDefenseState.scrap);
  const [level, setLevel] = useState(gameState.currentLevel);
  const [pie, setPie] = useState(null);            // { x, y, world: {x,z} }
  const [tactical, setTactical] = useState({ mode: null, placeType: null, abilityId: null });
  const [selectedTower, setSelectedTower] = useState(towerDefenseState.selectedTowerId);
  const [toast, setToast] = useState(null);         // { text, tone, key }
  const toastTimer = useRef(null);

  const feedback = useCallback((text, tone = 'bad') => {
    setToast({ text, tone, key: performance.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const onCurrency = (amt) => setScrap(amt);
    const onLevelChanged = (l) => { setLevel(l); setPie(null); };
    const onTactical = (t) => setTactical(t);
    const onTowerSelected = (id) => setSelectedTower(id);
    const onReset = () => { setPie(null); towerDefenseState.selectTower(null); };
    EventBus.on('currency-changed', onCurrency);
    EventBus.on('level-changed', onLevelChanged);
    EventBus.on('tactical-mode', onTactical);
    EventBus.on('tower-selected', onTowerSelected);
    EventBus.on('reset-game', onReset);
    EventBus.on('tactical-feedback', feedback);
    return () => {
      EventBus.off('currency-changed', onCurrency); EventBus.off('level-changed', onLevelChanged);
      EventBus.off('tactical-mode', onTactical); EventBus.off('tower-selected', onTowerSelected);
      EventBus.off('reset-game', onReset); EventBus.off('tactical-feedback', feedback);
    };
  }, [feedback]);

  // Leaving strategic view drops any half-finished placement/targeting and the pie.
  useEffect(() => {
    if (visible) return;
    cancelTactical(); setPie(null); tacticalState.preview = null;
    towerDefenseState.selectTower(null);
  }, [visible]);

  const closePie = useCallback(() => { setPie(null); tacticalState.preview = null; tacticalState.pieAnchor = null; }, []);

  const pickTower = useCallback((type) => {
    closePie();
    if (tacticalState.mode === 'place' && tacticalState.placeType === type) { cancelTactical(); return; }
    const cfg = TOWER_DEFENSE.towers[type];
    if (towerDefenseState.scrap < cfg.cost) feedback(`Not enough scrap for ${cfg.name} (${cfg.cost})`);
    towerDefenseState.selectTower(null);
    startPlacement(type);
  }, [closePie, feedback]);

  const triggerAbility = useCallback((id) => {
    closePie();
    if (tacticalState.mode === 'ability' && tacticalState.abilityId === id) { cancelTactical(); return; }
    const problem = abilityProblem(id);
    if (problem) { feedback(problem); return; }
    if (TARGETED[id]) { towerDefenseState.selectTower(null); startTargeting(id); return; }
    const result = activateAbility(id);
    if (result.ok) feedback(id === 'reinforce' ? `Reinforcements inbound: ${result.squad} soldiers` : `${ABILITIES[id].name} deployed`, 'good');
    else feedback(result.problem);
  }, [closePie, feedback]);

  // Place a tower or fire an ability at the current ground cursor.
  const commitTactical = useCallback((shift) => {
    const c = tacticalState.cursor;
    if (!c.onGround) return;
    if (tacticalState.mode === 'place') {
      const type = tacticalState.placeType;
      const problem = towerDefenseState.placementProblem(type, c);
      if (problem) { feedback(problem); flashInvalid(c.x, c.z); return; }
      towerDefenseState.spend(type, { x: c.x, z: c.z });
      // Shift-click keeps placing the same type.
      if (!shift || towerDefenseState.scrap < TOWER_DEFENSE.towers[type].cost) cancelTactical();
    } else if (tacticalState.mode === 'ability') {
      const id = tacticalState.abilityId;
      const result = activateAbility(id, c.x, c.z);
      if (result.ok) {
        cancelTactical();
        if (id === 'repair') feedback(`Field repair: ${result.healed} units patched${result.baseRepaired ? `, base +${Math.round(result.baseRepaired)}` : ''}`, 'good');
      } else feedback(result.problem);
    }
  }, [feedback]);

  // Canvas input: right-click pie / cancel, left-click commit, empty-click deselects tower.
  useEffect(() => {
    if (!visible) return;
    const canvas = document.querySelector('#game-container canvas');
    if (!canvas) return;

    const onContextMenu = (e) => {
      if (gameState.mode !== 'strategic') return;
      e.preventDefault();
      if (tacticalState.mode) { cancelTactical(); return; }
      if (!canCommand()) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const c = tacticalState.cursor;
      if (!c.onGround) return;
      const world = { x: c.x, z: c.z };
      // Right-clicking an existing tower selects it.
      const hitTower = towerDefenseState.towers.find(t => Math.hypot(t.position.x - world.x, t.position.z - world.z) < TOWER_DEFENSE.towers[t.type].baseRadius + 0.6);
      if (hitTower) { closePie(); towerDefenseState.selectTower(hitTower.id); return; }
      const problem = placementProblem('mg', world, towerDefenseState.towers);
      if (problem) { closePie(); feedback(problem); flashInvalid(world.x, world.z); return; }
      tacticalState.pieAnchor = world;
      setPie({ x, y, world });
    };
    // Capture phase: runs before R3F and the RTS selection handlers.
    const onClickCapture = (e) => {
      if (gameState.mode !== 'strategic' || e.button !== 0 || !tacticalState.mode) return;
      e.stopImmediatePropagation(); e.preventDefault();
      if (canCommand()) commitTactical(e.shiftKey);
    };
    const onWindowClick = (e) => {
      if (e.target !== canvas || gameState.mode !== 'strategic') return;
      setPie(null); tacticalState.preview = null;
      // Clicks that landed on a tower stamp towerClickAt during R3F dispatch.
      if (towerDefenseState.selectedTowerId !== null && performance.now() - (tacticalState.towerClickAt ?? 0) > 120) towerDefenseState.selectTower(null);
    };
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('click', onClickCapture, true);
    window.addEventListener('click', onWindowClick);
    return () => {
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('click', onWindowClick);
    };
  }, [visible, closePie, commitTactical, feedback]);

  // Strategic hotkeys: 1/2/3 build, Q/R/F abilities, N call wave, U upgrade, Delete sell, Esc cancel.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e) => {
      if (gameState.mode !== 'strategic' || e.repeat || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Escape') {
        if (tacticalState.mode) cancelTactical();
        else if (pie) closePie();
        else if (towerDefenseState.selectedTowerId !== null) towerDefenseState.selectTower(null);
        return;
      }
      if (!canCommand()) return;
      if (KEY_TO_TOWER[e.code]) { e.preventDefault(); pickTower(KEY_TO_TOWER[e.code]); return; }
      if (KEY_TO_ABILITY[e.code]) { e.preventDefault(); triggerAbility(KEY_TO_ABILITY[e.code]); return; }
      if (e.code === 'KeyN') {
        const bonus = callWaveEarly();
        if (bonus) feedback(`Wave called early: +${bonus} scrap`, 'good'); else feedback('Next wave cannot be called yet');
        return;
      }
      const tower = towerDefenseState.getTower(towerDefenseState.selectedTowerId);
      if (!tower) return;
      if (e.code === 'KeyU') {
        const cost = towerDefenseState.upgradeCost(tower);
        if (towerDefenseState.upgrade(tower.id)) feedback(`Upgraded to level ${tower.level}`, 'good');
        else feedback(cost === null ? 'Tower is at max level' : `Not enough scrap (${cost} needed)`);
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        const refund = towerDefenseState.sell(tower.id);
        if (refund !== false) feedback(`Tower sold: +${refund} scrap`, 'good');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, pie, closePie, pickTower, triggerAbility, feedback]);

  const handlePieSelect = useCallback((type) => {
    if (!pie) return;
    const problem = towerDefenseState.placementProblem(type, pie.world);
    if (problem) { feedback(problem); flashInvalid(pie.world.x, pie.world.z); }
    else towerDefenseState.spend(type, pie.world);
    closePie();
  }, [pie, closePie, feedback]);

  if (!visible) return null;

  const hint = tactical.mode === 'place'
    ? `Placing ${TOWER_DEFENSE.towers[tactical.placeType]?.name} · Click to build · Shift-click to keep building · Right-click / Esc to cancel`
    : tactical.mode === 'ability'
      ? `${ABILITIES[tactical.abilityId]?.name} · Click a target · Right-click / Esc to cancel`
      : null;

  return (
    <>
      <MissionBar level={level} scrap={scrap} onFeedback={feedback} />
      <BossBar />
      <BuildBar scrap={scrap} placeType={tactical.mode === 'place' ? tactical.placeType : null} onPick={pickTower} />
      <AbilityBar activeId={tactical.mode === 'ability' ? tactical.abilityId : null} onTrigger={triggerAbility} />
      {selectedTower !== null && <TowerPanel towerId={selectedTower} scrap={scrap} onFeedback={feedback} />}

      {hint && (
        <div className="absolute left-1/2 -translate-x-1/2 top-[124px] pointer-events-none hud-root">
          <div className="hud-panel px-4 py-1.5 text-xs tracking-wide text-amber-100">{hint}</div>
        </div>
      )}
      {toast && (
        <div key={toast.key} className="absolute left-1/2 -translate-x-1/2 top-[158px] pointer-events-none hud-root" data-testid="tactical-toast">
          <div className={`hud-panel px-4 py-1.5 text-sm font-semibold ${toast.tone === 'good' ? 'text-teal-300 border-teal-400/40' : 'text-red-300 border-red-400/50'}`}>{toast.text}</div>
        </div>
      )}

      {pie && (
        <RadialPieMenu x={pie.x} y={pie.y} world={pie.world} scrap={scrap} onSelect={handlePieSelect} onClose={closePie} />
      )}
    </>
  );
}

function RadialPieMenu({ x, y, world, scrap, onSelect, onClose }) {
  // The 3 tower choices are arranged in a circle at 120° intervals
  const radius = 70;
  const angles = [-90, 30, 150]; // top, bottom-right, bottom-left (in degrees)
  const [hover, setHover] = useState(null);
  const preview = type => { setHover(type); tacticalState.preview = type ? { type, x: world.x, z: world.z } : null; };
  const hovered = hover ? TOWER_DEFENSE.towers[hover] : null;

  return (
    <div
      className="absolute pointer-events-auto hud-root"
      style={{ left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)', zIndex: 40 }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      data-testid="tower-pie"
    >
      <div className="hud-panel absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[184px] h-[184px] !rounded-full border-amber-400/30" />
      <button
        className="hud-btn absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[54px] h-[54px] !rounded-full flex items-center justify-center"
        onClick={onClose} aria-label="Close" title="Close (Esc)"
      >
        {hovered ? <span className="text-[9px] leading-tight text-center">{Math.round(hovered.range)}m<br />range</span> : <X size={16} />}
      </button>
      {TOWER_ORDER.map((key, i) => {
        const cfg = TOWER_DEFENSE.towers[key], Icon = TOWER_ICONS[key];
        const angle = (angles[i] * Math.PI) / 180;
        const affordable = scrap >= cfg.cost;
        return (
          <button
            key={key}
            aria-label={cfg.name}
            data-testid={`pie-${key}`}
            className={`hud-btn absolute left-1/2 top-1/2 w-[64px] h-[64px] !rounded-full flex flex-col items-center justify-center gap-0.5 ${affordable ? '' : 'opacity-60'}`}
            style={{ transform: `translate(calc(-50% + ${Math.cos(angle) * radius}px), calc(-50% + ${Math.sin(angle) * radius}px))` }}
            onMouseEnter={() => preview(key)}
            onMouseLeave={() => preview(null)}
            onClick={() => onSelect(key)}
          >
            <Icon size={16} className={affordable ? 'text-amber-300' : 'text-stone-500'} />
            <span className="text-[9px] leading-none">{cfg.name.split(' ')[0]}</span>
            <span className={`text-[10px] leading-none ${affordable ? 'text-amber-200' : 'text-red-400'}`}>{cfg.cost}</span>
          </button>
        );
      })}
    </div>
  );
}
