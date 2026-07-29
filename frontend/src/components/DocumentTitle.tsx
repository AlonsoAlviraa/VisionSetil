import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/** All product routes → i18n title keys (longest prefix match). */
const ROUTE_KEYS: Array<[string, string]> = [
  ['/enciclopedia/', 'nav.encyclopedia'],
  ['/enciclopedia', 'nav.encyclopedia'],
  ['/setadle/wordle', 'nav.wordle'],
  ['/setadle/', 'nav.setadle'],
  ['/setadle', 'nav.setadle'],
  ['/identificar', 'nav.identify'],
  ['/historial', 'nav.history'],
  ['/revision-experta', 'nav.expertReview'],
  ['/comunidad', 'nav.community'],
  ['/login', 'nav.login'],
  ['/registro', 'nav.register'],
  ['/mapa', 'nav.map'],
  ['/educacion', 'nav.education'],
  ['/offline', 'nav.offline'],
  ['/lookalikes', 'nav.lookalikes'],
  ['/juegos', 'nav.games'],
  ['/mas', 'nav.more'],
  ['/reto', 'nav.quiz'],
  ['/wordle', 'nav.wordle'],
  ['/ml', 'nav.ml'],
  ['/beta-feedback', 'nav.betaFeedback'],
  ['/', 'nav.home'],
]

export function DocumentTitle() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  useEffect(() => {
    const match = ROUTE_KEYS.find(([path]) =>
      path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path),
    )
    const key = match?.[1] || 'app.name'
    const page = t(key, {
      defaultValue: key
        .replace(/^nav\./, '')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^\w/, (c) => c.toUpperCase()),
    })
    document.title = `${page} · ${t('app.name', { defaultValue: 'VisionSetil' })}`
  }, [pathname, t])

  return null
}
