import { combat } from '@/game/3d/combat';
import { BALANCE } from '@/game/config';
import { visitNearby } from '@/game/3d/spatial';
import { steerAroundOutposts } from '@/game/3d/dressing/outpostLayout';

// Player input and NPC steering use exactly the same normalized ground speed.
// The optional cap only prevents NPCs overshooting their destination.
const movementVelocity = { x: 0, y: 0, z: 0 };
export function applyMovement(body, dx, dz, verticalVelocity, arrivalSpeed = BALANCE.moveSpeed, maxSpeed = BALANCE.moveSpeed) {
  const length = Math.hypot(dx, dz);
  const speed = Math.min(maxSpeed, arrivalSpeed);
  movementVelocity.x = length > 0 ? dx / length * speed : 0;
  movementVelocity.y = verticalVelocity;
  movementVelocity.z = length > 0 ? dz / length * speed : 0;
  body.setLinvel(movementVelocity, true);
}

export function isGrounded(entry) {
  const body=entry.bodyRef.current, ctx=combat.physics;
  if(!body || !ctx)return false;
  const p=body.translation();
  const ray=new ctx.rapier.Ray({x:p.x,y:p.y+(entry.footOffset||0)+0.15,z:p.z},{x:0,y:-1,z:0});
  return !!ctx.world.castRay(ray,0.35,true,undefined,undefined,undefined,body,
    collider=>!combat.byBody.has(collider.parent()?.handle));
}
export function stop(entry, flying=false) {
  const body=entry.bodyRef.current,p=body.translation(),v=body.linvel();
  body.setLinvel({x:0,y:flying?(entry.hoverHeight-p.y)*5:v.y,z:0},true);
}
export function moveToward(entry,target,delta,{flying=false,separate=true,avoidOutposts=true}={}) {
  const body=entry.bodyRef.current,p=body.translation(),v=body.linvel();
  if(!entry.outpostAvoidance)entry.outpostAvoidance={outpostId:null,phase:null};
  const destination=!flying&&avoidOutposts
    ? steerAroundOutposts(p,target,0.75,entry.outpostAvoidance,entry.id)
    : target;
  let dx=destination.x-p.x,dz=destination.z-p.z;
  const distance=Math.hypot(dx,dz);
  if(distance<0.45){
    if(destination!==target)return false;
    stop(entry,flying);return true;
  }
  dx/=distance;dz/=distance;
  if(separate)visitNearby(p.x,p.z,1.6,(u,q,d2)=>{
    if(u===entry || d2<0.01 || Math.abs(q.y-p.y)>1.3)return;
    const d=Math.sqrt(d2),weight=(1.6-d)*0.8;
    dx+=(p.x-q.x)/d*weight;dz+=(p.z-q.z)/d*weight;
  });
  applyMovement(body, dx, dz, flying ? (entry.hoverHeight-p.y)*5 : v.y,
    distance / Math.max(delta, 0.001), entry.moveSpeed ?? BALANCE.moveSpeed);
  entry.heading=Math.atan2(dx,dz);
  return false;
}
export function followRoute(entry,delta) {
  const nav=entry.nav;
  if(!nav.route || nav.index>=nav.route.length){stop(entry);return true;}
  if(moveToward(entry,nav.route[nav.index],delta))nav.index++;
  return nav.index>=nav.route.length;
}