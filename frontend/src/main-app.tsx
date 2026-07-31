/**
 * App shell entry — store / PWA build (port 5173).
 * Bakes `app` layout mode at build time; omits the web CSS layer so the
 * bundle ships only the phone-canvas Campo nocturno skin.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FORCED_LAYOUT_MODE } from './shells/forcedMode'
import './i18n'
/**
 * CSS cascade — architecture M3 (v1.15).
 * Product path: tokens → atelier (btn geometry) → marketing (mkt-*) → CN wins.
 * Dropped redesign.css + premium.css (override wars; CN is skin SSOT).
 * Web layer (campo-nocturno-web.css) is intentionally NOT imported here.
 */
import './styles/global.css'
import './styles/animations.css'
import './styles/tokens.css'
import './styles/atelier.css'
import './styles/marketing.css'
/** Option B Campo nocturno — after marketing so night shell wins */
import './styles/campo-nocturno.css'

function boot() {
  // Paint shell immediately — photo catalog hydrate must not block FCP
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary surface="root">
        <App forcedMode={FORCED_LAYOUT_MODE ?? 'app'} />
      </ErrorBoundary>
    </React.StrictMode>,
  )
  // Dynamic import: keeps speciesImageService + speciesPhotos.json out of the
  // main bundle (~150KB+ savings). Runs after first paint, non-blocking.
  void import('./lib/speciesImageService')
    .then(({ hydrateSpeciesPhotos }) => hydrateSpeciesPhotos())
    .catch(() => {
      /* local_media / placeholders still work */
    })
    .then(() => {
      return import('./lib/imageWarm').then(({ warmCriticalSpeciesImages }) =>
        warmCriticalSpeciesImages(),
      )
    })
}

boot()
