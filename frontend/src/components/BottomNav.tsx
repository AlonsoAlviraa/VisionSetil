/** Mobile bottom nav — Option B Campo nocturno product shell. */
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const tabs = [
  { to: '/', end: true, labelKey: 'nav.home', fallback: 'Inicio', testId: 'bottom-nav-home' },
  {
    to: '/identificar',
    labelKey: 'nav.identify',
    fallback: 'Identificar',
    testId: 'bottom-nav-identify',
    primary: true,
  },
  {
    to: '/juegos',
    labelKey: 'nav.games',
    fallback: 'Juegos',
    testId: 'bottom-nav-games',
    match: (p: string) =>
      p.startsWith('/juegos') ||
      p.startsWith('/setadle') ||
      p.startsWith('/wordle') ||
      p.startsWith('/reto'),
  },
  {
    to: '/enciclopedia',
    labelKey: 'nav.encyclopedia',
    fallback: 'Enciclopedia',
    testId: 'bottom-nav-ency',
    match: (p: string) => p.startsWith('/enciclopedia'),
  },
  {
    to: '/mas',
    labelKey: 'nav.more',
    fallback: 'Más',
    testId: 'bottom-nav-more',
    match: (p: string) =>
      p.startsWith('/mas') ||
      p.startsWith('/mapa') ||
      p.startsWith('/educacion') ||
      p.startsWith('/lookalikes') ||
      p.startsWith('/historial') ||
      p.startsWith('/offline') ||
      p.startsWith('/comunidad') ||
      p.startsWith('/revision') ||
      p.startsWith('/ml') ||
      p.startsWith('/beta') ||
      p.startsWith('/login') ||
      p.startsWith('/registro'),
  },
] as const

export function BottomNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  return (
    <nav
      className="bottom-nav"
      data-testid="bottom-nav"
      aria-label={t('nav.bottomAria', { defaultValue: 'Navegación principal' })}
    >
      {tabs.map((tab) => {
        const matchFn = 'match' in tab ? tab.match : undefined
        const active = matchFn
          ? matchFn(pathname)
          : tab.end
            ? pathname === tab.to
            : pathname.startsWith(tab.to)
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={'end' in tab ? tab.end : false}
            data-testid={tab.testId}
            className={() =>
              [
                'bottom-nav__item',
                'primary' in tab && tab.primary ? 'bottom-nav__item--primary' : '',
                active ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')
            }
            aria-current={active ? 'page' : undefined}
          >
            <span className="bottom-nav__dot" aria-hidden="true" />
            <span className="bottom-nav__label">
              {t(tab.labelKey, { defaultValue: tab.fallback })}
            </span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export default BottomNav
