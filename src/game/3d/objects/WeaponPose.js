import * as THREE from 'three';
import { HAND_SOCKET } from '@/game/3d/weapons';

// This model's curled fingers run across local X, not local Y. The handle
// must run through that fist axis, while the barrel follows local -Y.
export function createWeaponPose(character, hand) {
  const upper = character.getObjectByName('UpperArm_R');
  const forearm = character.getObjectByName('Forearm_R');
  const socketRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0),
  ));
  const upperRest = upper.quaternion.clone();
  const forearmRest = forearm.quaternion.clone();
  const handRest = hand.quaternion.clone();
  return {
    character, upper, forearm, hand, socketRotation,
    inverseSocket: socketRotation.clone().invert(),
    // Bring the elbow alongside the torso; bend the forearm forward.
    shoulder: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, 0, -Math.atan2(forearm.position.x, -forearm.position.y))),
    wristAxis: hand.position.clone().normalize(),
    wristOffset: new THREE.Vector3(...HAND_SOCKET.position).applyQuaternion(socketRotation.clone().invert()),
    facing: new THREE.Vector3(), direction: new THREE.Vector3(), wrist: new THREE.Vector3(),
    parentQ: new THREE.Quaternion(), worldQ: new THREE.Quaternion(),
    restore() { upper.quaternion.copy(upperRest); forearm.quaternion.copy(forearmRest); hand.quaternion.copy(handRest); },
  };
}

export function poseWeaponArm(pose, aim, tracking) {
  const { character, upper, forearm, hand } = pose;
  // Body facing, not the swinging arm animation, defines the carry direction.
  character.parent.getWorldQuaternion(pose.worldQ);
  pose.facing.set(0, 0, 1).applyQuaternion(pose.worldQ).normalize();
  upper.quaternion.copy(pose.shoulder);
  forearm.updateWorldMatrix(true, false);
  forearm.getWorldPosition(pose.wrist);
  if (tracking) pose.direction.subVectors(aim, pose.wrist).normalize();
  else pose.direction.copy(pose.facing);
  upper.getWorldQuaternion(pose.parentQ).invert();
  pose.direction.applyQuaternion(pose.parentQ);
  forearm.quaternion.setFromUnitVectors(pose.wristAxis, pose.direction);
  hand.updateWorldMatrix(true, false);
  hand.getWorldPosition(pose.wrist);
  if (!tracking) aim.copy(pose.wrist).addScaledVector(pose.facing, 160);
}

export function orientWeaponWrist(pose, gunWorldQuaternion) {
  // Rotate the actual fist with its fixed socket — never swivel a gun through
  // an animated palm. Arm/hand positions and the original hierarchy stay intact.
  pose.hand.parent.getWorldQuaternion(pose.parentQ).invert();
  pose.hand.quaternion.copy(pose.parentQ).multiply(gunWorldQuaternion).multiply(pose.inverseSocket);
  pose.hand.updateWorldMatrix(false, true);
}