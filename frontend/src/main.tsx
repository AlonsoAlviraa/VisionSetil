import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import './i18n'
/**
 * CSS cascade (Phase D-01) — later files win on equal specificity.
 * Order is intentional:
 *   1. global / premium / redesign — legacy layout & page chrome
 *   2. tokens — spacing/type/D16/skeleton primitives
 *   3. atelier — **product SSOT** for color, type, buttons, cards, empty states
 * Prefer: btn-atelier, atelier-card, empty-state-atelier, design tokens.
 * Do not reintroduce food-safe green on Identify (D16).
 */
import './styles/global.css'
import './styles/animations.css'
import './styles/premium.css'
import './styles/tokens.css'
import './styles/redesign.css'
import './styles/atelier.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary surface="root">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
