import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  cacheDir:
    process.env.NEXORA_API_URL === 'http://127.0.0.1:8011'
      ? 'node_modules/.vite-e2e'
      : 'node_modules/.vite-dev',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.NEXORA_API_URL ?? 'http://127.0.0.1:8001',
        changeOrigin: false,
      },
      '/sanctum': {
        target: process.env.NEXORA_API_URL ?? 'http://127.0.0.1:8001',
        changeOrigin: false,
      },
    },
  },
})
