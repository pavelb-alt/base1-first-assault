import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from '@/game/3d/world';
import { input } from '@/game/3d/input';
import { cameraAim, fireShot, clearShot } from '@/game/3d/ballistics';
import { COMBAT } from '@/game/config';

// The sentry's carbine and muzzle are authored under Hand_R. Never attach a
// second gun or overwrite the authored arm animation with the old rifle pose.
export function useWeaponAttachment(character, weaponId, entryRef, leaseId, active = true, visualFrame) {
  const rig = useMemo(() => {
    const hand = character.getObjectByName('Hand_R');
    const muzzle = character.getObjectByName('Muzzle');
    const model = character.getObjectByName('Carbine');
    if (!hand || !muzzle || !model) throw new Error('Sentry is missing Hand_R, Carbine or Muzzle');
    return { hand, muzzle, model, integrated: true,
      aim: new THREE.Vector3(), origin: new THREE.Vector3(), chest: new THREE.Vector3() };
  }, [character]);

  useEffect(() => {
    const entry = entryRef.current;
    if (entry) { entry.weapon = rig; entry.weaponId = weaponId; }
    return () => { if (entry?.weapon === rig) entry.weapon = null; };
  }, [rig, weaponId, entryRef, leaseId, active]);

  useFrame(({ camera }, delta) => {
    const entry = entryRef.current;
    if (!entry?.alive) return;
    if (gameState.paused) return;
    const cooldown = entry.profile?.cooldown ?? COMBAT.attackCooldown;
    entry.cooldown = Math.max(-cooldown, (entry.cooldown || 0) - delta);
    const possessed = gameState.mode === 'third_person' && gameState.possessedSoldierId === entry.id;
    const target = entry.aiTarget;
    // Always solve the actual muzzle on shot frames; idle/carry posing follows
    // the visual budget, while possessed aiming remains full-rate.
    if (!possessed && visualFrame && !visualFrame.current && !(target?.alive && entry.cooldown <= 0)) return;
    if (possessed) cameraAim(camera, entry, rig.aim);
    else if (target?.alive && target.bodyRef.current) {
      const p = target.bodyRef.current.translation();
      rig.aim.set(p.x, p.y + target.aimHeight, p.z);
    }

    // Update the complete parent chain after movement and the animation mixer;
    // both NPC and possessed shots use the real, animated world-space muzzle.
    rig.muzzle.updateWorldMatrix(true, false);
    rig.muzzle.getWorldPosition(rig.origin);
    entry.aimPoint = rig.aim;
    const wantsShot = possessed ? input.mouseDown : !!target?.alive;
    if (!wantsShot) { entry.cooldown = 0; return; }
    if (entry.cooldown > 0) return;
    if (!possessed && !clearShot(entry,rig.origin,rig.aim)) { entry.blockedSightline=true; return; }
    entry.blockedSightline=false;
    const bodyPos = entry.bodyRef.current.translation();
    rig.chest.set(bodyPos.x, bodyPos.y + entry.aimHeight, bodyPos.z);
    if (fireShot(entry, rig.origin, rig.aim, rig.chest, possessed)) {
      entry.cooldown = Math.max(0, entry.cooldown + cooldown);
    }
  });
}