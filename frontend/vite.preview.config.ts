import { defineConfig } from 'vite'

/**
 * Minimal config for `vite preview` in production (Docker runtime stage).
 * The full vite.config.ts imports vitest/config + dev plugins (react,
 * tailwindcss) which aren't needed when serving the already-built dist/.
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
