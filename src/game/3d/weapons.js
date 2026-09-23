// Orange Sentry carries its own carbine, parented to Hand_R. No separate weapon GLB.
// The barrel runs along Hand_R local +X with the sight up along local +Y; the
// socket basis maps the aim solver's (+Z forward, +Y up) frame onto that.
export const WEAPONS = {
  carbine: {
    builtIn: true, muzzleNode: 'Muzzle',
    socketBasis: [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
export const HAND_SOCKET = { node: 'Hand_R', position: [0, 0, 0] };
export const AIM = { distance: 160, minDistance: .001, flashTime: .07 };