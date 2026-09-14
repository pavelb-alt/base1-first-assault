// Engine switch — this one line decides which flavor the game runs on.
//
//   2D (Phaser, default):                     export { default } from '@/game/2d/Game';
//   3D (React Three Fiber + drei + rapier):   export { default } from '@/game/3d/Game';
//
// Both flavors honor the same contract: the default export is a React
// component <Game onReady={(handle) => ...}> that renders the running game
// into GameContainer's #game-container div, calls onReady once the engine is
// live, and emits 'current-scene-ready' on the EventBus once the scene is.
// Only the flavor imported here ends up in the production bundle.
export { default } from '@/game/2d/Game';
