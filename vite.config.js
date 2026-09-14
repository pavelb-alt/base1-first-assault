import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Set by both the Modal and Cloudflare sandbox providers.
const isRunningInSandbox = !!process.env.MODAL_SANDBOX_ID

// The Base44 editor embeds the sandbox dev server in an iframe.
const allowIframeEmbedding = {
  name: 'allow-iframe-embedding',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      res.setHeader('X-Frame-Options', 'ALLOWALL')
      res.setHeader('Content-Security-Policy', 'frame-ancestors *;')
      next()
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [
    react(),
    ...(isRunningInSandbox ? [allowIframeEmbedding] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  optimizeDeps: {
    // @react-three/rapier imports @dimforge/rapier3d-compat both statically and via
    // `await import()` (WASM init). Pre-bundling serves it from .vite/deps/rapier-*.js;
    // when the dev server re-optimizes (frequent under the sandbox's usePolling watcher)
    // the chunk rehashes and the in-flight dynamic import 504s ("Outdated Optimize Dep"),
    // so <Physics> never mounts. Excluding the rapier subgraph keeps it out of the
    // optimizer entirely — no hashed chunk exists to go stale. Dev-only; complements the
    // prod manualChunks 'physics' rule below.
    exclude: ['@react-three/rapier', '@dimforge/rapier3d-compat'],
  },
  ...(isRunningInSandbox && {
    server: {
      cors: true,
      host: '0.0.0.0', // Bind to all interfaces for container access
      port: 5173,
      strictPort: true,
      // Sandbox tunnel hostnames are dynamic, so no fixed host list works.
      allowedHosts: true,
      watch: {
        // Container filesystems don't deliver reliable FS events; poll instead.
        usePolling: true,
        interval: 100,
        // Wait for file writes to complete before triggering HMR.
        awaitWriteFinish: {
          stabilityThreshold: 150,
          pollInterval: 50,
        },
      },
    },
  }),
  build: {
    rollupOptions: {
      ...(isRunningInSandbox && {
        onwarn(warning, warn) {
          // The platform detects broken AI-written imports via build failure;
          // MISSING_EXPORT is only a warning by default.
          if (warning.code === 'UNRESOLVED_IMPORT' || warning.code === 'MISSING_EXPORT') {
            throw new Error(`Build failed: ${warning.message}`)
          }
          warn(warning)
        },
      }),
      output: {
        manualChunks(id) {
          // Only modules actually imported get chunked, so the unused
          // flavor (see src/game/main.js) adds nothing to the bundle.
          // eventemitter3 deliberately stays out of this chunk: quill and
          // recharts depend on it too (recharts via a nested copy), and
          // bundling it here would force their pages to download Phaser.
          if (/node_modules\/phaser\//.test(id)) return 'phaser';
          // Rapier inlines its WASM as base64 (~2 MB); isolate it in its own
          // chunk. Keep this test BEFORE the generic @react-three test below.
          if (/node_modules\/(@react-three\/rapier|@dimforge)\//.test(id)) return 'physics';
          // three.js + the R3F runtime (fiber/drei and their fiber-only deps).
          // scheduler is deliberately absent — react-dom also depends on it.
          if (/node_modules\/(three-stdlib|three|@react-three|react-reconciler|its-fine|zustand|suspend-react|react-use-measure)\//.test(id)) return 'three';
        }
      }
    }
  }
});
