/**
 * Web shell entry — browser build (port 5174).
 * Bakes `web` layout mode at build time; imports BOTH skin layers so the
 * full-width desktop chrome (top nav, multi-column grids, footer) applies.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FORCED_LAYOUT_MODE } from './shells/forcedMode'
import './i18n'
/**
 * CSS cascade — architecture M3 (v1.15).
 * Same product path as app + web layout layer.
 * Dropped redesign.css + premium.css.
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

function boot() {
  // Paint shell immediately — photo catalog hydrate must not block FCP
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary surface="root">
        <App forcedMode={FORCED_LAYOUT_MODE ?? 'web'} />
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
