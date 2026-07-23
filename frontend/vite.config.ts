import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MEDIA_ROOT = path.resolve(__dirname, '../media')

/**
 * Stub size floors (Phase C / D-C1) — keep in sync with:
 * scripts/audit_media.py MIN_*_BYTES and backend species_media.MIN_BYTES_BY_VARIANT
 */
const MIN_BYTES_BY_VARIANT: Record<string, number> = {
  card: 8192,
  thumb: 1500,
  detail: 15000,
  lqip: 200,
}

let stubFallbackLogged = false

/**
 * Serve monorepo media/ at /media/* in dev so species photos work
 * even when FastAPI is down or the /api proxy fails.
 * Tiny/stub species assets are rewritten to risk placeholders (C-04).
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

  const placeholderKindFromRel = (rel: string): string => {
    if (/deadly|mort|virosa|phalloides|proxima|filaris|brunneo/i.test(rel)) return 'deadly'
    if (/toxic|toxico|xanthoderma|omphalotus/i.test(rel)) return 'toxic'
    return 'default'
  }

  const variantFromRel = (rel: string): string | null => {
    const m = rel.match(/\/(thumb|card|detail|lqip)\.(webp|png)$/i)
    return m ? m[1].toLowerCase() : null
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
          // quality: ok | sibling_fallback | stub_fallback
          // MVP simplification: non-stub files use coarse "ok" (not ok_real/ok_procedural/legacy_unverified)
          let qualityHeader = 'ok'
          const isPlaceholderPath = rel.startsWith('placeholders/') || rel.includes('/placeholder/')
          const variant = variantFromRel(rel)
          const minBytes = variant ? MIN_BYTES_BY_VARIANT[variant] ?? 0 : 0

          const isUsable = (f: string | null, v: string | null): boolean => {
            if (!f || !fs.existsSync(f) || !fs.statSync(f).isFile()) return false
            const floor = v ? MIN_BYTES_BY_VARIANT[v] ?? 0 : 0
            if (floor > 0 && fs.statSync(f).size < floor) return false
            return true
          }

          const missing =
            !file || !fs.existsSync(file) || !fs.statSync(file).isFile()
          const tooSmall =
            !missing &&
            minBytes > 0 &&
            !isPlaceholderPath &&
            fs.statSync(file!).size < minBytes

          // Fallback chain: missing/tiny → sibling variants → brand placeholder
          if (missing || tooSmall) {
            if (isPlaceholderPath) {
              res.statusCode = 404
              res.end('placeholder missing')
              return
            }
            // Issue 1: thumb stub + good card → serve card body (sibling_fallback)
            const siblings =
              variant === 'thumb'
                ? ['card', 'detail']
                : variant === 'lqip'
                  ? ['thumb', 'card']
                  : variant === 'detail'
                    ? ['card']
                    : variant === 'card'
                      ? ['detail', 'thumb']
                      : []
            const slugMatch = rel.match(/^species\/([^/]+)\//)
            let usedSibling = false
            if (slugMatch) {
              const slug = slugMatch[1]
              for (const sib of siblings) {
                const sibRel = `species/${slug}/${sib}.webp`
                const sibFile = safeResolve(sibRel)
                if (isUsable(sibFile, sib)) {
                  file = sibFile
                  qualityHeader = 'sibling_fallback'
                  usedSibling = true
                  break
                }
              }
            }
            if (!usedSibling) {
              const kind = placeholderKindFromRel(rel)
              file = safeResolve(`placeholders/${kind}.webp`)
              qualityHeader = 'stub_fallback'
              if (!stubFallbackLogged) {
                stubFallbackLogged = true
                console.info(
                  `[serve-repo-media] stub/missing → placeholder (e.g. ${rel}); Cache-Control max-age=300`,
                )
              }
            }
          }
          if (!file || !fs.existsSync(file)) {
            res.statusCode = 404
            res.end('media not found')
            return
          }
          const ext = path.extname(file).toLowerCase()
          res.statusCode = 200
          res.setHeader('Content-Type', mime[ext] || 'application/octet-stream')
          // Short cache on rewrite so SW is not poisoned for 30d (D-C8)
          const shortCache = qualityHeader === 'stub_fallback' || qualityHeader === 'sibling_fallback'
          res.setHeader(
            'Cache-Control',
            shortCache ? 'public, max-age=300' : 'public, max-age=86400',
          )
          res.setHeader('X-Media-Quality', qualityHeader)
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
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // D-15/D-16: precache app shell; media stays runtime NetworkFirst
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
          // Species media: NetworkFirst so stub_fallback rewrites after rebuild are not stuck 30d (Issue 6)
          {
            urlPattern: /\/(?:api\/)?media\/species\/.+\.(webp|png|jpe?g)$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'species-media',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 800,
                maxAgeSeconds: 7 * 86400,
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
