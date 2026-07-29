/** Mobile bottom nav — Option B Campo nocturno product shell. */
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

type BottomTab = {
  to: string
  labelKey: string
  fallback: string
  testId: string
  end?: boolean
  primary?: boolean
  match?: (pathname: string) => boolean
}

const tabs: BottomTab[] = [
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
    match: (p) =>
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
    match: (p) => p.startsWith('/enciclopedia'),
  },
  {
    to: '/mas',
    labelKey: 'nav.more',
    fallback: 'Más',
    testId: 'bottom-nav-more',
    match: (p) =>
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
]

function isTabActive(tab: BottomTab, pathname: string): boolean {
  if (tab.match) return tab.match(pathname)
  if (tab.end) return pathname === tab.to
  return pathname.startsWith(tab.to)
}

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
        const active = isTabActive(tab, pathname)
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={Boolean(tab.end)}
            data-testid={tab.testId}
            className={() =>
              [
                'bottom-nav__item',
                tab.primary ? 'bottom-nav__item--primary' : '',
                active ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')
            }
            aria-current={active ? 'page' : undefined}
          >
            <span className="bottom-nav__icon" aria-hidden="true">
              {tab.to === '/'
                ? '⌂'
                : tab.to === '/identificar'
                  ? '◎'
                  : tab.to === '/juegos'
                    ? '✦'
                    : tab.to === '/enciclopedia'
                      ? '☰'
                      : '···'}
            </span>
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
