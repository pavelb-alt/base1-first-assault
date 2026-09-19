// Kenney Blaster Kit (CC0), inspected GLB geometry. Textures embedded on import.
// Source: https://kenney.nl/assets/blaster-kit
// All ten inspected barrels face local -Z, but origins/grips/muzzles differ.
const root = 'https://base44.app/api/apps/6aad7caf1cfd574f0bf92f13/files/mp/public/6aad7caf1cfd574f0bf92f13/';
export const WEAPONS = {
  a: { url: root+'bd9372a9f_blaster-a.glb', scale: .75, grip: [0,-.17,.21], muzzle: [0,.07955,-.37], correction: [0,Math.PI,0] },
  b: { url: root+'70e456216_blaster-b.glb', scale: 1, grip: [0,-.115,.085], muzzle: [0,.01318,-.2601], correction: [0,Math.PI,0] },
  c: { url: root+'139794607_blaster-c.glb', scale: .9, grip: [0,-.09,.17], muzzle: [0,.017,-.23768], correction: [0,Math.PI,0] },
  d: { url: root+'1994ffb23_blaster-d.glb', scale: .7, grip: [0,-.085,.175], muzzle: [0,.05665,-.45394], correction: [0,Math.PI,0] },
  e: { url: root+'0f45fa416_blaster-e.glb', scale: .55, grip: [-.045,-.1,1.015], muzzle: [-.045,.03,0], correction: [0,Math.PI,0] },
  f: { url: root+'f0b0a55ec_blaster-f.glb', scale: .58, grip: [-.006,-.095,.375], muzzle: [0,.0525,-.655], correction: [0,Math.PI,0] },
  g: { url: root+'c73fff878_blaster-g.glb', scale: .75, grip: [0,-.10,.278], muzzle: [0,.11395,-.34811], correction: [0,Math.PI,0] },
  h: { url: root+'190468ac0_blaster-h.glb', scale: .85, grip: [0,-.08,.22], muzzle: [0,.07175,-.324], correction: [0,Math.PI,0] },
  i: { url: root+'e7d9e50b2_blaster-i.glb', scale: .85, grip: [0,-.10,.025], muzzle: [0,.05,-.26], correction: [0,Math.PI,0] },
  j: { url: root+'125fcbd0d_blaster-j.glb', scale: .8, grip: [0,-.055,.24], muzzle: [0,.09376,-.305], correction: [0,Math.PI,0] },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
// Actual rigid animated hierarchy: Torso > UpperArm_R > Forearm_R > Hand_R.
// Palm centre between the thumb and curled fingers; no character reparenting.
export const HAND_SOCKET = { node: 'Hand_R', position: [.02,-.14,.055] };
export const AIM = { distance: 160, minDistance: .001, flashTime: .07, poolSize: 50 };