import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { combat } from '@/game/3d/combat';
import { battle } from '@/game/3d/battleMetrics';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { clearInput } from '@/game/3d/input';
import { DIRECT_CONTROL, MAP } from '@/game/config';
import { terrainHeight } from '@/game/3d/terrain';

export function getStation() {
  const s = gameState.controlledStation;
  if (!s) return null;
  return s.type === 'tower' ? towerDefenseState.towers.find(t => t.id === s.id)
    : combat.units.find(u => u.team === 'friendly' && u.type === s.type && u.id === s.id && u.alive);
}
export const isStationControlled = (type, id) => gameState.mode === 'third_person' && gameState.controlledStation?.type === type && gameState.controlledStation.id === id;
export const stationPosition = s => s?.bodyRef?.current?.translation() ?? (s?.position ? { ...s.position, y: 0 } : null);
export function nearestStation() {
  if (gameState.mode !== 'third_person' || gameState.controlledStation || gameState.paused || gameState.transitioning) return null;
  const soldier = combat.units.find(u => u.team === 'friendly' && u.type === 'soldier' && u.id === gameState.possessedSoldierId && u.alive);
  if (!soldier?.bodyRef.current) return null;
  const p = soldier.bodyRef.current.translation();
  let best = null, distance = DIRECT_CONTROL.enterRadius;
  for (const s of [...combat.units.filter(u => u.team === 'friendly' && u.alive && ['tank','artillery'].includes(u.type)), ...towerDefenseState.towers.filter(t => t.visual?.deployed)]) {
    const q = stationPosition(s); if (!q) continue;
    const d = Math.hypot(q.x-p.x,q.z-p.z);
    if (d < distance) { distance=d; best={type:s.bodyRef ? s.type : 'tower',id:s.id}; }
  }
  return best;
}
export function enterStation(type, id) {
  if (gameState.paused || gameState.preparing || gameState.transitioning || battle.gameOver || gameState.controlledStation) return false;
  const target = type === 'tower' ? towerDefenseState.towers.find(t => t.id === id && t.visual?.deployed)
    : combat.units.find(u => u.team === 'friendly' && u.type === type && u.id === id && u.alive && u.bodyRef.current);
  if (!target || !['tank','artillery','tower'].includes(type)) return false;
  if (gameState.mode === 'third_person') {
    const nearby=nearestStation();
    if (nearby?.type !== type || nearby.id !== id) return false;
  } else if (type === 'tower') return false;
  const soldier=combat.units.find(u=>u.team==='friendly' && u.type==='soldier' && u.id===gameState.possessedSoldierId && u.alive);
  if (soldier) { soldier.seated=true; soldier.aiTarget=null; soldier.bodyRef.current.setLinvel({x:0,y:0,z:0},true); soldier.bodyRef.current.setEnabled(false); }
  target.order=null; target.commandRoute=null;
  gameState.controlledStation={type,id};
  const p=stationPosition(target); gameState.soldierPosition.set(p.x,p.y,p.z);
  clearInput(); EventBus.emit('station-changed',{type,id});
  return true;
}
export function exitStation() {
  const station=getStation(); const p=stationPosition(station) ?? gameState.soldierPosition;
  const hadStation=!!gameState.controlledStation;
  gameState.controlledStation=null; clearInput();
  const soldier=combat.units.find(u=>u.team==='friendly' && u.type==='soldier' && u.id===gameState.possessedSoldierId && u.alive);
  if (soldier?.seated) {
    const x=Math.max(-MAP.HALF+2,Math.min(MAP.HALF-2,p.x+DIRECT_CONTROL.exitOffset));
    const z=Math.max(-MAP.HALF+2,Math.min(MAP.HALF-2,p.z));
    soldier.seated=false; soldier.bodyRef.current.setEnabled(true);
    soldier.bodyRef.current.setTranslation({x,y:terrainHeight(x,z)+0.15,z},true);
    soldier.bodyRef.current.setLinvel({x:0,y:0,z:0},true);
    gameState.soldierPosition.set(x,terrainHeight(x,z)+0.15,z);
  }
  if (hadStation) EventBus.emit('station-changed',null);
  return !!soldier;
}
export function interactStation() {
  if (gameState.paused || gameState.transitioning || battle.gameOver) return false;
  if (gameState.controlledStation) {
    const returnsToSoldier=exitStation();
    if (!returnsToSoldier) EventBus.emit('release-soldier');
    return true;
  }
  const near=nearestStation(); return near ? enterStation(near.type,near.id) : false;
}
export function stationSnapshot() {
  const s=getStation(), type=gameState.controlledStation?.type;
  return { active:s ? {type,id:s.id,name:type==='tower' ? `${s.type.toUpperCase()} TOWER` : type.toUpperCase(),position:stationPosition(s),shotsFired:s.shotsFired??0,cooldown:Math.max(0,s.cooldown??0),health:s.health??null,maxHealth:s.maxHealth??null} : null,nearby:nearestStation() };
}