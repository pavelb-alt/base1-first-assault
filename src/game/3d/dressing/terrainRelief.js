import * as THREE from 'three';
import { FRONT, MAP, BATTLEFIELD_DETAIL } from '@/game/config';
import { trenchCenter, crossingDistance } from '@/game/3d/trenchShape';
import { dressingNoise } from '@/game/3d/dressing/dressingNoise';

const smooth = v => { const t = Math.max(0, Math.min(1, v)); return t*t*(3-2*t); };
const phase = dressingNoise(72001) * Math.PI * 2;
export function reliefHeight(x, z) {
  // Preserve trench walls, ramps, causeways, map seams and all rear spawn areas.
  let mask = smooth((MAP.HALF - Math.max(Math.abs(x), Math.abs(z))) / 5);
  mask *= smooth((crossingDistance(x) - FRONT.crossingHalfWidth - FRONT.crossingSlope) / 3);
  mask *= smooth((56 - Math.abs(z)) / 9);
  for (let row = 0; row < FRONT.rows.length; row++) {
    mask *= smooth((Math.abs(z - trenchCenter(row,x)) - FRONT.rampReach - 1) / 4);
    mask *= smooth((Math.abs(z + trenchCenter(row,x)) - FRONT.rampReach - 1) / 4);
  }
  const wave = Math.sin(x*.17 + phase)*Math.cos(z*.21 - phase)*.68 + Math.sin(x*.31 + z*.24 + phase)*.32;
  return wave * mask * BATTLEFIELD_DETAIL.reliefAmplitude;
}

// Tessellate ONLY visible flat earth. Original geometry remains the physics surface.
export function createReliefGeometry(source) {
  const p = source.getAttribute('position'), c = source.getAttribute('color'), f = source.getAttribute('dressingFlat');
  const positions=[], colors=[], flat=[], relief=[], baseY=[];
  function append(a,b,c0, color, isFlat, depth=0) {
    const edge = (v,w) => (v[0]-w[0])**2 + (v[2]-w[2])**2;
    const edges = [edge(a,b),edge(b,c0),edge(c0,a)];
    const max = Math.max(...edges);
    if(isFlat && max > BATTLEFIELD_DETAIL.reliefTriangleSize**2 && depth < 12) {
      const i=edges.indexOf(max), v=[a,b,c0], start=v[i],end=v[(i+1)%3],other=v[(i+2)%3];
      const mid=start.map((n,k)=>(n+end[k])/2);
      append(start,mid,other,color,isFlat,depth+1);append(mid,end,other,color,isFlat,depth+1);return;
    }
    for(const v of [a,b,c0]) {
      const h=isFlat?reliefHeight(v[0],v[2]):0;
      positions.push(v[0],v[1]+h,v[2]);baseY.push(v[1]);relief.push(h);
      // Colour modulation also reaches the baked-albedo branch of the ground shader.
      colors.push(...color);flat.push(isFlat?1:0);
    }
  }
  for(let i=0;i<p.count;i+=3) {
    const v=k=>[p.getX(k),p.getY(k),p.getZ(k)];
    append(v(i),v(i+1),v(i+2),[c.getX(i),c.getY(i),c.getZ(i)],f.getX(i)>0.5);
  }
  const result=new THREE.BufferGeometry();
  result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  result.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  result.setAttribute('dressingFlat',new THREE.Float32BufferAttribute(flat,1));
  result.setAttribute('dressingRelief',new THREE.Float32BufferAttribute(relief,1));
  result.userData.baseY=baseY;
  result.computeVertexNormals();result.computeBoundingSphere();
  return result;
}
export function setReliefLevel(geometry, level) {
  const p=geometry.getAttribute('position'),r=geometry.getAttribute('dressingRelief');
  for(let i=0;i<p.count;i++)p.setY(i,geometry.userData.baseY[i]+(level===5?0:r.getX(i)));
  p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
}