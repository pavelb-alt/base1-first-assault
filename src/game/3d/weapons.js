// Single friendly rifle, inspected GLB geometry: grip block at the model origin,
// barrel along local +Z, muzzle cap ends at z=1.55 (bore centre y≈0.30).
// No yaw correction is needed because the socket's forward is already +Z.
export const WEAPONS = {
  rifle: {
    url: 'https://media.base44.com/files/public/6aad7caf1cfd574f0bf92f13/2f473a8fd_ae6d985d8_orange-soldier-rifle.glb',
    scale: 1.5, grip: [0,0,0], muzzle: [0,.30,1.55], correction: [0,0,0],
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
// Actual rigid animated hierarchy: Torso > UpperArm_R > Forearm_R > Hand_R.
// Palm centre between the thumb and curled fingers; no character reparenting.
export const HAND_SOCKET = { node: 'Hand_R', position: [.02,-.14,.055] };
export const AIM = { distance: 160, minDistance: .001, flashTime: .07 };