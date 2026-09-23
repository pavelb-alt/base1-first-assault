import { MAP, FRONT, BASES, DRESSING, BATTLEFIELD_DETAIL as DETAIL, CARGO_SHIP } from '@/game/config';
import { trenchCenter, crossingDistance, rampDistance, rowProfile, COMMUNICATION_SEGMENTS, terrainHeight } from '@/game/3d/trenchShape';
import { dressingNoise as noise } from '@/game/3d/dressing/dressingNoise';
import { reliefHeight } from '@/game/3d/dressing/terrainRelief';

export const FIELD_DETAIL = { rock:[], box:[], cylinder:[], rim:[], basin:[], bag:[], ember:[] };
export const WRECK_SITES=[];
const occupied=[];
export function detailClearance(x,z,r) {
  if(Math.max(Math.abs(x),Math.abs(z))+r>MAP.HALF-2)return false;
  if(crossingDistance(x)<r+FRONT.crossingHalfWidth+1)return false;
  // Leave spawn rows, base approaches and delivery zones untouched.
  if(Math.abs(Math.abs(z)-FRONT.spawnZ)<r+3)return false;
  if(Object.values(BASES).some(b=>Math.hypot(x-b.position[0],z-b.position[2])<r+10))return false;
  if(CARGO_SHIP.landingZones.some(p=>Math.hypot(x-p.x,z-p.z)<r+8))return false;
  // Reserve the actual trench banks and entry lanes, not an entire broad
  // horizontal strip: the flat ground between trenches can now carry debris.
  if(rampDistance(x)<r+FRONT.rampHalfWidth+FRONT.rampShoulder+.6)return false;
  if(FRONT.rows.some((_,row)=>{
    const profile=rowProfile(row),margin=profile.halfWidth+profile.zigAmplitude+r+.8;
    return Math.abs(z-trenchCenter(row,x))<margin || Math.abs(z+trenchCenter(row,x))<margin;
  }))return false;
  for(const segment of COMMUNICATION_SEGMENTS) {
    for(const sign of [-1,1]) {
      const dx=x-segment.x,dz=z*sign-segment.z;
      const along=dx*Math.cos(segment.rotation)-dz*Math.sin(segment.rotation);
      const across=dx*Math.sin(segment.rotation)+dz*Math.cos(segment.rotation);
      if(Math.hypot(Math.max(0,Math.abs(along)-segment.width/2),across)<r+FRONT.communicationWidth+1)return false;
    }
  }
  return Math.abs(terrainHeight(x,z))<.001;
}
const perimeterStart=MAP.HALF-DETAIL.perimeterBand;
function site(seed,r,index) {
  const perimeter=index%3!==1;
  const side=(Math.floor(index/3)*2+(index%3===2?1:0))%4;
  const limit=MAP.HALF-2-r;
  for(let i=0;i<800;i++) {
    const k=seed+i*7;
    let x,z;
    if(perimeter) {
      const along=(noise(k)-.5)*limit*2;
      const edge=perimeterStart+noise(k+1)*(limit-perimeterStart);
      x=side<2?(side===0?-edge:edge):along;
      z=side>=2?(side===2?-edge:edge):along;
    } else {
      // Alternate interior quadrants so both armies' halves receive detail.
      const quadrant=Math.floor(index/3)%4;
      x=(quadrant%2?-1:1)*noise(k)*(perimeterStart-r);
      z=(quadrant<2?-1:1)*noise(k+1)*(perimeterStart-r);
    }
    if(!detailClearance(x,z,r)||occupied.some(p=>Math.hypot(x-p.x,z-p.z)<r+p.r+.65))continue;
    const s={x,z,r};occupied.push(s);return s;
  }
  return null;
}
function add(kind,x,y,z,sx,sy,sz,color,rotation=[0,0,0]) {
  FIELD_DETAIL[kind].push({position:[x,y+reliefHeight(x,z),z],scale:[sx,sy,sz],color,rotation});
}
// Crater lips + low dark bowls read at strategic zoom without changing walkable earth.
for(let i=0;i<DETAIL.craters;i++) {
  const r=1.4+noise(73100+i)*.65,s=site(74000+i*123,r*1.2,i);if(!s)continue;
  add('basin',s.x,.014,s.z,r*2.2,.055,r*1.8,DRESSING.scorch);
  add('rim',s.x,.035,s.z,r,.6,r*.82,DRESSING.earth,[0,noise(i+73400)*3,0]);
  add('rock',s.x+r*.8,.13,s.z,r*.65,.3,r*.55,DRESSING.rock);
}
for(let i=0;i<DETAIL.wrecks;i++) {
  const s=site(82000+i*111,2.6,i);if(!s)continue;
  const yaw=noise(82100+i)*6.28;
  const piece=(kind,dx,y,dz,sx,sy,sz,col,tilt=0)=>{
    const x=s.x+dx*Math.cos(yaw)+dz*Math.sin(yaw),z=s.z-dx*Math.sin(yaw)+dz*Math.cos(yaw);
    add(kind,x,y,z,sx,sy,sz,col,[tilt,yaw,.08]);
  };
  piece('box',0,.42,0,2.1,.65,3.6,DRESSING.rust,.13);
  piece('box',-1.1,.25,0,.45,.45,3.8,'#393b37');
  piece('box',1.1,.25,0,.45,.45,3.8,'#393b37');
  piece('box',.25,.9,-.3,1.25,.55,1.5,DRESSING.steel,.3);
  piece('cylinder',.35,1,-1.8,.18,2,.18,'#484b46',Math.PI/2+.15);
  piece('box',-1.1,.13,1.65,.8,.12,1.2,DRESSING.rust,.3);
  piece('basin',0,.01,0,5.2,.03,5.2,DRESSING.scorch);
  if(WRECK_SITES.length<4){WRECK_SITES.push([s.x,.9,s.z]);piece('ember',0,.77,.1,.65,.06,.9,DETAIL.ember);}
}
for(let i=0;i<DETAIL.bagClusters;i++) {
  const s=site(90000+i*97,1.65,i);if(!s)continue;
  for(let j=0;j<6;j++) {
    const layer=Math.floor(j/3),dx=(j%3-1)*.85+layer*.18;
    add('bag',s.x+dx,.14+layer*.22,s.z+layer*.15,.95,.3,.55,'#8b8060',[0,.1,0]);
  }
}
for(let i=0;i<DETAIL.rockPieces;i++) {
  const s=site(95000+i*77,.35,i);if(!s)continue;
  const r=.25+noise(95100+i)*.5;
  add('rock',s.x,r*.25,s.z,r*1.5,r*.7,r,DRESSING.rock,[.15,noise(95200+i)*6,.15]);
}
for(let i=0;i<DETAIL.shells;i++) {
  const s=site(102000+i*67,.22,i);if(!s)continue;
  add('cylinder',s.x,.1,s.z,.17,.55,.17,'#a18b51',[Math.PI/2,0,noise(102100+i)*6]);
}
// Tall silhouettes outside the map boundary: never obscure traversal or spawn exits.
for(let i=0;i<DETAIL.ruins;i++) {
  const x=(i%2?-1:1)*(MAP.HALF+7+noise(108000+i)*4),z=-60+Math.floor(i/2)*28;
  const h=2.6+noise(108100+i)*2.3;
  add('box',x,.12,z,6,.24,5,DRESSING.scorch);
  add('box',x-2,h/2,z-1.8,.5,h,.5,DRESSING.steel,[0,0,.06]);
  add('box',x+2,h*.33,z-1.8,.55,h*.66,.55,DRESSING.steel,[0,0,-.16]);
  add('box',x-.3,h*.7,z-1.8,4.8,.35,.4,DRESSING.rust,[0,0,-.21]);
  add('box',x,.7,z+1.4,4.5,1.4,.45,'#827e70',[0,.05,0]);
  add('box',x+1,.24,z,3,.3,.4,DRESSING.rust,[0,.8,.1]);
}
export const SMOKE_SITES=[...WRECK_SITES,[-86,1,-52],[87,1,38]].slice(0,DETAIL.smokeSites);
export const DETAIL_COUNT=Object.values(FIELD_DETAIL).reduce((n,items)=>n+items.length,0);
export function detailDistribution() {
  const perimeter=occupied.filter(p=>Math.max(Math.abs(p.x),Math.abs(p.z))>=perimeterStart).length;
  return {
    sites:occupied.length, perimeter, interior:occupied.length-perimeter,
    quadrants:[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sz])=>occupied.filter(p=>p.x*sx>0&&p.z*sz>0).length),
    clearancesValid:occupied.every(p=>detailClearance(p.x,p.z,p.r)),
  };
}