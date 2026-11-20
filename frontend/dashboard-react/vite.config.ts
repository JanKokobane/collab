import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const frontendRoot = fileURLToPath(new URL('..', import.meta.url))
const dashboardRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ command }) => ({
  root: command === 'serve' ? frontendRoot : dashboardRoot,
  base: command === 'serve' ? '/' : './',
  plugins: [react()],
  resolve: {
    alias: {
      '@collab/firebase': fileURLToPath(new URL('../firebase.js', import.meta.url)),
    },
  },
  server: {
    open: '/dashboard-react/',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}))
