/**
 * Segmented error boundary — fail closed to a safe shell (no white screen).
 * Wrap root AND individual routes so one crash does not blank the whole app.
 * Copy is orientation-only; no consumption language.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'
import { Button, LinkButton } from './ui'

type Props = {
  children: ReactNode
  /** Optional compact surface label for debugging */
  surface?: string
  /** Compact inline recovery (route-level) vs full-page shell (root) */
  variant?: 'page' | 'inline'
}

type State = {
  hasError: boolean
  message?: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Error inesperado',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Structured console only — never phone home with PII by default
    console.error('[ErrorBoundary]', this.props.surface || 'root', error, info.componentStack)
  }

  private handleRetry = () => {
    const msg = this.state.message || ''
    // Dynamic import failures (Vite down / HMR) need a hard reload, not just state reset
    if (
      /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i.test(
        msg,
      )
    ) {
      window.location.reload()
      return
    }
    this.setState({ hasError: false, message: undefined })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const inline = this.props.variant === 'inline'
    const msg = this.state.message || ''
    const isLazy =
      /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i.test(
        msg,
      )
    return (
      <div
        className={`error-boundary-shell${inline ? ' error-boundary-shell--inline' : ''}`}
        role="alert"
        data-surface={this.props.surface || 'root'}
        data-testid="error-boundary-shell"
      >
        <div className="error-boundary-shell__card atelier-card">
          <p className="atelier-kicker">Algo falló</p>
          <h1>
            {isLazy
              ? 'No se pudo cargar esta pantalla'
              : inline
                ? 'Esta sección no se pudo mostrar'
                : 'No pudimos mostrar esta pantalla'}
          </h1>
          <p>
            {isLazy
              ? 'El servidor de desarrollo se reinició o se cortó la conexión. Pulsa «Recargar página» (o F5). Si sigue fallando, ejecuta start-visionsetil.bat y vuelve a abrir http://127.0.0.1:5173'
              : 'Es un fallo de la aplicación, no un diagnóstico de setas. Puedes reintentar o volver al inicio. Ante la duda, consulta a un micólogo de carne y hueso.'}
          </p>
          {this.props.surface ? (
            <p className="error-boundary-shell__detail muted">
              Superficie: <code>{this.props.surface}</code>
            </p>
          ) : null}
          {this.state.message ? (
            <p className="error-boundary-shell__detail">
              <code>{this.state.message}</code>
            </p>
          ) : null}
          <div className="atelier-cta-row">
            <Button
              type="button"
              variant="primary"
              onClick={this.handleRetry}
              data-testid="error-boundary-retry"
            >
              {isLazy
                ? i18n.t('errorBoundary.reload', { defaultValue: 'Recargar página' })
                : i18n.t('actions.retry', { defaultValue: 'Reintentar' })}
            </Button>
            <LinkButton to="/" variant="ghost" data-testid="error-boundary-home">
              {i18n.t('nav.home', { defaultValue: 'Inicio' })}
            </LinkButton>
            <LinkButton to="/identificar" variant="ghost" data-testid="error-boundary-identify">
              {i18n.t('nav.identify', { defaultValue: 'Identificar' })}
            </LinkButton>
          </div>
        </div>
      </div>
    )
  }
}

/** Wrap a route element so failures stay inside that surface. */
export function withRouteBoundary(surface: string, element: ReactNode): ReactNode {
  return (
    <ErrorBoundary surface={surface} variant="inline">
      {element}
    </ErrorBoundary>
  )
}
