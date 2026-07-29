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
 * CSS cascade (Phase D-01) — app build. Later files win on equal specificity.
 * Web layer (campo-nocturno-web.css) is intentionally NOT imported here.
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
import { warmCriticalSpeciesImages } from './lib/imageWarm'

// Kick image cache for home hero + first grid thumbs before first paint settles
warmCriticalSpeciesImages()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary surface="root">
      <App forcedMode={FORCED_LAYOUT_MODE ?? 'app'} />
    </ErrorBoundary>
  </React.StrictMode>,
)
