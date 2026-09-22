// Shared artillery runtime: in-flight shells and pending impact blasts (visual).
export const artilleryState = {
  shells: [],   // { from:[x,y,z], to:[x,y,z], age, duration, apex, damage, shooterId }
  blasts: [],   // [x, y, z] explosion requests drained by BattlefieldExplosions
  impacts: 0,
  reset() { this.shells.length = 0; this.blasts.length = 0; this.impacts = 0; },
};