import { FRONT, MAP } from '@/game/config';
import { trenchCenter, ZIG_X } from '@/game/3d/trenchShape';
export { terrainHeight, trenchCenter } from '@/game/3d/trenchShape';

export function nearestSection(x) {
  return Math.max(0,Math.min(FRONT.sectionCenters.length-1,Math.floor((x+MAP.HALF*0.9)/FRONT.sectionWidth)));
}
export function trenchAt(z,margin=FRONT.rampReach,x=0) {
  return FRONT.rows.findIndex((_,row)=>Math.abs(trenchCenter(row,x)-z)<margin);
}
export function firingPosition(row,section,slot) {
  // Nine distinct stations on either side of the ramp, clear of causeway slopes.
  const half=FRONT.slotsPerSection/2;
  const x=FRONT.sectionCenters[section]+(slot<half?-1:1)*(FRONT.stationInner+(slot%half)*FRONT.stationSpacing);
  return {x,z:trenchCenter(row,x)+FRONT.firingZ};
}
function spineRoute(route,row,from,to) {
  const direction=Math.sign(to-from)||1;
  const bends=ZIG_X.filter(x=>(x-from)*direction>0&&(to-x)*direction>0).sort((a,b)=>(a-b)*direction);
  for(const x of [...bends,to])route.push({x,z:trenchCenter(row,x)+FRONT.spineZ});
}
// Existing navigation now follows the connected channel, rather than cutting its bends.
export function walkRoute(start,target) {
  const route=[];
  const direction=target.z<start.z?FRONT.friendlyForward:FRONT.enemyForward;
  const startRow=trenchAt(start.z,FRONT.rampReach+0.2,start.x),endRow=trenchAt(target.z,FRONT.rampReach+0.2,target.x);
  const outside=FRONT.rampReach+1;
  let currentZ=start.z;
  if(startRow>=0) {
    const local=start.z-trenchCenter(startRow,start.x);
    const inside=local>=-FRONT.halfWidth && local<=FRONT.halfWidth;
    if(inside) {
      route.push({x:start.x,z:trenchCenter(startRow,start.x)+FRONT.spineZ});
      if(startRow===endRow) {
        spineRoute(route,startRow,start.x,target.x);route.push({x:target.x,z:target.z});return route;
      }
      const gate=FRONT.sectionCenters[nearestSection(start.x)];
      spineRoute(route,startRow,start.x,gate);
      currentZ=trenchCenter(startRow,gate)+direction*outside;
      route.push({x:gate,z:currentZ});
    } else {
      // A released soldier on a ramp or exterior bank first clears the wall, then aligns.
      currentZ=trenchCenter(startRow,start.x)+Math.sign(local)*outside;
      route.push({x:start.x,z:currentZ});
    }
  }
  const rows=FRONT.rows.map((z,i)=>({z,i})).filter(r=>r.i!==endRow&&(r.z-currentZ)*direction>0&&(target.z-r.z)*direction>0).sort((a,b)=>(a.z-b.z)*direction);
  for(const row of rows) {
    const x=FRONT.crossings.reduce((best,c)=>Math.abs(c-target.x)<Math.abs(best-target.x)?c:best);
    const z=trenchCenter(row.i,x);
    route.push({x,z:z-direction*outside},{x,z:z+direction*outside});
  }
  if(endRow>=0) {
    const x=FRONT.sectionCenters[nearestSection(target.x)],z=trenchCenter(endRow,x);
    const side=currentZ>FRONT.rows[endRow]?1:-1;
    route.push({x,z:z+side*outside},{x,z:z+FRONT.spineZ});
    spineRoute(route,endRow,x,target.x);
  }
  route.push({x:target.x,z:target.z});
  return route;
}