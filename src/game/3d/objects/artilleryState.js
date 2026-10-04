import * as THREE from 'three';
import { ARTILLERY } from '@/game/config';

// Shared live state: delivery ships push spawns, guns launch pooled shells,
// ArtilleryShells flies them and applies splash damage on landing.
export const artilleryState = {
  pendingSpawns: [],
  nextId: 0,
  shells: Array.from({ length: ARTILLERY.maxShells }, () => ({
    active: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), apex: 0, shooter: null,
  })),
  cursor: 0,
  shellsFired: 0,
  impacts: 0,
  reset() {
    this.pendingSpawns.length = 0;
    this.nextId = 0;
    for (const s of this.shells) { s.active = false; s.shooter = null; }
    this.cursor = 0; this.shellsFired = 0; this.impacts = 0;
  },
};

export function launchShell(shooter, from, to, player = false) {
  const shell = artilleryState.shells.find(s => !s.active);
  if (!shell) return false;
  shell.active = true; shell.t = 0; shell.shooter = shooter; shell.player = player;
  shell.from.copy(from); shell.to.copy(to);
  shell.apex = ARTILLERY.shellApex * Math.min(1, from.distanceTo(to) / 50 + 0.35);
  artilleryState.shellsFired++;
  return true;
}