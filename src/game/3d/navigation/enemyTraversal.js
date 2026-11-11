import { FRONT, BASES } from '@/game/config';
import { battle } from '@/game/3d/battleMetrics';
import { random } from '@/game/3d/random';
import { visitNearby } from '@/game/3d/spatial';
import { moveToward, stop } from '@/game/3d/navigation/motion';
import { recordTraversal } from '@/game/3d/navigation/frontline';
import { releaseCombatCover, updateEnemyBreach } from '@/game/3d/navigation/coverTactics';

// Gate reservations are not exclusive: eight-metre causeways admit several lanes.
const routes=new Map();
export function resetCrossings(){routes.clear();}
export function releaseCrossing(entry){routes.delete(entry.id);releaseCombatCover(entry);}
function allocateLink(entry) {
  const nav=entry.nav, p=entry.bodyRef.current.translation();
  if(nav.front>0) {
    nav.phase='base';
    nav.target={x:BASES.friendly.position[0]+(entry.id%5-2)*1.2,z:BASES.friendly.position[2]-3};
    return;
  }
  const row=FRONT.rows[FRONT.mainRow];
  let gate=FRONT.crossings[0],score=Infinity;
  for(const x of FRONT.crossings) {
    let crowd=0;
    visitNearby(x,row,16,u=>{if(u.team==='enemy')crowd++;});
    const cost=Math.abs(x-p.x)+crowd*2;
    if(cost<score){score=cost;gate=x;}
  }
  // Seeded lateral spread stays comfortably inside the flat centre of the route.
  nav.x=gate+(random()-0.5)*(FRONT.crossingHalfWidth-1)*1.4;
  nav.gate=gate;nav.row=row;nav.phase='approach';
  nav.target={x:nav.x,z:row-FRONT.crossingApproach};
  routes.set(entry.id,gate);
}
// Watchdog: a hostile that neither moves nor fights for ~15s gets a fresh route, so
// the final wave can always be cleared (no units parked against cover forever).
const STUCK_SAMPLE=5, STUCK_STRIKES=3;
function watchStuck(entry) {
  const p=entry.bodyRef.current.translation(), w=entry.stuck||(entry.stuck={x:p.x,z:p.z,at:battle.elapsed,strikes:0});
  if(battle.elapsed-w.at<STUCK_SAMPLE)return;
  const moved=Math.hypot(p.x-w.x,p.z-w.z);
  w.strikes=moved<0.6&&!entry.aiTarget?w.strikes+1:0;
  w.x=p.x;w.z=p.z;w.at=battle.elapsed;
  if(w.strikes<STUCK_STRIKES)return;
  w.strikes=0;
  releaseCrossing(entry);
  const front=entry.nav.front;
  entry.nav={front};allocateLink(entry);
  // Small sideways offset breaks symmetric jams against obstacles.
  if(entry.nav.target)entry.nav.target={x:entry.nav.target.x+(random()-0.5)*4,z:entry.nav.target.z};
}
export function updateEnemy(entry,delta,enemy) {
  if(entry.nav)watchStuck(entry);
  if(!entry.nav){entry.nav={front:0};allocateLink(entry);}
  const nav=entry.nav, flying=entry.type==='eyedrone';
  if(nav.phase==='base'&&!flying&&updateEnemyBreach(entry,enemy,delta))return false;
  if(enemy){stop(entry,flying);entry.aiTarget=enemy;return false;}
  entry.aiTarget=null;
  const p=entry.bodyRef.current.translation();
  // Avoid crowd repulsion preventing completion of an otherwise clear waypoint.
  const arrived=moveToward(entry,nav.target,delta,{flying,
    separate:Math.hypot(nav.target.x-p.x,nav.target.z-p.z)>2.5,
    avoidOutposts:nav.phase==='base'});
  if(nav.phase==='base')return arrived;
  if(!arrived)return false;
  if(nav.phase==='approach') {
    nav.phase='cross';nav.crossStarted=battle.elapsed;
    nav.target={x:nav.x,z:nav.row+FRONT.crossingExit};
  } else {
    recordTraversal(flying?'eyedrone_flyover':'bulwark_causeway',battle.elapsed-nav.crossStarted);
    releaseCrossing(entry);nav.front=1;allocateLink(entry);
  }
  return false;
}