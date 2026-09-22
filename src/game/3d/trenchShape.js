import { FRONT, MAP } from '@/game/config';

const clamp = v => Math.max(0, Math.min(1, v));
const sorted = values => [...new Set(values.map(v => Number(v.toFixed(4))))].sort((a,b) => a-b);
const frontage = MAP.HALF * 0.9;
export const rowProfile = row => ({
  halfWidth: FRONT.halfWidth,
  depth: FRONT.depth,
  zigAmplitude: FRONT.zigAmplitude,
  ...(FRONT.rowProfiles?.[row] || {}),
});
export function trenchOffset(x, row=FRONT.mainRow ?? 0) {
  // Long firing bays joined by short angled traverses, matching the field diagram.
  const t = (x + frontage) / FRONT.zigLength;
  const n = Math.floor(t), f = t - n, direction = n % 2 === 0 ? 1 : -1;
  const shape = f < 0.64 ? direction : direction * (1 - 2 * (f - 0.64) / 0.36);
  return shape * rowProfile(row).zigAmplitude;
}
export const trenchCenter = (row, x) => FRONT.rows[row] + trenchOffset(x,row);
export const crossingDistance = x => Math.min(...FRONT.crossings.map(c => Math.abs(c-x)));
export const rampDistance = x => Math.min(...FRONT.sectionCenters.map(c => Math.abs(c-x)));
const zigCount=Math.ceil(2*frontage/FRONT.zigLength);
export const ZIG_X = sorted(Array.from({length:zigCount+1},(_,i)=>[-frontage+i*FRONT.zigLength,-frontage+(i+0.64)*FRONT.zigLength]).flat().filter(x=>x<=frontage));
export const TERRAIN_X = sorted([-MAP.HALF, MAP.HALF, ...ZIG_X,
  ...FRONT.crossings.flatMap(x => [-FRONT.crossingHalfWidth-FRONT.crossingSlope,-FRONT.crossingHalfWidth,0,FRONT.crossingHalfWidth,FRONT.crossingHalfWidth+FRONT.crossingSlope].map(d => x+d)),
  ...FRONT.sectionCenters.flatMap(x => [-FRONT.rampHalfWidth-FRONT.rampShoulder,-FRONT.rampHalfWidth,0,FRONT.rampHalfWidth,FRONT.rampHalfWidth+FRONT.rampShoulder].map(d => x+d))]);
const maxHalfWidth=Math.max(FRONT.halfWidth,...FRONT.rows.map((_,row)=>rowProfile(row).halfWidth));
const profileZ = [-FRONT.rampReach,-maxHalfWidth-0.2,-maxHalfWidth,FRONT.stepRear,FRONT.floorFront,FRONT.floorRear,maxHalfWidth,FRONT.rampReach];
export const TERRAIN_BANDS = [{z:-MAP.HALF}, ...FRONT.rows.flatMap((z,row) => profileZ.map(d => ({z:z+d,row,d}))).sort((a,b)=>a.z-b.z), {z:MAP.HALF}];

function profileHeight(x,d,row) {
  if (Math.abs(x) >= frontage) return 0;
  const profile=rowProfile(row),halfWidth=profile.halfWidth,depth=profile.depth;
  const rearFloor=Math.min(FRONT.floorRear,halfWidth-0.25);
  let h;
  if(d <= -halfWidth) h = FRONT.firingFloor * clamp((d+halfWidth+0.2)/0.2);
  else if(d <= FRONT.stepRear) h = FRONT.firingFloor;
  else if(d < FRONT.floorFront) h = FRONT.firingFloor + (-depth-FRONT.firingFloor)*(d-FRONT.stepRear)/(FRONT.floorFront-FRONT.stepRear);
  else if(d <= rearFloor) h = -depth;
  else h = -depth*(1-clamp((d-rearFloor)/(halfWidth-rearFloor)));
  // A continuous walkable ramp on BOTH sides of each entry; no curb at its mouth.
  const gate = 1-clamp((rampDistance(x)-FRONT.rampHalfWidth)/FRONT.rampShoulder);
  const ramp = d < FRONT.floorFront ? -depth*clamp((d+FRONT.rampReach)/(FRONT.floorFront+FRONT.rampReach))
    : -depth*(1-clamp((d-rearFloor)/(FRONT.rampReach-rearFloor)));
  return (h*(1-gate)+ramp*gate)*clamp((crossingDistance(x)-FRONT.crossingHalfWidth)/FRONT.crossingSlope);
}
export const SURFACE = TERRAIN_BANDS.map(band => TERRAIN_X.map(x => ({x, y:band.row===undefined?0:profileHeight(x,band.d,band.row), z:band.z+(band.row===undefined?0:trenchOffset(x,band.row))})));

// Sample the SAME two triangles rendered and used by Rapier, including ramp shoulders.
// Analytic bilinear heights would disagree with triangular collision at these joins.
function triangleHeight(a,b,c,x,z) {
  const det=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
  const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/det;
  const v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/det;
  return u*a.y+v*b.y+(1-u-v)*c.y;
}
export function terrainHeight(x,z) {
  if(Math.abs(x)>=MAP.HALF || Math.abs(z)>=MAP.HALF)return 0;
  let lo=0,hi=TERRAIN_X.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(TERRAIN_X[mid]<=x)lo=mid;else hi=mid;}
  const t=(x-TERRAIN_X[lo])/(TERRAIN_X[hi]-TERRAIN_X[lo]);
  let band=0;
  while(band<SURFACE.length-2 && z>SURFACE[band+1][lo].z*(1-t)+SURFACE[band+1][hi].z*t)band++;
  const a=SURFACE[band][lo],b=SURFACE[band][hi],c=SURFACE[band+1][lo],d=SURFACE[band+1][hi];
  return z<=b.z*t+c.z*(1-t) ? triangleHeight(a,c,b,x,z) : triangleHeight(b,c,d,x,z);
}

// Low reinforced lips follow every bend, with real openings at ramps and causeways.
export const COVER_SEGMENTS = [];
for(let i=0;i<TERRAIN_X.length-1;i++) {
  const a=TERRAIN_X[i],b=TERRAIN_X[i+1],x=(a+b)/2;
  if(Math.abs(x)>=frontage || crossingDistance(x)<FRONT.crossingHalfWidth+FRONT.crossingSlope || rampDistance(x)<FRONT.rampHalfWidth+FRONT.rampShoulder)continue;
  for(let rowIndex=0;rowIndex<FRONT.rows.length;rowIndex++) {
    const row=FRONT.rows[rowIndex],profile=rowProfile(rowIndex);
    const za=trenchOffset(a,rowIndex),zb=trenchOffset(b,rowIndex);
    for(const edge of [-profile.halfWidth-0.29,profile.halfWidth+0.09]) {
      COVER_SEGMENTS.push({x,z:row+(za+zb)/2+edge,width:Math.hypot(b-a,zb-za),rotation:-Math.atan2(zb-za,b-a)});
    }
  }
}

// Diagram-style dog-legged communication trenches. The two front systems stay
// separated by No Man's Land; links branch from support lines into paired bays.
export const COMMUNICATION_SEGMENTS=[];
function addPolyline(points) {
  for(let i=0;i<points.length-1;i++) {
    const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z;
    COMMUNICATION_SEGMENTS.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,width:Math.hypot(dx,dz),rotation:-Math.atan2(dz,dx)});
  }
}
for(const [rear,support,front] of [[0,1,2]]) {
  const towardFront=Math.sign(FRONT.rows[front]-FRONT.rows[support]);
  for(const anchor of [-45,0,45]) {
    const rearZ=trenchCenter(rear,anchor),supportZ=trenchCenter(support,anchor);
    addPolyline([
      {x:anchor,z:rearZ},
      {x:anchor+(anchor===0?5:-Math.sign(anchor)*4),z:(rearZ+supportZ)/2},
      {x:anchor,z:supportZ},
    ]);
    const junction={x:anchor,z:supportZ+towardFront*5.5};
    addPolyline([{x:anchor,z:supportZ},junction]);
    for(const branch of [-1,1]) {
      const mouthX=anchor+branch*7.5;
      addPolyline([junction,{x:mouthX-branch*2.5,z:junction.z+towardFront*4.5},{x:mouthX,z:trenchCenter(front,mouthX)}]);
    }
  }
}

// Wooden duckboards line every trench floor so soldiers aren't standing in mud.
export const DUCKBOARDS=[];
const plankSpacing=1.3;
for(let rowIndex=0;rowIndex<FRONT.rows.length;rowIndex++) {
  const profile=rowProfile(rowIndex);
  const floorEnd=Math.min(FRONT.floorRear,profile.halfWidth-0.25);
  const floorCenter=(FRONT.floorFront+floorEnd)/2;
  const floorWidth=floorEnd-FRONT.floorFront;
  for(let x=-frontage+plankSpacing/2;x<=frontage;x+=plankSpacing) {
    if(crossingDistance(x)<FRONT.crossingHalfWidth+FRONT.crossingSlope||
       rampDistance(x)<FRONT.rampHalfWidth+FRONT.rampShoulder)continue;
    const z=trenchCenter(rowIndex,x)+floorCenter;
    const dz=trenchOffset(x+0.5,rowIndex)-trenchOffset(x-0.5,rowIndex);
    DUCKBOARDS.push({x,z,width:floorWidth,rotation:-Math.atan2(dz,1),depth:profile.depth});
  }
}

// Large rear firing pits echo the artillery boxes shown behind the support line.
export const ARTILLERY_BAYS=[];
for(const row of [0]) {
  const outward=Math.sign(FRONT.rows[row]);
  for(const x of [-34,0,34]) ARTILLERY_BAYS.push({x,z:FRONT.rows[row]+outward*5.2,width:11,depth:6.5});
}