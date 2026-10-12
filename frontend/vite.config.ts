import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Backend target for the /api proxy. Overridable via env so the same config
// works for local dev (backend on the host) and `vite preview` inside Docker
// (e.g. VITE_API_PROXY_TARGET=http://backend:5184).
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5184'

const apiProxy = {
  '/api': {
    target: apiTarget,
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Dev server proxy (`npm run dev`)
  server: {
    proxy: apiProxy,
  },
  // Preview server proxy — used by `vite preview`, which is what the frontend
  // Dockerfile serves with. Without this /api would 404 in Docker.
  preview: {
    proxy: apiProxy,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
