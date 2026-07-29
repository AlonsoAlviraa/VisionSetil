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
 * CSS cascade (Phase D-01) — web build. Later files win on equal specificity.
 */
import './styles/global.css'
import './styles/animations.css'
import './styles/premium.css'
import './styles/tokens.css'
import './styles/redesign.css'
import './styles/atelier.css'
import './styles/marketing.css'
/** Option B Campo nocturno — after marketing so night shell wins */
import './styles/campo-nocturno.css'
/** Web (browser) layout layer — only under .app--mode-web */
import './styles/campo-nocturno-web.css'
import { warmCriticalSpeciesImages } from './lib/imageWarm'
import { hydrateSpeciesPhotos } from './lib/speciesImageService'

async function boot() {
  await hydrateSpeciesPhotos().catch(() => {
    /* local_media / placeholders still work */
  })
  warmCriticalSpeciesImages()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary surface="root">
        <App forcedMode={FORCED_LAYOUT_MODE ?? 'web'} />
      </ErrorBoundary>
    </React.StrictMode>,
  )
}

void boot()
