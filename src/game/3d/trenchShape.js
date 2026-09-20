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
  const t = (x + frontage) / FRONT.zigLength;
  const n = Math.floor(t), f = t - n;
  return (n % 2 === 0 ? 1 - 2*f : -1 + 2*f) * rowProfile(row).zigAmplitude;
}
export const trenchCenter = (row, x) => FRONT.rows[row] + trenchOffset(x,row);
export const crossingDistance = x => Math.min(...FRONT.crossings.map(c => Math.abs(c-x)));
export const rampDistance = x => Math.min(...FRONT.sectionCenters.map(c => Math.abs(c-x)));
export const ZIG_X = Array.from({length:Math.round(2*frontage/FRONT.zigLength)+1},(_,i) => -frontage+i*FRONT.zigLength);
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

// Dog-legged communication trenches visually connect the main and support lines.
export const COMMUNICATION_SEGMENTS=[];
const connectorColumns=[[-56.25,-11.25,33.75],[-33.75,11.25,56.25]];
for(let row=0;row<FRONT.rows.length-1;row++) {
  for(const anchor of connectorColumns[row%2]) {
    const start={x:anchor,z:trenchCenter(row,anchor)};
    const end={x:anchor,z:trenchCenter(row+1,anchor)};
    const mid=(start.z+end.z)/2;
    const points=[start,{x:anchor+(row%2?4:-4),z:start.z+(mid-start.z)*0.48},{x:anchor+(row%2?-3:3),z:mid+(end.z-mid)*0.52},end];
    for(let i=0;i<points.length-1;i++) {
      const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z;
      COMMUNICATION_SEGMENTS.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,width:Math.hypot(dx,dz),rotation:-Math.atan2(dz,dx)});
    }
  }
}