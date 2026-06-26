import path from 'path'
import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts on purpose: Vite 8 (rolldown) and the Vite
// that Vitest bundles ship incompatible plugin types, so we don't share the
// plugin array. Tests don't need the React/Tailwind plugins — Vitest transforms
// JSX with esbuild. This file is not part of the `tsc -b` build.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
