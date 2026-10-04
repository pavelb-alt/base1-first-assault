import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { combat } from '@/game/3d/combat';
import { battle, battleSnapshot, resetBattle } from '@/game/3d/battleMetrics';
import { gameState } from '@/game/3d/world';
import { explosionVisuals } from '@/game/3d/objects/BattlefieldExplosions';
import { input, clearInput, setFire, setKey, look } from '@/game/3d/input';
import { MAP, FRONT, BALANCE, BASES, BASE, TOWER_DEFENSE, getMaxWaves } from '@/game/config';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { tankState } from '@/game/3d/objects/tankState';
import { artilleryState } from '@/game/3d/objects/artilleryState';
import { winterWeather } from '@/game/3d/objects/WinterSnow';
import { DETAIL_COUNT, SMOKE_SITES, FIELD_DETAIL } from '@/game/3d/dressing/battlefieldDetailLayout';
import { selectUnit, selectAllUnits, holdPosition, issueAttack, selectionSnapshot, setCommandMode, issueCommand, clearOrders, clearSelection } from '@/game/3d/commands';
import { selectScreenBox } from '@/game/3d/rtsSelection';
import { frontlineSnapshot, resetFrontline } from '@/game/3d/navigation/frontline';
import { resetCrossings } from '@/game/3d/navigation/enemyTraversal';
import { coverSnapshot, resetCombatCover } from '@/game/3d/navigation/coverTactics';
import { updateSpatial, resetSpatial } from '@/game/3d/spatial';
const pos = new THREE.Vector3();
const dir = new THREE.Vector3();
const q = new THREE.Quaternion();
function weaponState(u) {
  const w = u.weapon;
  if (!w) return { id: u.id, weaponId: u.weaponId, attached: false };
  w.muzzle.updateWorldMatrix(true, false);
  w.muzzle.getWorldPosition(pos);
  w.socket.getWorldQuaternion(q);
  dir.copy(w.barrelAxis).applyQuaternion(q); // authored carbine barrel axis
  return { id: u.id, weaponId: u.weaponId, attached: w.socket.parent === w.hand,
    embedded: w.embedded, muzzleNode: w.muzzle.name,
    animation: u.currentAnim?.current ?? null, clips: Object.keys(u.actions ?? {}),
    socketCount: w.hand.children.filter(c => c.name === 'WeaponSocket').length,
    muzzle: pos.toArray(), barrelDirection: dir.toArray(), aim: u.aimPoint?.toArray() ?? null };
}
export function GameRuntime() {
  const camera = useThree(state => state.camera);
  const frames = useRef(0);
  const performance = useRef({frames:0,seconds:0,maxFrameMs:0,drawCalls:0,triangles:0});
  const levelTransition = useRef({ active: false, timer: 0 });
  useEffect(() => {
    const selected = () => combat.units.find(u => u.team === 'friendly' && u.id === gameState.possessedSoldierId);
    window.game = {
      ready: false,
      getMode: () => gameState.mode,
      getCampaign: () => ({ level: gameState.currentLevel, wave: towerDefenseState.wave, maxWaves: getMaxWaves(gameState.currentLevel), transitioning: levelTransition.current.active, paused: gameState.paused, result: battle.gameOver }),
      getWeather: () => ({ ...winterWeather }),
      getBattlefieldDetail: () => ({ active: gameState.currentLevel !== 5, level: gameState.currentLevel, instances: DETAIL_COUNT, smokeSites: SMOKE_SITES.length, batches: Object.fromEntries(Object.entries(FIELD_DETAIL).map(([kind,items])=>[kind,items.length])), visualOnly: true }),
      getTowers: () => towerDefenseState.towers.map(t => ({ id: t.id, type: t.type, position: { ...t.position }, targetId: t.targetId, shotsFired: t.shotsFired || 0, visual: t.visual ? { ...t.visual } : null })), 
      getVisualEffects: () => ({ ...explosionVisuals }),
      getBattle: () => battleSnapshot(combat.units),
      getFrontline: () => frontlineSnapshot(),
      getOutposts: () => coverSnapshot(),
      getMap: () => ({width:MAP.SIZE,length:MAP.SIZE,fronts:[...FRONT.rows],crossings:[...FRONT.crossings],crossingWidth:FRONT.crossingHalfWidth*2,sections:[...FRONT.sectionCenters],capPerTeam:BALANCE.friendly.maxAlive}),
      getPerformance: () => ({...performance.current,averageFps:performance.current.seconds?performance.current.frames/performance.current.seconds:0}),
      getSoldierPosition: () => ({...gameState.soldierPosition}),
      isSelected: () => gameState.selectedSoldierId !== null,
      getSelectedId: () => gameState.selectedSoldierId,
      getPossessedId: () => gameState.possessedSoldierId,
      getSoldierIds: () => combat.units.filter(u => u.team === 'friendly' && u.alive).map(u => u.id),
      getSoldierCount: () => combat.units.filter(u => u.team === 'friendly' && u.alive).length,
      getEnemyCount: () => combat.units.filter(u => u.team === 'enemy' && u.alive).length,
      getEnemies: () => combat.units.filter(u => u.team === 'enemy').map(u => ({ id:u.id, type:u.type, squadId:u.squadId, health:u.health, alive:u.alive, shotsFired:u.shotsFired ?? 0, position:u.bodyRef.current?{...u.bodyRef.current.translation()}:null, phase:u.nav?.phase ?? null })),
      getTankCount: () => combat.units.filter(u => u.team === 'friendly' && u.type === 'tank' && u.alive).length,
      getTanks: () => combat.units.filter(u => u.team === 'friendly' && u.type === 'tank' && u.alive).map(u => ({ id: u.id, position: u.bodyRef.current ? { ...u.bodyRef.current.translation() } : null, shotsFired: u.shotsFired || 0, targetId: u.cachedTarget?.alive ? u.cachedTarget.id : null })),
      getArtillery: () => ({
        units: combat.units.filter(u => u.team === 'friendly' && u.type === 'artillery' && u.alive).map(u => ({ id: u.id, health: u.health, position: u.bodyRef.current ? { ...u.bodyRef.current.translation() } : null, shotsFired: u.shotsFired })),
        shellsInFlight: artilleryState.shells.filter(s => s.active).length, shellsFired: artilleryState.shellsFired, impacts: artilleryState.impacts,
      }),
      getFriendlyCombatCount: () => combat.units.filter(u => u.team === 'friendly' && u.alive).length,
      getWeapons: () => combat.units.filter(u => u.team === 'friendly' && u.alive).map(weaponState),
      getCombat: () => ({ ...combat.stats, activeProjectiles: combat.projectiles.filter(p => p.active).length,
        pending: combat.pendingProjectiles.length, lastShot: combat.lastShot ? JSON.parse(JSON.stringify(combat.lastShot)) : null,
        lastImpact: combat.lastImpact ? JSON.parse(JSON.stringify(combat.lastImpact)) : null }),
      getControlledUnit: () => { const u = selected(); return u ? { ...weaponState(u), health: u.health, maxHealth: u.maxHealth, profile: { ...u.profile }, sectorIndex: u.sectorIndex, cooldown: u.cooldown, firing: input.mouseDown } : null; },
      getUnit: (team,id) => { const u = combat.units.find(u => u.team === team && u.id === id); return u ? { id:u.id, team:u.team, type:u.type, sectorIndex:u.sectorIndex, squadId:u.squadId, health:u.health, maxHealth:u.maxHealth, profile:{...u.profile}, alive:u.alive, velocity:u.bodyRef.current?{...u.bodyRef.current.linvel()}:null, position:u.bodyRef.current?{...u.bodyRef.current.translation()}:null, navigation:u.nav?{phase:u.nav.phase,waypoint:u.nav.index??null,front:u.nav.front??null,target:u.nav.target?{...u.nav.target}:u.nav.route?.[u.nav.index]?{...u.nav.route[u.nav.index]}:null}:null, assignment:u.assignment?{...u.assignment}:null, reservedPosition:u.positionId??null } : null; },
      selectSoldier: id => selectUnit(combat.units.find(u => u.team === 'friendly' && u.type === 'soldier' && u.id === id && u.alive)),
      selectUnit: (type, id, additive = false) => selectUnit(combat.units.find(u => u.team === 'friendly' && u.type === type && u.id === id && u.alive), additive),
      selectAllUnits, holdPosition,
      selectBox: (bounds, additive = false) => selectScreenBox(camera, bounds, additive),
      attackTarget: (type, id) => issueAttack(combat.units.find(u => u.team === 'enemy' && u.type === type && u.id === id && u.alive)),
      getSelection: selectionSnapshot,
      setCommandMode, issueCommand, clearOrders: () => clearOrders(), deselect: clearSelection,
      possess: () => EventBus.emit('possess-soldier'), release: () => EventBus.emit('release-soldier'),
      setFire, setKey, look,
      reset: () => EventBus.emit('reset-game'),
      pause: () => EventBus.emit('pause-game'), resume: () => EventBus.emit('resume-game'),
    };
    const advanceToNight = () => {
      levelTransition.current = { active: false, timer: 0 };
      gameState.currentLevel = 2;
      towerDefenseState.transitionLevel();
      battle.waves.enemy = 0;
      EventBus.emit('level-changed', 2);
    };
    const advanceToForest = () => {
      levelTransition.current = { active: false, timer: 0 };
      gameState.currentLevel = 3;
      towerDefenseState.transitionLevel();
      battle.waves.enemy = 0;
      EventBus.emit('level-changed', 3);
    };
    const advanceFromBriefing = (nextLevel) => {
      if (gameState.currentLevel !== nextLevel - 1 || !levelTransition.current.active) return;
      levelTransition.current = { active: false, timer: 0 };
      gameState.currentLevel = nextLevel;
      towerDefenseState.transitionLevel();
      battle.waves.enemy = 0;
      EventBus.emit('release-soldier');
      EventBus.emit('level-changed', nextLevel);
      EventBus.emit('resume-game');
    };
    const advanceToFrost = () => advanceFromBriefing(4);
    const advanceToCity = () => advanceFromBriefing(5);
    const reset = () => {
      clearInput(); resetBattle(); resetFrontline(); resetCrossings(); resetCombatCover(); resetSpatial();
      towerDefenseState.reset();
      tankState.reset();
      artilleryState.reset();
      levelTransition.current = { active: false, timer: 0 };
      gameState.currentLevel = 1;
      EventBus.emit('level-changed', 1);
      performance.current={frames:0,seconds:0,maxFrameMs:0,drawCalls:0,triangles:0};
      frames.current = 0; if (window.game) window.game.ready = false;
      for (const unit of combat.units) { unit.alive = false; unit.aiTarget = null; unit.breached = false; }
      EventBus.emit('release-soldier');
      EventBus.emit('reset-camera');
    };
    EventBus.on('reset-game', reset);
    EventBus.on('proceed-to-night', advanceToNight);
    EventBus.on('proceed-to-forest', advanceToForest);
    EventBus.on('proceed-to-frost', advanceToFrost);
    EventBus.on('proceed-to-city', advanceToCity);
    return () => { EventBus.off('reset-game', reset); EventBus.off('proceed-to-night', advanceToNight); EventBus.off('proceed-to-forest', advanceToForest); EventBus.off('proceed-to-frost', advanceToFrost); EventBus.off('proceed-to-city', advanceToCity); delete window.game; };
  }, []);
  useFrame(({gl}, delta) => {
    if (!gameState.paused) {
      // Level transition: pause game logic during the cinematic, then advance.
      if (levelTransition.current.active) return;
      battle.elapsed += delta;
      updateSpatial(combat.units,battle.elapsed);
      const p=performance.current;p.frames++;p.seconds+=delta;p.maxFrameMs=Math.max(p.maxFrameMs,delta*1000);
      p.drawCalls=gl.info.render.calls;p.triangles=gl.info.render.triangles;
      p.pixelRatio=gl.getPixelRatio();p.shadows=gl.shadowMap.enabled;

      // Tower defense: track waves and survival timer
      if (towerDefenseState.startTime === 0) towerDefenseState.startTime = Date.now();
      if (battle.waves.enemy > towerDefenseState.wave) {
        towerDefenseState.wave = battle.waves.enemy;
        EventBus.emit('wave-changed', towerDefenseState.wave);
        // Victory after surviving all waves — day level transitions to night
        const maxWaves = getMaxWaves(gameState.currentLevel);
        if (towerDefenseState.wave >= maxWaves && !battle.gameOver) {
          if (gameState.currentLevel < 5) {
            levelTransition.current.active = true;
            levelTransition.current.timer = 0;
            if (gameState.currentLevel >= 3) {
              EventBus.emit('release-soldier');
              EventBus.emit('pause-game');
            }
            EventBus.emit('level-transition');
            return;
          } else {
            battle.gameOver = 'victory';
            EventBus.emit('game-over', 'victory');
          }
        }
      }

      // Base breach detection — units that reach the opposing base deal damage.
      if (!battle.gameOver) {
        const fb = BASES.friendly.position, eb = BASES.enemy.position;
        for (const u of combat.units) {
          if (!u.alive || !u.bodyRef?.current || u.breached) continue;
          const pos = u.bodyRef.current.translation();
          const targetBase = u.team === 'enemy' ? fb : eb;
          const dist = Math.hypot(pos.x - targetBase[0], pos.z - targetBase[2]);
          if (dist < BASE.breachRadius) {
            u.breached = true;
            const target = u.team === 'enemy' ? 'friendly' : 'enemy';
            battle.baseHealth[target] -= BASE.breachDamage;
            if (battle.baseHealth[target] <= 0) {
              battle.baseHealth[target] = 0;
              battle.gameOver = u.team === 'enemy' ? 'defeat' : 'victory';
              EventBus.emit('game-over', battle.gameOver);
            }
          }
        }
      }
    }
    // Inside Physics; assets, bodies, attachments and a completed prior frame are required.
    if (!window.game?.ready) {
      const friendly = combat.units.filter(u => u.team === 'friendly' && u.alive);
      if (combat.physics && friendly.length && friendly.every(u => u.weapon?.socket.parent && u.bodyRef.current)) {
        if (++frames.current > 1 && window.game) window.game.ready = true;
      } else frames.current = 0;
    }
  }, -3);
  return null;
}