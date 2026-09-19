import { FRONT } from '@/game/config';
const cells = new Map();
let last = -Infinity;
export function resetSpatial() { cells.clear(); last = -Infinity; }
export function updateSpatial(units, time) {
  if (time >= last && time - last < FRONT.spatialInterval) return;
  last = time;
  // Reuse bucket arrays; this grid remains bounded by the finite map.
  for (const bucket of cells.values()) bucket.length = 0;
  for (const u of units) {
    if (!u.alive || !u.bodyRef.current) continue;
    const p = u.bodyRef.current.translation();
    const key = `${Math.floor(p.x/FRONT.spatialCell)},${Math.floor(p.z/FRONT.spatialCell)}`;
    let bucket = cells.get(key);
    if (!bucket) { bucket = []; cells.set(key,bucket); }
    bucket.push(u);
  }
}
export function visitNearby(x,z,radius,visit) {
  const size=FRONT.spatialCell, r2=radius*radius;
  for(let ix=Math.floor((x-radius)/size);ix<=Math.floor((x+radius)/size);ix++) {
    for(let iz=Math.floor((z-radius)/size);iz<=Math.floor((z+radius)/size);iz++) {
      const bucket=cells.get(`${ix},${iz}`);
      if(!bucket)continue;
      for(const u of bucket) {
        if(!u.alive || !u.bodyRef.current)continue;
        const p=u.bodyRef.current.translation();
        const d2=(p.x-x)**2+(p.z-z)**2;
        if(d2<=r2)visit(u,p,d2);
      }
    }
  }
}