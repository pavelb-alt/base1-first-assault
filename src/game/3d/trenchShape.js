import { FRONT, MAP } from '@/game/config';

const clamp = v => Math.max(0, Math.min(1, v));
const sorted = values => [...new Set(values.map(v => Number(v.toFixed(4))))].sort((a,b) => a-b);
const frontage = MAP.HALF * 0.9;
export function trenchOffset(x) {
  const t = (x + frontage) / FRONT.zigLength;
  const n = Math.floor(t), f = t - n;
  return (n % 2 === 0 ? 1 - 2*f : -1 + 2*f) * FRONT.zigAmplitude;
}
export const trenchCenter = (row, x) => FRONT.rows[row] + trenchOffset(x);
export const crossingDistance = x => Math.min(...FRONT.crossings.map(c => Math.abs(c-x)));
export const rampDistance = x => Math.min(...FRONT.sectionCenters.map(c => Math.abs(c-x)));
export const ZIG_X = Array.from({length:Math.round(2*frontage/FRONT.zigLength)+1},(_,i) => -frontage+i*FRONT.zigLength);
export const TERRAIN_X = sorted([-MAP.HALF, MAP.HALF, ...ZIG_X,
  ...FRONT.crossings.flatMap(x => [-FRONT.crossingHalfWidth-FRONT.crossingSlope,-FRONT.crossingHalfWidth,0,FRONT.crossingHalfWidth,FRONT.crossingHalfWidth+FRONT.crossingSlope].map(d => x+d)),
  ...FRONT.sectionCenters.flatMap(x => [-FRONT.rampHalfWidth-FRONT.rampShoulder,-FRONT.rampHalfWidth,0,FRONT.rampHalfWidth,FRONT.rampHalfWidth+FRONT.rampShoulder].map(d => x+d))]);
const profileZ = [-FRONT.rampReach,-FRONT.halfWidth-0.2,-FRONT.halfWidth,FRONT.stepRear,FRONT.floorFront,FRONT.floorRear,FRONT.halfWidth,FRONT.rampReach];
export const TERRAIN_BANDS = [{z:-MAP.HALF}, ...FRONT.rows.flatMap((z,row) => profileZ.map(d => ({z:z+d,row,d}))).sort((a,b)=>a.z-b.z), {z:MAP.HALF}];

function profileHeight(x,d) {
  if (Math.abs(x) >= frontage) return 0;
  let h;
  if(d <= -FRONT.halfWidth) h = FRONT.firingFloor * clamp((d+FRONT.halfWidth+0.2)/0.2);
  else if(d <= FRONT.stepRear) h = FRONT.firingFloor;
  else if(d < FRONT.floorFront) h = FRONT.firingFloor + (-FRONT.depth-FRONT.firingFloor)*(d-FRONT.stepRear)/(FRONT.floorFront-FRONT.stepRear);
  else if(d <= FRONT.floorRear) h = -FRONT.depth;
  else h = -FRONT.depth*(1-clamp((d-FRONT.floorRear)/(FRONT.halfWidth-FRONT.floorRear)));
  // A continuous walkable ramp on BOTH sides of each entry; no curb at its mouth.
  const gate = 1-clamp((rampDistance(x)-FRONT.rampHalfWidth)/FRONT.rampShoulder);
  const ramp = d < FRONT.floorFront ? -FRONT.depth*clamp((d+FRONT.rampReach)/(FRONT.floorFront+FRONT.rampReach))
    : -FRONT.depth*(1-clamp((d-FRONT.floorRear)/(FRONT.rampReach-FRONT.floorRear)));
  return (h*(1-gate)+ramp*gate)*clamp((crossingDistance(x)-FRONT.crossingHalfWidth)/FRONT.crossingSlope);
}
export const SURFACE = TERRAIN_BANDS.map(band => TERRAIN_X.map(x => ({x, y:band.row===undefined?0:profileHeight(x,band.d), z:band.z+(band.row===undefined?0:trenchOffset(x))})));

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
  const za=trenchOffset(a),zb=trenchOffset(b);
  for(const row of FRONT.rows)for(const edge of [-FRONT.halfWidth-0.29,FRONT.halfWidth+0.09]) {
    COVER_SEGMENTS.push({x,z:row+(za+zb)/2+edge,width:Math.hypot(b-a,zb-za),rotation:-Math.atan2(zb-za,b-a)});
  }
}