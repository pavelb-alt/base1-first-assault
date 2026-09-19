import * as THREE from 'three';
import { MAP, FRONT, BASES, DRESSING } from '@/game/config';
import { trenchCenter } from '@/game/3d/trenchShape';
import { walkRoute, firingPosition } from '@/game/3d/terrain';

// Indexed visual noise never consumes the battle's seeded random stream.
export function dressingNoise(index) {
  const n = Math.sin((index + DRESSING.seed) * 127.1) * 43758.5453;
  return n - Math.floor(n);
}
let texture;
export function groundTexture() {
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = DRESSING.textureSize;
  const ctx = canvas.getContext('2d');
  const size = canvas.width, unit = size / MAP.SIZE;
  const point = (x,z) => [(x + MAP.HALF) * unit, (z + MAP.HALF) * unit];
  ctx.fillStyle = MAP.GROUND_COLOR; ctx.fillRect(0,0,size,size);
  function stain(x,z,rx,rz,color,alpha,angle=0) {
    const [u,v] = point(x,z);
    ctx.save(); ctx.translate(u,v); ctx.rotate(angle); ctx.scale(rx*unit,rz*unit);
    const gradient=ctx.createRadialGradient(0,0,0.1,0,0,1);
    gradient.addColorStop(0,color); gradient.addColorStop(0.65,color); gradient.addColorStop(1,`${color}00`);
    ctx.globalAlpha=alpha; ctx.fillStyle=gradient; ctx.fillRect(-1,-1,2,2); ctx.restore();
  }
  // Broad, irregular color islands rather than a grid of noise or grass props.
  for(let i=0;i<95;i++) {
    const x=(dressingNoise(i*7)-0.5)*MAP.SIZE, z=(dressingNoise(i*7+1)-0.5)*MAP.SIZE;
    stain(x,z,5+dressingNoise(i*7+2)*24,3+dressingNoise(i*7+3)*12,
      i%7===0?DRESSING.olive:i%3===0?DRESSING.earth:DRESSING.sand,
      i%7===0?0.32:0.28,dressingNoise(i*7+4)*Math.PI);
  }
  function path(points,width,alpha,color) {
    ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width*unit;ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    points.forEach((p,i)=>{const [x,z]=point(p.x,p.z);if(i)ctx.lineTo(x,z);else ctx.moveTo(x,z);});ctx.stroke();ctx.restore();
  }
  // Paint the SAME routes navigation already uses, with no navigation edits.
  for(let section=0;section<FRONT.sectionCenters.length;section++) {
    let start={x:FRONT.sectionCenters[section],z:FRONT.spawnZ};
    for(let row=0;row<FRONT.rows.length;row++) {
      const end=firingPosition(row,section,0), route=[start,...walkRoute(start,end)];
      path(route,3.4,0.16,DRESSING.worn);path(route,1.45,0.24,DRESSING.worn);
      start=end;
    }
  }
  // Existing giant crossing corridors, worn more faintly than the entry ramps.
  for(const x of FRONT.crossings) path([{x,z:-FRONT.spawnZ},{x,z:FRONT.spawnZ}],2.4,0.10,DRESSING.worn);
  // Marks are strictly albedo: no decal planes bridging trenches, height or cover.
  for(let i=0;i<33;i++) {
    const x=(dressingNoise(1000+i*5)-0.5)*MAP.SIZE*.84,z=(dressingNoise(1001+i*5)-0.5)*MAP.SIZE*.77;
    if(FRONT.rows.some((_,row)=>Math.abs(z-trenchCenter(row,x))<FRONT.rampReach+4))continue;
    const r=1.3+dressingNoise(1002+i*5)*3.2;
    stain(x,z,r*1.8,r,DRESSING.scorch,0.28,dressingNoise(1003+i*5)*Math.PI);
    if(i%3===0) {
      const [u,v]=point(x,z);ctx.save();ctx.translate(u,v);ctx.rotate(dressingNoise(i+1700)*3);
      ctx.strokeStyle=DRESSING.earth;ctx.globalAlpha=.32;ctx.lineWidth=.32*unit;
      ctx.beginPath();ctx.ellipse(0,0,r*unit,r*.7*unit,0,0,Math.PI*2);ctx.stroke();ctx.restore();
      stain(x,z,r*.7,r*.45,DRESSING.scorch,.16);
    }
  }
  for(const base of [BASES.friendly,BASES.enemy]) {
    const [x,,z]=base.position;
    stain(x,z,13,10,DRESSING.worn,.22);
  }
  // Subtle fine grain is baked once, not an animated shader or another draw call.
  const image=ctx.getImageData(0,0,size,size);
  for(let i=0;i<image.data.length;i+=4) {
    const grain=(dressingNoise(i/4+5000)-.5)*5;
    image.data[i]+=grain;image.data[i+1]+=grain;image.data[i+2]+=grain;
  }
  ctx.putImageData(image,0,0);
  texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  texture.name='Baked earth, route wear and flat battle scars';
  return texture;
}

export function createGroundMaterial() {
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96});
  material.onBeforeCompile=shader=>{
    shader.uniforms.dressingMap={value:groundTexture()};
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute float dressingFlat;
      varying vec2 vDressingUv;
      varying float vDressingFlat;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
      vDressingUv = vec2((position.x + ${MAP.HALF.toFixed(1)}) / ${MAP.SIZE.toFixed(1)}, 1.0 - (position.z + ${MAP.HALF.toFixed(1)}) / ${MAP.SIZE.toFixed(1)});
      vDressingFlat = dressingFlat;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform sampler2D dressingMap;
      varying vec2 vDressingUv;
      varying float vDressingFlat;`)
      .replace('#include <color_fragment>',`#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(dressingMap,vDressingUv).rgb, vDressingFlat);`);
  };
  material.customProgramCacheKey=()=> 'battlefield-albedo-v1';
  return material;
}