import { DIRECT_CONTROL, MAP } from '@/game/config';
import { input } from '@/game/3d/input';
import { gameState } from '@/game/3d/world';
import { combat } from '@/game/3d/combat';
import { terrainHeight } from '@/game/3d/terrain';

// Camera-relative WASD uses exactly the soldier's +Z-forward/-X-right convention.
export function driveManually(entry, group, delta, speed) {
  const keys=input.keys, yaw=gameState.cameraYaw, p=entry.bodyRef.current.translation();
  const forward=Number(!!keys.KeyW)-Number(!!keys.KeyS), right=Number(!!keys.KeyD)-Number(!!keys.KeyA);
  let dx=Math.sin(yaw)*forward+DIRECT_CONTROL.rightX*Math.cos(yaw)*right;
  let dz=Math.cos(yaw)*forward+Math.sin(yaw)*right;
  const n=Math.hypot(dx,dz); if(!n) return;
  dx/=n; dz/=n;
  const step=speed*Math.min(delta,0.05), edge=MAP.HALF-DIRECT_CONTROL.vehicleMargin;
  const x=Math.max(-edge,Math.min(edge,p.x+dx*step)),z=Math.max(-edge,Math.min(edge,p.z+dz*step));
  const y=terrainHeight(x,z);
  if(Math.abs(y-terrainHeight(p.x,p.z))>DIRECT_CONTROL.maxStep) return;
  // Sweep the front and sides against static cover. Infantry are pushed by the real kinematic body.
  if(combat.physics) {
    const {world,rapier}=combat.physics;
    for(const side of [-1,0,1]) {
      const origin={x:p.x-dz*side*1.2,y:p.y+0.75,z:p.z+dx*side*1.2};
      const hit=world.castRay(new rapier.Ray(origin,{x:dx,y:0,z:dz}),step+1.9,true,undefined,undefined,undefined,entry.bodyRef.current,c=>!combat.byBody.has(c.parent()?.handle));
      if(hit) return;
    }
  }
  entry.bodyRef.current.setNextKinematicTranslation({x,y,z});
  entry.heading=Math.atan2(dx,dz); group.rotation.y=entry.heading;
}