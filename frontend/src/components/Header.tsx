/** App header with brand, premium navigation bar, theme toggle and safety badge. */
import { useEffect, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'

const THEME_KEY = 'visionsetil_theme'

const navItems = [
  { to: '/', label: 'Inicio', icon: '🏠' },
  { to: '/identificar', label: 'Identificar', icon: '🔍' },
  { to: '/enciclopedia', label: 'Enciclopedia', icon: '📚' },
  { to: '/mapa', label: 'Mapa', icon: '🗺️' },
  { to: '/educacion', label: 'Aprende', icon: '🎓' },
]

export function Header() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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
            <h1>VisionSetil</h1>
            <p className="subtitle">Tu guía inteligente del mundo de las setas</p>
          </div>
        </Link>
        <div className="header-actions">
          <button
            className="btn-icon"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
            title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button
            className="btn-icon btn-menu-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Abrir menú"
            title="Menú"
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
          <span>Powered by FungiCLEF 2025 · {new Date().getFullYear()}</span>
        </div>
      )}
    </header>
  )
}