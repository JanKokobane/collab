import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'https://collab-backup-backend.onrender.com',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'https://collab-backup-backend.onrender.com',
        changeOrigin: true,
        ws: true
      }
    }
  }
})
