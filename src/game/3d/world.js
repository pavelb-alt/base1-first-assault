import * as THREE from 'three';
import { SOLDIER } from '@/game/config';

// Authoritative game state — module scope, read/written by useFrame callbacks
// and the React overlay. NEVER put per-frame gameplay state in React useState.
export const gameState = {
  paused: false,
  mode: 'strategic',            // 'strategic' | 'third_person'
  selectedSoldierId: null,     // ID of selected friendly soldier in strategic mode
  possessedSoldierId: null,    // ID of possessed friendly soldier in third-person mode
  soldierPosition: new THREE.Vector3(...SOLDIER.spawnPosition),
  cameraYaw: 0,                // current third-person camera yaw
  loaded: false,               // model finished loading
  error: null,                 // model load error message
};