import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  envDir: false,
  plugins: [react()],
  server: {
    host: process.env.VITE_DEV_HOST ?? '127.0.0.1',
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/health': { target: apiTarget, changeOrigin: true },
    },
  },
})
