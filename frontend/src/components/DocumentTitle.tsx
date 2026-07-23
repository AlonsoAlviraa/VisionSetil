import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const ROUTE_KEYS: Record<string, string> = {
  '/': 'nav.home',
  '/identificar': 'nav.identify',
  '/enciclopedia': 'nav.encyclopedia',
  '/mapa': 'nav.map',
  '/educacion': 'nav.education',
}

export function DocumentTitle() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  useEffect(() => {
    const key =
      Object.entries(ROUTE_KEYS).find(([path]) =>
        path === '/' ? pathname === '/' : pathname.startsWith(path),
      )?.[1] || 'app.name'
    const page = t(key)
    document.title = `${page} · ${t('app.name')}`
  }, [pathname, t])

  return null
}
