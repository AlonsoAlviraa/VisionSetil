import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MEDIA_ROOT = path.resolve(__dirname, '../media')

/**
 * Serve monorepo media/ at /media/* in dev so species photos work
 * even when FastAPI is down or the /api proxy fails.
 */
function serveRepoMediaPlugin(): Plugin {
  const mime: Record<string, string> = {
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
  }

  const safeResolve = (rel: string): string | null => {
    const normalized = rel.replace(/^[/\\]+/, '').replace(/\\/g, '/')
    const file = path.resolve(MEDIA_ROOT, normalized)
    const root = path.resolve(MEDIA_ROOT)
    if (!file.toLowerCase().startsWith(root.toLowerCase() + path.sep) && file.toLowerCase() !== root.toLowerCase()) {
      return null
    }
    return file
  }

  return {
    name: 'serve-repo-media',
    configureServer(server) {
      // Register early so /media never falls through to SPA index.html
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/media/')) {
          next()
          return
        }
        try {
          const urlPath = decodeURIComponent(req.url.split('?')[0] || '')
          const rel = urlPath.slice('/media/'.length)
          // Gallery JSON only on FastAPI
          if (/^species\/[^/]+\/gallery\/?$/.test(rel)) {
            next()
            return
          }
          let file = safeResolve(rel)
          // Fallback: missing species card → brand placeholder
          if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            if (rel.includes('/placeholder/')) {
              res.statusCode = 404
              res.end('placeholder missing')
              return
            }
            const kind = /deadly|mort|virosa|phalloides|proxima|filaris|brunneo/i.test(rel)
              ? 'deadly'
              : /toxic|toxico|xanthoderma|omphalotus/i.test(rel)
                ? 'toxic'
                : 'default'
            file = safeResolve(`placeholders/${kind}.webp`)
          }
          if (!file || !fs.existsSync(file)) {
            res.statusCode = 404
            res.end('media not found')
            return
          }
          const ext = path.extname(file).toLowerCase()
          res.statusCode = 200
          res.setHeader('Content-Type', mime[ext] || 'application/octet-stream')
          res.setHeader('Cache-Control', 'public, max-age=86400')
          fs.createReadStream(file).pipe(res)
        } catch {
          res.statusCode = 500
          res.end('media error')
        }
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    serveRepoMediaPlugin(),
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webp,json}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          // Static /media and proxied /api/media
          {
            urlPattern: /\/(?:api\/)?media\/(species|placeholder)\/.+\.(webp|png|jpe?g)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'species-media',
              expiration: {
                maxEntries: 800,
                maxAgeSeconds: 30 * 86400,
              },
            },
          },
          {
            urlPattern: /\/(?:api\/)?media\/placeholder\/[a-z]+/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'species-media-placeholders',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 30 * 86400,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // API + gallery JSON need FastAPI (photos are served statically from media/)
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
