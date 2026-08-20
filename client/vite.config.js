import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = path.dirname(fileURLToPath(import.meta.url))
const sharedDir = path.resolve(clientRoot, '..', 'shared')

// The canonical survey definition lives outside the Vite root (../shared/survey.json).
// `resolve.alias` lets us `import survey from '@shared/survey.json'` and
// `server.fs.allow` lets the dev server read it.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': sharedDir
    }
  },
  server: {
    port: 5173,
    strictPort: false,
    fs: {
      allow: [clientRoot, sharedDir]
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
})
