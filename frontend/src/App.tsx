/** App root: layout with Header, router, and footer. */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Header } from './components/Header'
import { HomePage } from './pages/HomePage'
import { IdentifyPage } from './pages/IdentifyPage'
import { EncyclopediaPage } from './pages/EncyclopediaPage'
import { SpeciesDetailPage } from './pages/SpeciesDetailPage'
import { EducationPage } from './pages/EducationPage'
import SpainMapPage from './pages/SpainMapPage'
import { SporeParticles } from './components/SporeParticles'

function App() {
  return (
    <BrowserRouter>
      <div className="app bg-aurora">
        <SporeParticles count={15} />
        <Header />
        <main className="container">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/identificar" element={<IdentifyPage />} />
            <Route path="/enciclopedia" element={<EncyclopediaPage />} />
            <Route path="/enciclopedia/:slug" element={<SpeciesDetailPage />} />
            <Route path="/mapa" element={<SpainMapPage />} />
            <Route path="/educacion" element={<EducationPage />} />
          </Routes>
        </main>
        <footer className="footer">
          <div className="footer-content">
            <p className="footer-brand">🍄 VisionSetil</p>
            <p>
              Herramienta orientativa y educativa. No sustituye el consejo de un micólogo experto.
              Una identificación incorrecta puede costar una vida.
            </p>
            <p className="footer-meta">
              Powered by FungiCLEF 2025 · v0.3.0 · {new Date().getFullYear()}
            </p>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  )
}

export default App