/** App shell — lazy routes for faster first paint. */
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Header } from './components/Header'
import { HomePage } from './pages/HomePage'

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
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
)
const ExpertReviewPage = lazy(() =>
  import('./pages/ExpertReviewPage').then((m) => ({ default: m.ExpertReviewPage })),
)
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
)
const CommunityPage = lazy(() =>
  import('./pages/CommunityPage').then((m) => ({ default: m.CommunityPage })),
)
const OfflinePackPage = lazy(() =>
  import('./pages/OfflinePackPage').then((m) => ({ default: m.OfflinePackPage })),
)
const LookalikeStudioPage = lazy(() =>
  import('./pages/LookalikeStudioPage').then((m) => ({ default: m.LookalikeStudioPage })),
)
const QuizGamePage = lazy(() =>
  import('./pages/QuizGamePage').then((m) => ({ default: m.QuizGamePage })),
)
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)
const MlDashboardPage = lazy(() =>
  import('./pages/MlDashboardPage').then((m) => ({ default: m.MlDashboardPage })),
)

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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app bg-aurora">
          <Header />
          <main className="container">
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/identificar" element={<IdentifyPage />} />
                <Route path="/historial" element={<HistoryPage />} />
                <Route path="/revision-experta" element={<ExpertReviewPage />} />
                <Route path="/comunidad" element={<CommunityPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/registro" element={<RegisterPage />} />
                <Route path="/enciclopedia" element={<EncyclopediaPage />} />
                <Route path="/enciclopedia/:slug" element={<SpeciesDetailPage />} />
                <Route path="/mapa" element={<SpainMapPage />} />
                <Route path="/educacion" element={<EducationPage />} />
                <Route path="/offline" element={<OfflinePackPage />} />
                <Route path="/lookalikes" element={<LookalikeStudioPage />} />
                <Route path="/reto" element={<QuizGamePage />} />
                <Route path="/ml" element={<MlDashboardPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </main>
          <footer className="footer">
            <div className="footer-content">
              <p className="footer-brand">VisionSetil</p>
              <p>
                Orientación de campo, no permiso de consumo. Ante la duda, un micólogo de carne y
                hueso.
              </p>
              <p className="footer-meta">
                Micología · Riesgo · Comunidad · {new Date().getFullYear()}
              </p>
            </div>
          </footer>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
