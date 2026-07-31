/** Product header — premium bar + working Más menu (outside overflow clip).
 * Nav lists: lib/navConfig.ts (architecture M1). */
import { useEffect, useRef, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './LanguageSwitcher'
import { LayoutModeToggle } from './LayoutModeToggle'
import type { LayoutMode } from '../lib/layoutMode'
import {
  headerPrimaryNav,
  MORE_NAV_FLAT,
  MORE_NAV_GROUPS,
} from '../lib/navConfig'

const THEME_KEY = 'visionsetil_theme'
const primaryNav = headerPrimaryNav()
const moreNavGroups = MORE_NAV_GROUPS
const moreNav = MORE_NAV_FLAT

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}

function IconMenu({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={open ? 'is-open' : ''}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function LogoMark() {
  return (
    <span className="header-logo-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" className="header-logo-svg">
        <defs>
          <linearGradient id="vs-logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9dcea6" />
            <stop offset="55%" stopColor="#3f6b4a" />
            <stop offset="100%" stopColor="#1a2a22" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="12" fill="url(#vs-logo-g)" />
        <path
          d="M20 8c-1.2 4.5-4 7.2-7.5 9.2 3.8.4 6.6 2.2 8.2 5.3 1.4-3.2 4-5.2 7.6-5.8C24.5 14.5 21.6 11.8 20 8z"
          fill="#f7f4ed"
          opacity="0.95"
        />
        <path
          d="M20 22.5v9"
          stroke="#f7f4ed"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.9"
        />
        <circle cx="20" cy="20" r="11.5" fill="none" stroke="rgba(247,244,237,0.25)" strokeWidth="1" />
      </svg>
    </span>
  )
}

type HeaderProps = {
  layoutMode?: LayoutMode
  onLayoutModeChange?: (mode: LayoutMode) => void
}

export function Header({ layoutMode = 'app', onLayoutModeChange }: HeaderProps = {}) {
  const { t } = useTranslation()
  const { user, isAuthenticated, logout, loading } = useAuth()
  const location = useLocation()
  // Stitch B remodel: always dark product chrome
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  const moreActive = moreNav.some(
    (item) =>
      location.pathname === item.to || location.pathname.startsWith(item.to + '/'),
  )

  useEffect(() => {
    // Force Campo nocturno (Stitch B) — product is night UI
    const initial = 'dark'
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
    document.documentElement.dataset.skin = 'campo-nocturno'
    localStorage.setItem(THEME_KEY, initial)
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMoreOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!moreOpen) return
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem(THEME_KEY, next)
  }

  const closeAll = () => {
    setMenuOpen(false)
    setMoreOpen(false)
  }

  const morePanel = moreOpen && (
    <div className="nav-more__panel" role="menu" id="nav-more-menu">
      <p className="nav-more__lead">
        {t('nav.moreLead', {
          defaultValue: 'Aprender, campo y gente. Solo orientación.',
        })}
      </p>
      {moreNavGroups.map((group) => (
        <div key={group.id} className="nav-more__group" role="group" aria-label={group.titleFallback}>
          <p className="nav-more__group-title">
            {t(group.titleKey, { defaultValue: group.titleFallback })}
          </p>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              role="menuitem"
              className={({ isActive }) =>
                `nav-more__item ${isActive ? 'nav-more__item--active' : ''}`
              }
              onClick={closeAll}
            >
              <span className="nav-more__item-row">
                <span className="nav-more__item-title">
                  {t(item.labelKey, { defaultValue: item.fallback })}
                  {item.badge === 'dev' ? (
                    <span className="nav-more__badge">Dev</span>
                  ) : null}
                </span>
                <span className="nav-more__item-blurb">
                  {t(item.blurbKey, { defaultValue: item.blurbFallback })}
                </span>
              </span>
            </NavLink>
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <header className={`header header--v2 header--mkt ${scrolled ? 'header--scrolled' : ''}`}>
      <div className="header-inner">
        <Link to="/" className="header-brand" onClick={closeAll}>
          <LogoMark />
          <div className="header-brand-text">
            <h1>VisionSetil</h1>
            <p className="subtitle">
              {t('app.fieldSubtitle', { defaultValue: 'Micología de campo' })}
            </p>
          </div>
        </Link>

        <div className={`header-nav-wrap ${menuOpen ? 'header-nav-wrap--open' : ''}`}>
          <nav
            className="header-nav header-nav--bar header-nav--desktop-primary"
            aria-label={t('nav.primaryAria', { defaultValue: 'Principal' })}
          >
            {primaryNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'nav-link--active' : ''} ${
                    'cta' in item && item.cta ? 'nav-link--cta' : ''
                  }`
                }
                onClick={closeAll}
                end={item.to === '/'}
              >
                <span>{t(item.labelKey, { defaultValue: item.fallback })}</span>
              </NavLink>
            ))}
          </nav>

          {/* Single Más control: hub link + overflow menu (not a second tab duplicate) */}
          <div
            className={`nav-more ${moreOpen ? 'nav-more--open' : ''}`}
            ref={moreRef}
          >
            <div className="nav-more__cluster">
              <NavLink
                to="/mas"
                className={({ isActive }) =>
                  `nav-link nav-more__hub ${isActive || moreActive ? 'nav-link--active' : ''}`
                }
                onClick={closeAll}
                data-testid="header-mas-hub"
              >
                {t('nav.more', { defaultValue: 'Más' })}
              </NavLink>
              <button
                type="button"
                className="nav-link nav-more__trigger"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                aria-controls="nav-more-menu"
                aria-label={t('nav.moreMenuAria', {
                  defaultValue: 'Abrir menú Más',
                })}
                data-testid="header-mas-menu"
                onClick={(e) => {
                  e.stopPropagation()
                  setMoreOpen((v) => !v)
                }}
              >
                <IconChevron open={moreOpen} />
              </button>
            </div>
            {morePanel}
          </div>
        </div>

        <div className="header-actions">
          {onLayoutModeChange ? (
            <LayoutModeToggle mode={layoutMode} onChange={onLayoutModeChange} compact />
          ) : null}
          {!loading && isAuthenticated && user && (
            <span className="header-user" title={user.email}>
              {user.display_name || user.username}
            </span>
          )}
          {!loading && isAuthenticated && (
            <button
              className="btn-icon"
              type="button"
              onClick={() => void logout()}
              title={t('nav.logout', { defaultValue: 'Cerrar sesión' })}
              aria-label={t('nav.logout', { defaultValue: 'Cerrar sesión' })}
            >
              <IconLogout />
            </button>
          )}
          {!loading && !isAuthenticated && (
            <Link
              to="/login"
              className="btn-icon"
              title={t('nav.login', { defaultValue: 'Iniciar sesión' })}
              aria-label={t('nav.login', { defaultValue: 'Iniciar sesión' })}
              onClick={closeAll}
            >
              <IconUser />
            </Link>
          )}
          <LanguageSwitcher />
          <button
            className="btn-icon"
            type="button"
            onClick={toggleTheme}
            data-testid="theme-toggle"
            aria-label={theme === 'light' ? t('actions.darkMode') : t('actions.lightMode')}
            title={theme === 'light' ? t('actions.darkMode') : t('actions.lightMode')}
          >
            {theme === 'light' ? <IconMoon /> : <IconSun />}
          </button>
          <button
            className="btn-icon btn-menu-toggle"
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={
              menuOpen
                ? t('nav.closeMenu', { defaultValue: 'Cerrar menú' })
                : t('nav.openMenu', { defaultValue: 'Abrir menú' })
            }
            title={t('actions.menu', { defaultValue: 'Menú' })}
          >
            <IconMenu open={menuOpen} />
          </button>
        </div>
      </div>
    </header>
  )
}
