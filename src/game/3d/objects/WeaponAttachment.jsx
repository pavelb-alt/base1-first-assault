import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HAND_SOCKET } from '@/game/3d/weapons';
import { gameState } from '@/game/3d/world';
import { input } from '@/game/3d/input';
import { cameraAim, fireShot, clearShot } from '@/game/3d/ballistics';
import { COMBAT } from '@/game/config';
import { createWeaponPose, poseWeaponArm, orientWeaponWrist } from '@/game/3d/objects/WeaponPose';

const zero = new THREE.Vector3();

// Bind the carbine already in the soldier GLB; never attach a second weapon.
export function useWeaponAttachment(character, weaponId, entryRef, leaseId, active = true, visualFrame) {
  const rig = useMemo(() => {
    const hand = character.getObjectByName(HAND_SOCKET.node);
    const muzzle = character.getObjectByName('Muzzle');
    const socket = character.getObjectByName('Carbine');
    if (!hand || muzzle?.parent !== hand || socket?.parent !== hand) {
      throw new Error('Orange Sentry requires its built-in Carbine and Muzzle under Hand_R');
    }
    const pose = createWeaponPose(character, hand);
    // Carbine local +X is its barrel axis. Express the existing wrist/parallax
    // solver in that frame, using the authored muzzle offset instead of a rifle offset.
    pose.socketRotation.copy(socket.quaternion).multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
    );
    pose.inverseSocket.copy(pose.socketRotation).invert();
    pose.wristOffset.set(0, 0, 0);
    return { hand, socket, muzzle, pose, embedded: true, barrelAxis: new THREE.Vector3(1, 0, 0),
      aim: new THREE.Vector3(), origin: new THREE.Vector3(), chest: new THREE.Vector3(),
      dir: new THREE.Vector3(), desiredQ: new THREE.Quaternion(), offsetQ: new THREE.Quaternion(),
      matrix: new THREE.Matrix4(), up: new THREE.Vector3(0, 1, 0), forward: new THREE.Vector3(0, 0, 1),
      worldScale: new THREE.Vector3(), localMuzzle: muzzle.position.clone().applyQuaternion(pose.inverseSocket),
      offset: new THREE.Vector3() };
  }, [character]);

  useEffect(() => {
    const entry = entryRef.current;
    if (entry) { entry.weapon = rig; entry.weaponId = weaponId; }
    return () => { rig.pose.restore(); if (entry?.weapon === rig) entry.weapon = null; };
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

    // Layer an armed right-arm pose after the animation mixer. Walking, jumping,
    // torso and left-arm animations are untouched; the fist keeps its handle.
    poseWeaponArm(rig.pose, rig.aim, possessed || !!(target?.alive && target.bodyRef.current));
    rig.hand.getWorldScale(rig.worldScale);
    // Solve parallax about the WRIST pivot, including the fixed fist-to-grip
    // offset. Rotating the fist now also rotates the muzzle and grip together.
    rig.offset.copy(rig.localMuzzle).add(rig.pose.wristOffset).multiply(rig.worldScale);
    rig.dir.subVectors(rig.aim, rig.pose.wrist);
    if (rig.dir.lengthSq() < .000001) return;
    rig.matrix.lookAt(rig.dir, zero, rig.up);
    rig.desiredQ.setFromRotationMatrix(rig.matrix);
    const forwardDistance = Math.sqrt(Math.max(0, rig.dir.lengthSq() - rig.offset.x ** 2 - rig.offset.y ** 2));
    if (forwardDistance > rig.offset.z + .001) {
      rig.offset.z = forwardDistance;
      rig.offsetQ.setFromUnitVectors(rig.offset.normalize(), rig.forward);
      rig.desiredQ.multiply(rig.offsetQ);
    }
    // Inside-barrel targets use the wrist direction; clearance still blocks flight.
    orientWeaponWrist(rig.pose, rig.desiredQ);
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