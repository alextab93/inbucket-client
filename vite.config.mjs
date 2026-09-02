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
  },
  build: {
    outDir: resolve(import.meta.dirname, 'public'),
    emptyOutDir: true,
    sourcemap: false,
  },
})
