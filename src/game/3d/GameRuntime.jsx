import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { combat } from '@/game/3d/combat';
import { battle, battleSnapshot, resetBattle } from '@/game/3d/battleMetrics';
import { gameState } from '@/game/3d/world';
import { input, clearInput, setFire, setKey, look } from '@/game/3d/input';
import { MAP, FRONT, BALANCE } from '@/game/config';
import { frontlineSnapshot, resetFrontline } from '@/game/3d/navigation/frontline';
import { resetCrossings } from '@/game/3d/navigation/enemyTraversal';
import { updateSpatial, resetSpatial } from '@/game/3d/spatial';
const pos = new THREE.Vector3();
const dir = new THREE.Vector3();
const q = new THREE.Quaternion();
function weaponState(u) {
  const w = u.weapon;
  if (!w) return { id: u.id, weaponId: u.weaponId, attached: false };
  w.muzzle.updateWorldMatrix(true, false);
  w.muzzle.getWorldPosition(pos);
  w.muzzle.getWorldQuaternion(q);
  dir.set(0,0,-1).applyQuaternion(q);
  return { id: u.id, weaponId: u.weaponId, attached: w.socket.parent === w.hand,
    socketCount: w.hand.children.filter(c => c.name === 'WeaponSocket').length,
    muzzle: pos.toArray(), barrelDirection: dir.toArray(), aim: u.aimPoint?.toArray() ?? null };
}
export function GameRuntime() {
  const frames = useRef(0);
  const performance = useRef({frames:0,seconds:0,maxFrameMs:0,drawCalls:0,triangles:0});
  useEffect(() => {
    const selected = () => combat.units.find(u => u.team === 'friendly' && u.id === gameState.possessedSoldierId);
    window.game = {
      ready: false,
      getMode: () => gameState.mode,
      getBattle: () => battleSnapshot(combat.units),
      getFrontline: () => frontlineSnapshot(),
      getMap: () => ({width:MAP.SIZE,length:MAP.SIZE,fronts:[...FRONT.rows],capPerTeam:BALANCE.friendly.maxAlive}),
      getPerformance: () => ({...performance.current,averageFps:performance.current.seconds?performance.current.frames/performance.current.seconds:0}),
      getSoldierPosition: () => ({...gameState.soldierPosition}),
      isSelected: () => gameState.selectedSoldierId !== null,
      getSelectedId: () => gameState.selectedSoldierId,
      getPossessedId: () => gameState.possessedSoldierId,
      getSoldierIds: () => combat.units.filter(u => u.team === 'friendly' && u.alive).map(u => u.id),
      getSoldierCount: () => combat.units.filter(u => u.team === 'friendly' && u.alive).length,
      getEnemyCount: () => combat.units.filter(u => u.team === 'enemy' && u.alive).length,
      getFriendlyCombatCount: () => combat.units.filter(u => u.team === 'friendly' && u.alive).length,
      getWeapons: () => combat.units.filter(u => u.team === 'friendly' && u.alive).map(weaponState),
      getCombat: () => ({ ...combat.stats, activeProjectiles: combat.projectiles.filter(p => p.active).length,
        pending: combat.pendingProjectiles.length, lastShot: combat.lastShot ? JSON.parse(JSON.stringify(combat.lastShot)) : null,
        lastImpact: combat.lastImpact ? JSON.parse(JSON.stringify(combat.lastImpact)) : null }),
      getControlledUnit: () => { const u = selected(); return u ? { ...weaponState(u), health: u.health, maxHealth: u.maxHealth, profile: { ...u.profile }, sectorIndex: u.sectorIndex, cooldown: u.cooldown, firing: input.mouseDown } : null; },
      getUnit: (team,id) => { const u = combat.units.find(u => u.team === team && u.id === id); return u ? { id:u.id, team:u.team, type:u.type, sectorIndex:u.sectorIndex, squadId:u.squadId, health:u.health, maxHealth:u.maxHealth, profile:{...u.profile}, alive:u.alive, position:u.bodyRef.current?{...u.bodyRef.current.translation()}:null, navigation:u.nav?{phase:u.nav.phase,waypoint:u.nav.index??null,front:u.nav.front??null}:null, reservedPosition:u.positionId??null } : null; },
      selectSoldier: id => {
        const u = combat.units.find(u => u.team === 'friendly' && u.id === id && u.alive);
        if (!u || gameState.mode !== 'strategic') return false;
        gameState.selectedSoldierId = id; EventBus.emit('soldier-selected'); return true;
      },
      possess: () => EventBus.emit('possess-soldier'), release: () => EventBus.emit('release-soldier'),
      setFire, setKey, look,
      reset: () => EventBus.emit('reset-game'),
      pause: () => EventBus.emit('pause-game'), resume: () => EventBus.emit('resume-game'),
    };
    const reset = () => {
      clearInput(); resetBattle(); resetFrontline(); resetCrossings(); resetSpatial();
      performance.current={frames:0,seconds:0,maxFrameMs:0,drawCalls:0,triangles:0};
      frames.current = 0; if (window.game) window.game.ready = false;
      for (const unit of combat.units) { unit.alive = false; unit.aiTarget = null; }
      EventBus.emit('release-soldier');
      EventBus.emit('reset-camera');
    };
    EventBus.on('reset-game', reset);
    return () => { EventBus.off('reset-game', reset); delete window.game; };
  }, []);
  useFrame(({gl}, delta) => {
    if (!gameState.paused) {
      battle.elapsed += delta;
      updateSpatial(combat.units,battle.elapsed);
      const p=performance.current;p.frames++;p.seconds+=delta;p.maxFrameMs=Math.max(p.maxFrameMs,delta*1000);
      p.drawCalls=gl.info.render.calls;p.triangles=gl.info.render.triangles;
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