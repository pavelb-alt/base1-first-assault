import { SECTORS, BASES } from '@/game/config';
const sectorStats=()=>({friendly:{spawned:0,deaths:0,breaches:0,lifeSeconds:0},enemy:{spawned:0,deaths:0,breaches:0,lifeSeconds:0}});
export const battle={elapsed:0,waves:{friendly:0,enemy:0},sectors:SECTORS.map(sectorStats),shots:{friendly:0,enemy:0},hits:{friendly:0,enemy:0},playerDamage:0,playerKills:0,projectileOverflow:0};
export function resetBattle(){
  battle.elapsed=0;battle.waves={friendly:0,enemy:0};battle.sectors=SECTORS.map(sectorStats);
  battle.shots={friendly:0,enemy:0};battle.hits={friendly:0,enemy:0};battle.playerDamage=0;battle.playerKills=0;battle.projectileOverflow=0;
}
export function recordWave(team,waveId,spawned){battle.waves[team]=waveId;battle.sectors.forEach((s,i)=>{s[team].spawned+=spawned[i];});}
export function recordRemoval(unit,reason){
  if(!unit||unit.removalRecorded)return;unit.removalRecorded=true;
  const s=battle.sectors[unit.sectorIndex]?.[unit.team];if(!s)return;
  if(reason==='death'){s.deaths++;s.lifeSeconds+=battle.elapsed-unit.bornAt;}
  if(reason==='breach')s.breaches++;
}
export function battleSnapshot(units){
  const sectors=SECTORS.map((s,i)=>({name:s.name,friendly:{...battle.sectors[i].friendly,alive:0,hp:0,frontline:null},enemy:{...battle.sectors[i].enemy,alive:0,hp:0,frontline:null},types:{}}));
  for(const u of units){
    if(!u.alive||!u.bodyRef.current)continue;
    const s=sectors[u.sectorIndex];if(!s)continue;
    const team=s[u.team];team.alive++;team.hp+=u.health;s.types[u.type]=(s.types[u.type]||0)+1;
    const progress=(BASES.friendly.position[2]-u.bodyRef.current.translation().z)/(BASES.friendly.position[2]-BASES.enemy.position[2]);
    team.frontline=team.frontline===null?progress:(u.team==='friendly'?Math.max(team.frontline,progress):Math.min(team.frontline,progress));
  }
  for(const s of sectors)for(const team of ['friendly','enemy']){const t=s[team];t.meanLifetimeAtDeath=t.deaths?t.lifeSeconds/t.deaths:null;}
  return {elapsed:battle.elapsed,waves:{...battle.waves},sectors,shots:{...battle.shots},hits:{...battle.hits},playerDamage:battle.playerDamage,playerKills:battle.playerKills,projectileOverflow:battle.projectileOverflow,
    baseDamage:null,baseDamageStatus:'Unchanged: decorative bases; arrivals are recorded as breaches, not victory or damage.'};
}