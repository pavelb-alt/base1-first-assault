import { BASES, FRONT } from '@/game/config';
import { battle } from '@/game/3d/battleMetrics';
import { walkRoute, firingPosition } from '@/game/3d/terrain';
import { visitNearby } from '@/game/3d/spatial';
import { followRoute, stop } from '@/game/3d/navigation/motion';
import { releaseCombatCover, updateFriendlyCover } from '@/game/3d/navigation/coverTactics';

const reservations=new Map();
const progress=FRONT.sectionCenters.map(()=>0);
const metrics={};
let allocationCursor=0;
export function recordTraversal(type,seconds) {
  const m=metrics[type] || (metrics[type]={count:0,totalSeconds:0,maxSeconds:0});
  m.count++;m.totalSeconds+=seconds;m.maxSeconds=Math.max(m.maxSeconds,seconds);
}
export function resetFrontline() { reservations.clear();progress.fill(0);allocationCursor=0;for(const k of Object.keys(metrics))delete metrics[k]; }
export function releasePosition(entry) {
  if(entry?.positionId && reservations.get(entry.positionId)===entry)reservations.delete(entry.positionId);
  releaseCombatCover(entry);
  if(entry)entry.positionId=null;
}
function count(row,section) {
  let n=0;
  for(const u of reservations.values())if(u.alive&&u.assignment.row===row&&u.assignment.section===section)n++;
  return n;
}
export function preferredSpawnSection(sector,counts) {
  return Math.max(0,Math.min(FRONT.sectionCenters.length-1,sector));
}
export function reservePosition(entry,minimumRow=0) {
  releasePosition(entry);
  let best=null;
  for(let n=0;n<FRONT.sectionCenters.length;n++) {
    const section=(n+allocationCursor)%FRONT.sectionCenters.length;
    const row=Math.max(minimumRow,progress[section]);
    if(row>=FRONT.rows.length)continue;
    const occupied=count(row,section);
    if(occupied>=FRONT.slotsPerSection)continue;
    const score=occupied+(section===entry.sectorIndex?0:FRONT.slotsPerSection);
    const travel=Math.abs(FRONT.sectionCenters[section]-entry.bodyRef.current.translation().x);
    if(!best||score<best.score||(score===best.score&&travel<best.travel))best={row,section,occupied,score,travel};
  }
  if(!best)return false;
  allocationCursor=(best.section+1)%FRONT.sectionCenters.length;
  // Spread unique firing stations on both banks of the entry ramp, never on a crossing.
  const half=Math.ceil(FRONT.slotsPerSection/2);
  const slots=Array.from({length:FRONT.slotsPerSection},(_,i)=>i).sort((a,b)=>(a%half)-(b%half)||a-b);
  const slot=slots.find(i=>!reservations.has(`${best.row}:${best.section}:${i}`));
  if(slot===undefined)return false;
  entry.assignment={row:best.row,section:best.section,slot,...firingPosition(best.row,best.section,slot)};
  entry.positionId=`${best.row}:${best.section}:${slot}`;
  reservations.set(entry.positionId,entry);
  entry.nav={phase:'entering',route:walkRoute(entry.bodyRef.current.translation(),entry.assignment),index:0,started:battle.elapsed,clearSince:null,nextCheck:0};
  return true;
}
export function suspendFrontline(entry) { releasePosition(entry);entry.nav={phase:'possessed'}; }
export function resumeFrontline(entry) { entry.nav=null;entry.assignment=null; }
export function updateFriendly(entry,delta,enemy) {
  if(!entry.nav && !reservePosition(entry)) {
    // Tower defense: no trench slot available — hold a defensive position on the friendly half
    const tx = entry.bodyRef.current.translation().x;
    entry.nav={phase:'base',route:walkRoute(entry.bodyRef.current.translation(),{x:tx,z:FRONT.rows[FRONT.mainRow]+FRONT.rampReach+2}),index:0};
  }
  const nav=entry.nav;
  const advancingFromCover = battle.elapsed < (entry.coverAdvanceUntil || 0);
  if(updateFriendlyCover(entry,advancingFromCover?null:enemy,delta)) {nav.clearSince=null;nav.fighting=!!entry.aiTarget;return false;}
  if(enemy && !advancingFromCover) {nav.clearSince=null;stop(entry);entry.aiTarget=enemy;nav.fighting=true;return false;}
  nav.fighting=false;
  if(nav.phase==='base') {
    if(followRoute(entry,delta))return true;
    return false;
  }
  if(nav.phase==='entering') {
    if(followRoute(entry,delta)) {
      nav.phase='holding';nav.clearSince=null;
      recordTraversal('friendly_entry',battle.elapsed-nav.started);
    }
    return false;
  }
  // The bulwark is the final defensive line: never advance into the open field.
  stop(entry);
  entry.aiTarget=null;
  return false;
}
export function frontlineSnapshot() {
  return {rows:FRONT.rows.map((z,row)=>({z,sections:FRONT.sectionCenters.map((x,section)=>({x,reserved:count(row,section),capacity:FRONT.slotsPerSection}))})),
    reservations:reservations.size,progress:[...progress],traversal:Object.fromEntries(Object.entries(metrics).map(([k,m])=>[k,{completed:m.count,meanSeconds:m.totalSeconds/m.count,maxSeconds:m.maxSeconds}]))};
}