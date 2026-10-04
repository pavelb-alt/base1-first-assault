import * as THREE from 'three';
import { SOLDIER } from '@/game/config';

// Authoritative game state — module scope, read/written by useFrame callbacks
// and the React overlay. NEVER put per-frame gameplay state in React useState.
export const gameState = {
  paused: false,
  mode: 'strategic',            // 'strategic' | 'third_person'
  selectedSoldierId: null,     // ID of selected friendly soldier in strategic mode
  controlledStation: null,    // { type: 'tank' | 'artillery' | 'tower', id }
  possessedSoldierId: null,    // ID of possessed friendly soldier in third-person mode
  soldierPosition: new THREE.Vector3(...SOLDIER.spawnPosition),
  cameraYaw: 0,                // current third-person camera yaw
  loaded: false,               // model finished loading
  error: null,                 // model load error message
  preparing: false,            // opening-flow handoff: physics runs, player input blocked
  transitioning: false,       // smooth camera transition between strategic and third-person
  currentLevel: 1,             // 1=day, 2=night — drives atmosphere and wave difficulty
};