/** Bottom nav — Stitch B Campo nocturno (5 tabs). */
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
  icon: string
}

const tabs: BottomTab[] = [
  {
    to: '/',
    end: true,
    labelKey: 'nav.home',
    fallback: 'Inicio',
    testId: 'bottom-nav-home',
    icon: 'home',
  },
  {
    to: '/identificar',
    labelKey: 'nav.identify',
    fallback: 'Identificar',
    testId: 'bottom-nav-identify',
    primary: true,
    icon: 'center_focus',
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
    icon: 'sports_esports',
  },
  {
    to: '/enciclopedia',
    labelKey: 'nav.encyclopedia',
    fallback: 'Enciclopedia',
    testId: 'bottom-nav-ency',
    match: (p) => p.startsWith('/enciclopedia'),
    icon: 'menu_book',
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
    icon: 'apps',
  },
]

function isTabActive(tab: BottomTab, pathname: string): boolean {
  if (tab.match) return tab.match(pathname)
  if (tab.end) return pathname === tab.to
  return pathname.startsWith(tab.to)
}

function TabIcon({ name }: { name: string }) {
  // Minimal inline icons (no emoji) — Stitch-like glyphs
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
        </svg>
      )
    case 'center_focus':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
        </svg>
      )
    case 'sports_esports':
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="10" rx="3" />
          <path d="M8 13h2M9 12v2M15 12.5h.01M17.5 12.5h.01" />
        </svg>
      )
    case 'menu_book':
      return (
        <svg {...common}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5z" />
          <path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="18" cy="6" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="6" cy="18" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="18" cy="18" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      )
  }
}

export function BottomNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  return (
    <nav
      className="cn-bottom-nav"
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
                'cn-bottom-nav__item',
                tab.primary ? 'cn-bottom-nav__item--primary' : '',
                active ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')
            }
            aria-current={active ? 'page' : undefined}
          >
            <span className="cn-bottom-nav__icon" aria-hidden="true">
              <TabIcon name={tab.icon} />
            </span>
            <span className="cn-bottom-nav__label">
              {t(tab.labelKey, { defaultValue: tab.fallback })}
            </span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export default BottomNav
