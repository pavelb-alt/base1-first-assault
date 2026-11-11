// Display names / palette shared by combat overlays.
export const UNIT_NAMES = {
  soldier: 'Rifleman',
  quadshell: 'Quadshell',
  spider403: 'Spider-403',
  eyedrone: 'Eye Drone',
  trilobite: 'Trilobite',
  tank: 'Tank',
  artillery: 'Artillery',
  tower: 'Tower',
};
export const unitName = type => UNIT_NAMES[type] ?? (type ? type[0].toUpperCase() + type.slice(1) : 'Unknown');

// Enemy types worth announcing when allies (not the player) kill them.
export const NOTABLE_ENEMIES = new Set(['trilobite']);
// Friendly losses worth announcing.
export const NOTABLE_FRIENDLY = new Set(['tank', 'artillery']);

export const WEAPON_TAGS = { soldier: 'RIFLE', tank: 'TANK', artillery: 'ARTY', tower: 'TURRET', orbital: 'ORBITAL',
  'tower-mg': 'MG TURRET', 'tower-cannon': 'CANNON TURRET', 'tower-frost': 'FROST TURRET' };

export const COLORS = {
  accent: '#f59e0b',
  accentSoft: '#fde68a',
  friendly: '#5eead4',
  enemy: '#f87171',
  white: '#fafaf9',
};
