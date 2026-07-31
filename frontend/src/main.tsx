import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import './i18n'
/**
 * CSS cascade — architecture M3 (v1.15).
 * tokens → atelier → marketing → CN → web layer.
 * Dropped redesign + premium (CN is visual skin SSOT).
 * Do not reintroduce food-safe green on Identify (D16).
 */
import './styles/global.css'
import './styles/animations.css'
import './styles/tokens.css'
import './styles/atelier.css'
import './styles/marketing.css'
/** Option B Campo nocturno — after marketing so night shell wins */
import './styles/campo-nocturno.css'
/** Web (browser) layout layer — only under .app--mode-web */
import './styles/campo-nocturno-web.css'
import { warmCriticalSpeciesImages } from './lib/imageWarm'
import { hydrateSpeciesPhotos } from './lib/speciesImageService'

function boot() {
  try {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
  } catch {
    /* ignore */
  }
  // Paint shell immediately — photo catalog hydrate must not block FCP
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary surface="root">
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
  void hydrateSpeciesPhotos()
    .catch(() => undefined)
    .then(() => {
      warmCriticalSpeciesImages()
    })
}

boot()
