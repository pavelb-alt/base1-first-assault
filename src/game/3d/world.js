import * as THREE from 'three';
import { SOLDIER } from '@/game/config';

// Authoritative game state — module scope, read/written by useFrame callbacks
// and the React overlay. NEVER put per-frame gameplay state in React useState.
export const gameState = {
  mode: 'strategic',        // 'strategic' | 'third_person'
  selected: false,         // soldier selected in strategic view
  soldierPosition: new THREE.Vector3(...SOLDIER.spawnPosition),
  cameraYaw: 0,            // current third-person camera yaw
  loaded: false,           // model finished loading
  error: null,             // model load error message
};