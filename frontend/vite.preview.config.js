import { defineConfig } from 'vite'

/**
 * Minimal config for `vite preview` in production (Docker runtime stage).
 * Uses .js (not .ts) so Vite doesn't need to bundle it = no temp file
 * written to /app/ (which the non-root `node` user can't write to).
 */
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5184'

export default defineConfig({
  preview: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
    host: true,
    port: 4173,
    allowedHosts: true,
  },
})
