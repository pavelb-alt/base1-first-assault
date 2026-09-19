import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { WEAPONS, HAND_SOCKET, AIM } from '@/game/3d/weapons';
import { gameState } from '@/game/3d/world';
import { input } from '@/game/3d/input';
import { cameraAim, fireShot } from '@/game/3d/ballistics';
import { COMBAT } from '@/game/config';
import { createWeaponPose, poseWeaponArm, orientWeaponWrist } from '@/game/3d/objects/WeaponPose';

Object.values(WEAPONS).forEach(w => useGLTF.preload(w.url));
const flashGeometry = new THREE.ConeGeometry(.045, .15, 6);
flashGeometry.rotateX(-Math.PI / 2);
const flashMaterial = new THREE.MeshBasicMaterial({ color: '#ffe6a0', toneMapped: false });
const zero = new THREE.Vector3();

// Parent uses the existing animated clone. Attach to Hand_R without rebuilding its rig.
export function useWeaponAttachment(character, weaponId, entryRef) {
  const config = WEAPONS[weaponId];
  const { scene } = useGLTF(config.url);
  const rig = useMemo(() => {
    const hand = character.getObjectByName(HAND_SOCKET.node);
    if (!hand) throw new Error('Orange Guardian is missing Hand_R');
    const pose = createWeaponPose(character, hand);
    const socket = new THREE.Group(); socket.name = 'WeaponSocket';
    socket.position.fromArray(HAND_SOCKET.position);
    socket.quaternion.copy(pose.socketRotation);
    const correction = new THREE.Group(); correction.rotation.fromArray(config.correction);
    correction.scale.setScalar(config.scale);
    const model = scene.clone(true); // Includes ALL magazine/scope descendants; cached geometry/materials.
    model.position.fromArray(config.grip).negate();
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const muzzle = new THREE.Object3D(); muzzle.name = 'Muzzle'; muzzle.position.fromArray(config.muzzle);
    model.add(muzzle); correction.add(model); socket.add(correction);
    const flash = new THREE.Mesh(flashGeometry, flashMaterial); flash.visible = false;
    flash.position.z = -.05; muzzle.add(flash);
    return { hand, socket, muzzle, flash, pose, model, aim: new THREE.Vector3(), origin: new THREE.Vector3(),
      grip: new THREE.Vector3(), chest: new THREE.Vector3(), dir: new THREE.Vector3(), parentQ: new THREE.Quaternion(),
      desiredQ: new THREE.Quaternion(), offsetQ: new THREE.Quaternion(), matrix: new THREE.Matrix4(),
      up: new THREE.Vector3(0,1,0), forward: new THREE.Vector3(0,0,1), worldScale: new THREE.Vector3(),
      localMuzzle: new THREE.Vector3(...config.muzzle).sub(new THREE.Vector3(...config.grip)).applyEuler(correction.rotation).multiplyScalar(config.scale),
      offset: new THREE.Vector3(), flashTime: 0 };
  }, [character, config, scene]);

  useEffect(() => {
    rig.hand.add(rig.socket);
    const entry = entryRef.current;
    if (entry) { entry.weapon = rig; entry.weaponId = weaponId; }
    return () => { rig.hand.remove(rig.socket); rig.pose.restore(); if (entry?.weapon === rig) entry.weapon = null; };
  }, [rig, weaponId, entryRef]);

  useFrame(({ camera }, delta) => {
    const entry = entryRef.current;
    if (!entry?.alive) { rig.flash.visible = false; return; }
    rig.flashTime = Math.max(0, rig.flashTime - delta); rig.flash.visible = rig.flashTime > 0;
    if (gameState.paused) return;
    entry.cooldown = Math.max(0, (entry.cooldown || 0) - delta);
    const possessed = gameState.mode === 'third_person' && gameState.possessedSoldierId === entry.id;
    const target = entry.aiTarget;
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
    if (!wantsShot || entry.cooldown > 0) return;
    const bodyPos = entry.bodyRef.current.translation();
    rig.chest.set(bodyPos.x, bodyPos.y + entry.aimHeight, bodyPos.z);
    if (fireShot(entry, rig.origin, rig.aim, rig.chest, possessed)) {
      entry.cooldown = COMBAT.attackCooldown;
      rig.flashTime = AIM.flashTime; rig.flash.visible = true;
    }
  });
}