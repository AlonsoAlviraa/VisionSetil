import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/**
 * All product routes → i18n title keys (longest prefix match).
 * N4: complete coverage for dual-shell product + ops routes.
 */
const ROUTE_KEYS: Array<[string, string, string?]> = [
  // [path prefix, title key, optional description key]
  ['/enciclopedia/', 'nav.encyclopedia', 'detail.documentDescription'],
  ['/enciclopedia', 'nav.encyclopedia', 'encyclopedia.documentDescription'],
  ['/setadle/wordle', 'nav.wordle', 'wordle.documentDescription'],
  ['/setadle/', 'nav.setadle', 'setadle.documentDescription'],
  ['/setadle', 'nav.setadle', 'setadle.documentDescription'],
  ['/identificar', 'nav.identify', 'identify.documentDescription'],
  ['/historial', 'nav.notebook', 'notebook.documentDescription'],
  ['/revision-experta', 'nav.experts', 'expert.documentDescription'],
  ['/comunidad', 'nav.community', 'community.documentDescription'],
  ['/login', 'nav.login', 'auth.documentDescription'],
  ['/registro', 'nav.register', 'auth.documentDescription'],
  ['/mapa', 'nav.map', 'map.documentDescription'],
  ['/educacion', 'nav.education', 'education.documentDescription'],
  ['/offline', 'nav.offline', 'offline.documentDescription'],
  ['/lookalikes', 'nav.lookalikes', 'lookalike.documentDescription'],
  ['/juegos', 'nav.games', 'games.documentDescription'],
  ['/mas', 'nav.more', 'more.documentDescription'],
  ['/reto', 'nav.quiz', 'quiz.documentDescription'],
  ['/wordle', 'nav.wordle', 'wordle.documentDescription'],
  ['/ml', 'nav.ml', 'ml.documentDescription'],
  ['/beta-feedback', 'nav.betaFeedback', 'betaFeedback.documentDescription'],
  ['/', 'nav.home', 'home.documentDescription'],
]

/** Paths registered in App.tsx (for audit / tests). Longest-prefix match still uses ROUTE_KEYS. */
export const APP_ROUTE_PREFIXES = [
  '/',
  '/identificar',
  '/historial',
  '/revision-experta',
  '/comunidad',
  '/login',
  '/registro',
  '/enciclopedia',
  '/mapa',
  '/educacion',
  '/offline',
  '/lookalikes',
  '/juegos',
  '/mas',
  '/reto',
  '/setadle',
  '/wordle',
  '/ml',
  '/beta-feedback',
] as const

function ensureMetaDescription(content: string) {
  if (typeof document === 'undefined') return
  let el = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', 'description')
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export function DocumentTitle() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  useEffect(() => {
    const match = ROUTE_KEYS.find(([path]) =>
      path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path),
    )
    // Stray paths hit App `*` → not-found title (avoid inheriting home via `/` prefix)
    const key = match?.[1] || 'nav.notFound'
    const descKey = match?.[2]
    const page = t(key, {
      defaultValue:
        key === 'nav.notFound'
          ? 'No encontrado'
          : key
              .replace(/^nav\./, '')
              .replace(/([A-Z])/g, ' $1')
              .replace(/^\w/, (c) => c.toUpperCase()),
    })
    const brand = t('app.name', { defaultValue: 'VisionSetil' })
    document.title = `${page} · ${brand}`

    const description = t(descKey || 'app.defaultDescription', {
      defaultValue:
        'Orientación de campo micológica. Multi-vista, open-set y enciclopedia — nunca permiso de consumo.',
    })
    ensureMetaDescription(description)
  }, [pathname, t])

  return null
}
