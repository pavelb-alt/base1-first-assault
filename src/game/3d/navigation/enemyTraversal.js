import { FRONT, BASES, SECTORS } from '@/game/config';
import { battle } from '@/game/3d/battleMetrics';
import { random } from '@/game/3d/random';
import { terrainHeight } from '@/game/3d/terrain';
import { visitNearby } from '@/game/3d/spatial';
import { isGrounded, moveToward, stop } from '@/game/3d/navigation/motion';
import { recordTraversal } from '@/game/3d/navigation/frontline';

const landings=new Map();
export function resetCrossings(){landings.clear();}
export function releaseCrossing(entry){if(entry.nav?.landingKey)landings.delete(entry.nav.landingKey);}
function allocateLink(entry) {
  const nav=entry.nav,sector=SECTORS[entry.sectorIndex];
  const row=FRONT.rows[FRONT.rows.length-1-nav.front];
  if(row===undefined){nav.phase='base';nav.target={x:BASES.friendly.position[0]+(entry.id%5-2)*1.7,z:BASES.friendly.position[2]-5};return;}
  const p=entry.bodyRef.current.translation();
  const x=Math.max(sector.minX+10,Math.min(sector.maxX-10,p.x+(random()-0.5)*30));
  nav.row=row;nav.started=battle.elapsed;nav.phase='approach';
  if(entry.type==='trilobite') {
    // A broad sector has several flat earth causeways, not a single rail.
    const choices=FRONT.crossings.filter(c=>c>=sector.minX&&c<=sector.maxX);
    let best=choices[0],score=Infinity;
    for(const c of choices){let crowd=0;visitNearby(c,row,16,u=>{if(u.team==='enemy')crowd++;});const s=Math.abs(c-x)+crowd*8;if(s<score){score=s;best=c;}}
    nav.x=best;nav.target={x:best,z:row-12};
  } else {nav.x=x;nav.target={x,z:row+FRONT.jumpStart};}
}
function clearLanding(entry,x,z) {
  if(Math.abs(x)>190 || Math.abs(z)>190 || Math.abs(terrainHeight(x,z))>0.05)return false;
  let clear=true;
  visitNearby(x,z,2.1,(u,p)=>{if(u!==entry&&p.y<2)clear=false;});
  for(const [key,landing] of landings)if(key!==entry.nav.landingKey&&Math.hypot(landing.x-x,landing.z-z)<2.1)clear=false;
  return clear;
}
function beginJump(entry) {
  const nav=entry.nav,p=entry.bodyRef.current.translation(),z=nav.row+FRONT.jumpEnd;
  if(!isGrounded(entry))return false;
  if(!clearLanding(entry,nav.x,z)) {
    for(const offset of [3,-3,6,-6]) {
      const x=nav.x+offset,sector=SECTORS[entry.sectorIndex];
      if(x>sector.minX+3&&x<sector.maxX-3&&clearLanding(entry,x,z)) {
        nav.x=x;nav.target={x,z:nav.row+FRONT.jumpStart};nav.phase='approach';return false;
      }
    }
    stop(entry);return false;
  }
  nav.landingKey=`${entry.id}:${nav.front}`;
  landings.set(nav.landingKey,{x:nav.x,z});
  nav.landing={x:nav.x,z};nav.jumpElapsed=0;nav.phase='jump';nav.crossStarted=battle.elapsed;
  const t=FRONT.jumpDuration,landingY=terrainHeight(nav.x,z)-(entry.footOffset||0);
  nav.vx=(nav.x-p.x)/t;nav.vz=(z-p.z)/t;
  entry.bodyRef.current.setLinvel({x:nav.vx,y:(landingY-p.y+0.5*FRONT.gravity*t*t)/t,z:nav.vz},true);
  return true;
}
export function updateEnemy(entry,delta,enemy) {
  if(!entry.nav){entry.nav={front:0};allocateLink(entry);}
  const nav=entry.nav,body=entry.bodyRef.current,p=body.translation();
  if(nav.phase==='jump') {
    nav.jumpElapsed+=delta;
    const arrived=p.z>=nav.landing.z-0.4;
    const v=body.linvel();
    body.setLinvel({x:arrived?0:nav.vx,y:v.y,z:arrived?0:nav.vz},true);
    entry.heading=Math.atan2(nav.vx,nav.vz);
    if(nav.jumpElapsed>0.25&&isGrounded(entry)&&v.y<=0.5) {
      releaseCrossing(entry);nav.landingKey=null;
      if(arrived){recordTraversal('quadshell_jump',battle.elapsed-nav.crossStarted);nav.front++;allocateLink(entry);}
      else {nav.phase='approach';nav.target={x:nav.x,z:nav.row+FRONT.jumpStart};}
    }
    return false;
  }
  // Ground enemies stop to engage visible defenders; drones keep altitude.
  if(enemy){stop(entry,entry.type==='eyedrone');entry.aiTarget=enemy;return false;}
  entry.aiTarget=null;
  if(nav.phase==='base')return moveToward(entry,nav.target,delta,{flying:entry.type==='eyedrone'});
  if(entry.type==='eyedrone') {
    if(nav.phase==='approach') {
      if(moveToward(entry,nav.target,delta,{flying:true})){nav.phase='cross';nav.crossStarted=battle.elapsed;nav.target={x:nav.x,z:nav.row+11};}
    } else if(moveToward(entry,nav.target,delta,{flying:true})) {
      recordTraversal('eyedrone_flyover',battle.elapsed-nav.crossStarted);nav.front++;allocateLink(entry);
    }
  } else if(entry.type==='trilobite') {
    if(moveToward(entry,nav.target,delta)) {
      if(nav.phase==='approach'){nav.phase='cross';nav.crossStarted=battle.elapsed;nav.target={x:nav.x,z:nav.row+12};}
      else {recordTraversal('trilobite_causeway',battle.elapsed-nav.crossStarted);nav.front++;allocateLink(entry);}
    }
  } else if(moveToward(entry,nav.target,delta))beginJump(entry);
  return false;
}