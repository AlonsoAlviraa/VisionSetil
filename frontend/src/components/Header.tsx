/** App header with brand, nav, theme, language switcher and safety badge. */
import { useEffect, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './LanguageSwitcher'

const THEME_KEY = 'visionsetil_theme'

export function Header() {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems = [
    { to: '/', label: t('nav.home'), icon: '🏠' },
    { to: '/identificar', label: t('nav.identify'), icon: '🔍' },
    { to: '/enciclopedia', label: t('nav.encyclopedia'), icon: '📚' },
    { to: '/mapa', label: t('nav.map'), icon: '🗺️' },
    { to: '/educacion', label: t('nav.education'), icon: '🎓' },
  ]

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial = saved ?? (prefersDark ? 'dark' : 'light')
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem(THEME_KEY, next)
  }

  return (
    <header className={`header ${scrolled ? 'header--scrolled' : ''}`}>
      <div className="header-top">
        <Link to="/" className="header-brand" onClick={() => setMenuOpen(false)}>
          <span className="header-logo" role="img" aria-label="Seta">
            🍄
          </span>
          <div className="header-brand-text">
            <h1>{t('app.name')}</h1>
            <p className="subtitle">{t('app.tagline')}</p>
          </div>
        </Link>
        <div className="header-actions">
          <LanguageSwitcher />
          <button
            className="btn-icon"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? t('actions.darkMode') : t('actions.lightMode')}
            title={theme === 'light' ? t('actions.darkMode') : t('actions.lightMode')}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button
            className="btn-icon btn-menu-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={t('actions.menu')}
            title={t('actions.menu')}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      <nav className={`header-nav ${menuOpen ? 'header-nav--open' : ''}`}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
            onClick={() => setMenuOpen(false)}
            end={item.to === '/'}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {!scrolled && (
        <div className="header-badge">
          <span className="badge-icon">🔬</span>
          <span>
            {t('app.poweredBy')} · {new Date().getFullYear()}
          </span>
        </div>
      )}
    </header>
  )
}
