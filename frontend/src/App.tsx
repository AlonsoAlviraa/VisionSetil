/** App shell — dual layout: store app shell + wide web page. */
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthProvider } from './auth/AuthContext'
import { Header } from './components/Header'
import { BottomNav } from './components/BottomNav'
import { ApiStatusBanner } from './components/ApiStatusBanner'
import { DocumentTitle } from './components/DocumentTitle'
import { ScrollToTop } from './components/ScrollToTop'
import { PwaInstallHint } from './components/PwaInstallHint'
import { ErrorBoundary, withRouteBoundary } from './components/ErrorBoundary'
import { useLayoutMode } from './hooks/useLayoutMode'
import type { LayoutMode } from './lib/layoutMode'
import {
  betaFeedbackHref,
  isBetaExternalForm,
  isBetaMailto,
} from './lib/betaFeedback'
/**
 * Primary bottom-nav destinations stay EAGER (except map) — avoids
 * "Failed to fetch dynamically imported module" on HMR, without shipping
 * Leaflet + all zone modules on every cold start.
 */
import { HomePage } from './pages/HomePage'
import { IdentifyPage } from './pages/IdentifyPage'
import { EncyclopediaPage } from './pages/EncyclopediaPage'
import { GamesHubPage } from './pages/GamesHubPage'
import { MoreHubPage } from './pages/MoreHubPage'

/**
 * Secondary routes stay lazy with retries (dev-server blips / HMR death).
 */
function lazyPage<T extends React.ComponentType<unknown>>(
  loader: () => Promise<{ default: T } | Record<string, T>>,
  exportName?: string,
) {
  return lazy(async () => {
    const load = async () => {
      const mod = await loader()
      if (exportName && mod && typeof mod === 'object' && exportName in mod) {
        return { default: (mod as Record<string, T>)[exportName] }
      }
      return mod as { default: T }
    }
    try {
      return await load()
    } catch (first) {
      await new Promise((r) => setTimeout(r, 500))
      try {
        return await load()
      } catch {
        if (typeof window !== 'undefined' && !sessionStorage.getItem('vs-lazy-reload')) {
          sessionStorage.setItem('vs-lazy-reload', '1')
          window.location.reload()
        }
        sessionStorage.removeItem('vs-lazy-reload')
        throw first
      }
    }
  })
}

const SpeciesDetailPage = lazyPage(() => import('./pages/SpeciesDetailPage'), 'SpeciesDetailPage')
const EducationPage = lazyPage(() => import('./pages/EducationPage'), 'EducationPage')
const HistoryPage = lazyPage(() => import('./pages/HistoryPage'), 'HistoryPage')
const ExpertReviewPage = lazyPage(() => import('./pages/ExpertReviewPage'), 'ExpertReviewPage')
const LoginPage = lazyPage(() => import('./pages/LoginPage'), 'LoginPage')
const RegisterPage = lazyPage(() => import('./pages/RegisterPage'), 'RegisterPage')
const CommunityPage = lazyPage(() => import('./pages/CommunityPage'), 'CommunityPage')
const OfflinePackPage = lazyPage(() => import('./pages/OfflinePackPage'), 'OfflinePackPage')
const LookalikeStudioPage = lazyPage(() => import('./pages/LookalikeStudioPage'), 'LookalikeStudioPage')
const QuizGamePage = lazyPage(() => import('./pages/QuizGamePage'), 'QuizGamePage')
const SetadlePage = lazyPage(() => import('./pages/SetadlePage'), 'SetadlePage')
const MushroomWordlePage = lazyPage(() => import('./pages/MushroomWordlePage'), 'MushroomWordlePage')
const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage'), 'NotFoundPage')
const MlDashboardPage = lazyPage(() => import('./pages/MlDashboardPage'), 'MlDashboardPage')
const BetaFeedbackPage = lazyPage(() => import('./pages/BetaFeedbackPage'), 'BetaFeedbackPage')
/** Leaflet + zone modules — only when user opens /mapa */
const SpainMapPage = lazyPage(() => import('./pages/SpainMapPage'))

function PageFallback() {
  return (
    <div className="page-fallback skeleton-atelier" role="status" aria-live="polite">
      <div className="skeleton-atelier__block skeleton-atelier__block--title" />
      <div className="skeleton-atelier__block skeleton-atelier__block--line" />
      <div className="skeleton-atelier__block skeleton-atelier__block--line short" />
      <div className="skeleton-atelier__grid">
        <div className="skeleton-atelier__card" />
        <div className="skeleton-atelier__card" />
        <div className="skeleton-atelier__card" />
      </div>
      <span className="visually-hidden">Cargando…</span>
    </div>
  )
}

/** Sticky Identify CTA — hidden on identify route (already there). */
function IdentifyFab() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  if (pathname.startsWith('/identificar')) return null
  return (
    <Link
      to="/identificar"
      className="fab-identify"
      data-testid="fab-identify"
      aria-label={t('nav.identifyFab', {
        defaultValue: 'Identificar con multi-vista',
      })}
    >
      <span className="fab-identify__icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
          <path d="M8 11h6M11 8v6" />
        </svg>
      </span>
      <span className="fab-identify__label">
        {t('nav.identify', { defaultValue: 'Identificar' })}
      </span>
    </Link>
  )
}

function AppShell({ forcedMode }: { forcedMode?: LayoutMode }) {
  const { t } = useTranslation()
  const reactive = useLayoutMode()
  // Dual-build split (v1.11): each Vite app can force its layout mode at build
  // time via VITE_LAYOUT_MODE. When forced, the runtime toggle is disabled and
  // the mode class is static — Header already hides LayoutModeToggle when
  // onLayoutModeChange is omitted.
  const mode = forcedMode ?? reactive.mode
  const setMode = forcedMode ? undefined : reactive.setMode

  return (
    <>
      <DocumentTitle />
      <ScrollToTop />
      <a href="#main-content" className="skip-link">
        {t('a11y.skipToContent', { defaultValue: 'Saltar al contenido' })}
      </a>
      <div
        className={[
          'app',
          'app--campo-nocturno',
          'app--has-bottom-nav',
          'app--stitch-b',
          mode === 'app' ? 'app--mode-app' : 'app--mode-web',
        ].join(' ')}
        data-skin="campo-nocturno"
        data-layout-mode={mode}
        data-testid="app-shell"
      >
        <Header layoutMode={mode} onLayoutModeChange={setMode} />
        <ApiStatusBanner />
        <PwaInstallHint />
        <main className="container cn-main" id="main-content" tabIndex={-1}>
          <ErrorBoundary surface="routes">
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={withRouteBoundary('home', <HomePage />)} />
                <Route
                  path="/identificar"
                  element={withRouteBoundary('identify', <IdentifyPage />)}
                />
                <Route
                  path="/historial"
                  element={withRouteBoundary('history', <HistoryPage />)}
                />
                <Route
                  path="/revision-experta"
                  element={withRouteBoundary('expert-review', <ExpertReviewPage />)}
                />
                <Route
                  path="/comunidad"
                  element={withRouteBoundary('community', <CommunityPage />)}
                />
                <Route path="/login" element={withRouteBoundary('login', <LoginPage />)} />
                <Route
                  path="/registro"
                  element={withRouteBoundary('register', <RegisterPage />)}
                />
                <Route
                  path="/enciclopedia"
                  element={withRouteBoundary('encyclopedia', <EncyclopediaPage />)}
                />
                <Route
                  path="/enciclopedia/:slug"
                  element={withRouteBoundary('species-detail', <SpeciesDetailPage />)}
                />
                <Route path="/mapa" element={withRouteBoundary('map', <SpainMapPage />)} />
                <Route
                  path="/educacion"
                  element={withRouteBoundary('education', <EducationPage />)}
                />
                <Route
                  path="/offline"
                  element={withRouteBoundary('offline', <OfflinePackPage />)}
                />
                <Route
                  path="/lookalikes"
                  element={withRouteBoundary('lookalikes', <LookalikeStudioPage />)}
                />
                <Route path="/juegos" element={withRouteBoundary('games', <GamesHubPage />)} />
                <Route path="/mas" element={withRouteBoundary('more', <MoreHubPage />)} />
                <Route path="/reto" element={withRouteBoundary('quiz', <QuizGamePage />)} />
                <Route path="/setadle" element={withRouteBoundary('setadle', <SetadlePage />)} />
                <Route
                  path="/setadle/wordle"
                  element={withRouteBoundary('wordle', <MushroomWordlePage />)}
                />
                <Route
                  path="/setadle/:mode"
                  element={withRouteBoundary('setadle-mode', <SetadlePage />)}
                />
                <Route
                  path="/wordle"
                  element={withRouteBoundary('wordle', <MushroomWordlePage />)}
                />
                <Route path="/ml" element={withRouteBoundary('ml', <MlDashboardPage />)} />
                <Route
                  path="/beta-feedback"
                  element={withRouteBoundary('beta-feedback', <BetaFeedbackPage />)}
                />
                <Route path="*" element={withRouteBoundary('not-found', <NotFoundPage />)} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
        {/* BottomNav: visible in app mode; web CSS hides on desktop, shows on phone */}
        <BottomNav />
        <footer className="footer footer--v16 footer--cn-compact">
          <div className="footer-content">
            <p className="footer-brand">{t('app.name', { defaultValue: 'VisionSetil' })}</p>
            <p>
              {t('app.footerDisclaimer', {
                defaultValue:
                  'Solo orientación de campo. No sustituye a un micólogo. Ante la duda, no recolectes ni consumas.',
              })}
            </p>
            {/* Keep test contracts; visually hidden by CSS (bottom nav is primary) */}
            <nav
              className="footer-links"
              aria-label={t('a11y.footerNav', { defaultValue: 'Enlaces del pie' })}
            >
              <Link to="/identificar">{t('nav.tryIdentify', { defaultValue: 'Probar Identificar' })}</Link>
              <Link to="/enciclopedia">{t('nav.encyclopedia', { defaultValue: 'Enciclopedia' })}</Link>
              <Link to="/educacion" data-testid="footer-education">
                {t('nav.education', { defaultValue: 'Educación' })}
              </Link>
              <Link to="/lookalikes" data-testid="footer-lookalikes">
                {t('nav.lookalikes', { defaultValue: 'Confusiones' })}
              </Link>
              <Link to="/offline">{t('nav.offline', { defaultValue: 'Offline' })}</Link>
              <Link to="/reto">{t('nav.quiz', { defaultValue: 'Reto' })}</Link>
              <Link to="/setadle">{t('nav.setadle', { defaultValue: 'Setadle' })}</Link>
              <Link to="/comunidad">{t('nav.community', { defaultValue: 'Comunidad' })}</Link>
              {isBetaExternalForm() || isBetaMailto() ? (
                <a
                  href={betaFeedbackHref()}
                  data-testid="footer-beta-feedback"
                  {...(isBetaMailto()
                    ? {}
                    : { target: '_blank', rel: 'noopener noreferrer' })}
                >
                  {t('nav.betaFeedback', { defaultValue: 'Feedback beta' })}
                </a>
              ) : (
                <Link to={betaFeedbackHref()} data-testid="footer-beta-feedback">
                  {t('nav.betaFeedback', { defaultValue: 'Feedback beta' })}
                </Link>
              )}
              <Link to="/ml">{t('nav.ml', { defaultValue: 'ML' })}</Link>
            </nav>
            <p
              className="footer-meta footer-multiview-note"
              data-testid="footer-multiview-note"
              role="note"
            >
              {t('app.footerMultiview', {
                defaultValue:
                  'Mejor con varias fotos: láminas, perfil y base. Una sola foto no basta.',
              })}
            </p>
            <p
              className="footer-meta footer-if-attribution"
              data-testid="footer-index-fungorum"
            >
              {t('app.indexFungorumAttr', {
                defaultValue:
                  'Nombres de referencia: Index Fungorum (solo nomenclatura).',
              })}{' '}
              <a
                href="https://www.indexfungorum.org/"
                target="_blank"
                rel="noopener noreferrer"
              >
                indexfungorum.org
              </a>
            </p>
            <p className="footer-meta">
              v1.9.9 · {new Date().getFullYear()}
            </p>
          </div>
        </footer>

        <IdentifyFab />
      </div>
    </>
  )
}

function App({ forcedMode }: { forcedMode?: LayoutMode } = {}) {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell forcedMode={forcedMode} />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
