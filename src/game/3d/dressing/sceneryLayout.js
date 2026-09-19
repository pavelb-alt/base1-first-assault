import { MAP, BASES, DRESSING } from '@/game/config';
import { dressingNoise } from '@/game/3d/dressing/groundAppearance';

// All meshes use unit bounds (radius 0.5). Conservative spherical bounds keep
// even tilted beams and dishes OUTSIDE the existing physical map boundary.
export const SCENERY = { rock:[], box:[], cylinder:[], dish:[] };
function add(type,position,scale,color,rotation=[0,0,0]) {
  const radius=Math.hypot(...scale)/2;
  if(Math.abs(position[0])-radius<=MAP.HALF+3 && Math.abs(position[2])-radius<=MAP.HALF+3)return;
  SCENERY[type].push({position,scale,color,rotation});
}
const clusters=[[-164,-112],[-171,-24],[-164,64],[-177,124],[164,-123],[174,-8],[165,87],[111,169],[-97,-172]];
clusters.forEach(([x,z],i)=>{
  for(let j=0;j<8;j++) {
    const n=2000+i*100+j*8, sx=1.4+dressingNoise(n)*3.5, sy=.6+dressingNoise(n+1)*2;
    const px=x+(dressingNoise(n+2)-.5)*13,pz=z+(dressingNoise(n+3)-.5)*17;
    add('rock',[px,sy*.35,pz],[sx,sy,1.4+dressingNoise(n+4)*3.5],j%3?DRESSING.rock:DRESSING.earth,[.12,dressingNoise(n+5)*6.28,.12]);
    if(j<3)add('box',[px+2,.5,pz+3],[.8,1.3,3+dressingNoise(n+6)*3],DRESSING.rust,[.12,dressingNoise(n+7)*4,.3]);
  }
});
function beam(x,y,z,sx,sy,sz,color=DRESSING.steel,rotation=[0,0,0]) {add('box',[x,y,z],[sx,sy,sz],color,rotation);}
function tank(x,z,height,color) {
  add('cylinder',[x,height/2,z],[5,height,5],DRESSING.steel);
  add('cylinder',[x,height*.72,z],[5.1,.65,5.1],color);
  beam(x+.4,height+.6,z,.65,1.6,.65,DRESSING.rust,[0,0,.25]);
}
// West: damaged relay dish, East: broken industrial gantry — different silhouettes.
beam(-164,3,18,1.6,6,1.6,DRESSING.steel,[0,0,.13]);
beam(-165,.4,18,7,.8,7,DRESSING.rust);
add('dish',[-163,6.3,18],[7,2.2,7],'#a3a797',[.5,0,-.2]);
beam(-163,7.4,18,.2,3,.2,DRESSING.steel,[.5,0,-.2]);
for(const z of [-73,-57])beam(165,3.5,z,2,7,2);
beam(165,7,-70,2,1,9,DRESSING.rust,[.14,0,0]);
beam(166,2,-60,1,6,1,DRESSING.steel,[.4,0,.4]);
// Base surroundings sit BEHIND the out-of-bounds line, never on spawn exits.
const friendlyRear=BASES.friendly.position[2]+29;
const enemyRear=BASES.enemy.position[2]-30;
beam(-23,2.2,friendlyRear,13,4.4,8);
beam(-23,4.7,friendlyRear,14,.65,9,DRESSING.rust);
beam(-23,3.8,friendlyRear-4.1,11,.65,.25,DRESSING.friendly);
beam(-23,1.6,friendlyRear-4.1,5,3.1,.25,'#414c48');
beam(-29,2.2,friendlyRear-4.2,.4,4,.3,DRESSING.friendly);
beam(24,3.3,friendlyRear,1,6.6,1);
beam(24,5.8,friendlyRear,7,.5,.65,DRESSING.friendly);
add('dish',[24,6.7,friendlyRear],[3.5,1.2,3.5],DRESSING.rust,[.35,0,0]);
tank(-23,enemyRear,7,DRESSING.enemy);tank(-30,enemyRear-3,4.5,DRESSING.enemy);
beam(26,2.5,enemyRear,10,5,7);
beam(26,4,enemyRear+3.6,8,.75,.3,DRESSING.enemy);
beam(22,6,enemyRear,1.2,5,1.2,DRESSING.rust,[0,0,.12]);
beam(29,5,enemyRear-1,1.2,3,1.2);