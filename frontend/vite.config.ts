import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  cacheDir:
    process.env.NEXORA_API_URL === 'http://127.0.0.1:8011'
      ? 'node_modules/.vite-e2e'
      : 'node_modules/.vite-dev',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'nexora-dev-identity',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== '/__nexora_dev') return next()
          response.setHeader('Content-Type', 'application/json')
          response.setHeader('Cache-Control', 'no-store')
          response.end(JSON.stringify({ application: 'nexora-pos', kind: 'vite-development' }))
        })
      },
    },
  ],
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
