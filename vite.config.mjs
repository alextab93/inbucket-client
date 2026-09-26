import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(import.meta.dirname, 'frontend'),
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: [resolve(import.meta.dirname, 'frontend/src/test/setup.ts')],
    testTimeout: 10000,
  },
  build: {
    outDir: resolve(import.meta.dirname, 'public'),
    emptyOutDir: true,
    sourcemap: false,
  },
})
