/** App root: layout with Header, router, and footer. */
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Header } from './components/Header'
import { ApiStatusBanner } from './components/ApiStatusBanner'
import { DocumentTitle } from './components/DocumentTitle'
import { SporeParticles } from './components/SporeParticles'
import { Skeleton } from './components/ui'

const HomePage = lazy(() =>
  import('./pages/HomePage').then((m) => ({ default: m.HomePage })),
)
const IdentifyPage = lazy(() =>
  import('./pages/IdentifyPage').then((m) => ({ default: m.IdentifyPage })),
)
const EncyclopediaPage = lazy(() =>
  import('./pages/EncyclopediaPage').then((m) => ({ default: m.EncyclopediaPage })),
)
const SpeciesDetailPage = lazy(() =>
  import('./pages/SpeciesDetailPage').then((m) => ({ default: m.SpeciesDetailPage })),
)
const EducationPage = lazy(() =>
  import('./pages/EducationPage').then((m) => ({ default: m.EducationPage })),
)
const SpainMapPage = lazy(() => import('./pages/SpainMapPage'))

function App() {
  const { t } = useTranslation()

  return (
    <BrowserRouter>
      <DocumentTitle />
      <div className="app bg-aurora">
        <SporeParticles count={12} />
        <Header />
        <ApiStatusBanner />
        <main className="container" id="main-content">
          <Suspense
            fallback={
              <div style={{ padding: '2rem 0' }}>
                <Skeleton height={200} />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/identificar" element={<IdentifyPage />} />
              <Route path="/enciclopedia" element={<EncyclopediaPage />} />
              <Route path="/enciclopedia/:slug" element={<SpeciesDetailPage />} />
              <Route path="/mapa" element={<SpainMapPage />} />
              <Route path="/educacion" element={<EducationPage />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="footer">
          <div className="footer-content">
            <p className="footer-brand">🍄 {t('app.name')}</p>
            <p>{t('app.footerDisclaimer')}</p>
            <nav className="footer-links" aria-label="Footer">
              <Link to="/enciclopedia">{t('nav.encyclopedia')}</Link>
              <Link to="/identificar">{t('nav.identify')}</Link>
              <Link to="/educacion">{t('nav.education')}</Link>
              <Link to="/mapa">{t('nav.map')}</Link>
            </nav>
            <p className="footer-meta">
              {t('app.poweredBy')} · v1.0.0-web · {new Date().getFullYear()}
            </p>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  )
}

export default App
