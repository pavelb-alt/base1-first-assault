**Welcome to your Base44 game** 

**About**

View and Edit your game on [Base44.com](http://Base44.com) 

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

Any change pushed to the repo will also be reflected in the Base44 Builder.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=your_backend_url

e.g.
VITE_BASE44_APP_ID=cbef744a8545c389ef439ea6
VITE_BASE44_APP_BASE_URL=https://my-to-do-list-81bfaad7.base44.app
```

Run the app: `npm run dev`

**Game layer — 2D or 3D**

This template ships two game flavors. 2D is active by default and mounted on `/`. The 3D flavor lives in `src/game/3d` and adds zero bytes to the bundle until you switch to it. Both starters are intentionally minimal: add scenes, assets, and React UI only when building a specific game.

- `src/game/main.js` is the engine switch: a single re-export line that decides which flavor runs. To build a 3D game, change it to `export { default } from '@/game/3d/Game';` — nothing else changes.
- Both flavors honor the same contract: the engine module default-exports a React component `Game({ onReady })` that renders the running game inside `GameContainer`'s `#game-container` div, calls `onReady(handle)` once the engine is live and emits `current-scene-ready` on the EventBus once the scene is ready. `GameContainer`'s ref exposes `{ game, scene }` built from these.
- 2D gameplay goes in scenes under `src/game/2d/scenes`. 3D gameplay goes in components under `src/game/3d/scenes`, rendered inside the single persistent canvas in `src/game/3d/Game.jsx` — keep that one canvas mounted for the app's life (remounting canvases leaks WebGL contexts) and put per-frame logic in the engine's frame loop.
- `src/components/game/GameContainer.jsx` is the React mount and works with either flavor. The game page in `src/pages/GamePage.jsx` should stay focused on rendering it.
- React/Base44 bootstrapping stays in `src/main.jsx` and `src/App.jsx`.
- Base44 auth, SDK setup, query client, and UI components stay in `src/lib`, `src/api`, and `src/components/ui`.

React and the game communicate through `src/game/EventBus.js` (engine-agnostic). Keep Base44 data loading, auth, and navigation in React; keep frame-by-frame gameplay, scenes, input, and sprite/mesh logic in the game scenes. Note: flipping the engine switch while the dev server runs may trigger a full page reload instead of a hot update — that's expected.

**Publish your changes**

Open [Base44.com](http://Base44.com) and click on Publish.

**Docs & Support**

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)
