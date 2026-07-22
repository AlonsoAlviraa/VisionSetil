import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'VisionSetil — Identificación de setas',
        short_name: 'VisionSetil',
        description: 'Identificación de setas con IA y validación experta',
        theme_color: '#2d5016',
        background_color: '#1a1a1a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'es',
        categories: ['education', 'lifestyle'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /^https:\/\/upload\.wikimedia\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wiki-fungi-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /^https:\/\/(.*\.)?inaturalist\.(org|open-data\.s3\.amazonaws\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'inat-fungi-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 14,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Community photos + observation uploads served by FastAPI StaticFiles
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/'))
            return 'react-vendor'
          if (id.includes('node_modules/react-router')) return 'router'
          if (id.includes('node_modules/framer-motion')) return 'motion'
          if (id.includes('node_modules/leaflet') || id.includes('react-leaflet')) return 'map'
          if (id.includes('speciesPhotos.json')) return 'species-photos'
          if (id.includes('speciesCatalog.json')) return 'species-catalog'
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  test: {
    globals: true,
    // Pure unit tests (step-up helpers, geometry, risk labels) run in Node.
    // jsdom@29 is ESM-only and breaks vitest CJS require (ERR_REQUIRE_ESM).
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['src/test/setupCatalog.ts'],
  },
})