/**
 * Root/route error boundary — fail closed to a safe shell (no white screen).
 * Copy is orientation-only; no consumption language.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Props = {
  children: ReactNode
  /** Optional compact surface label for debugging */
  surface?: string
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
    this.setState({ hasError: false, message: undefined })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="error-boundary-shell" role="alert">
        <div className="error-boundary-shell__card atelier-card">
          <p className="atelier-kicker">Algo falló</p>
          <h1>No pudimos mostrar esta pantalla</h1>
          <p>
            Es un fallo de la aplicación, no un diagnóstico de setas. Puedes reintentar o volver al
            inicio. Ante la duda, consulta a un micólogo de carne y hueso.
          </p>
          {this.state.message ? (
            <p className="error-boundary-shell__detail">
              <code>{this.state.message}</code>
            </p>
          ) : null}
          <div className="atelier-cta-row">
            <button type="button" className="btn-atelier btn-atelier--primary" onClick={this.handleRetry}>
              Reintentar
            </button>
            <Link to="/" className="btn-atelier btn-atelier--ghost">
              Inicio
            </Link>
            <Link to="/identificar" className="btn-atelier btn-atelier--ghost">
              Identificar
            </Link>
          </div>
        </div>
      </div>
    )
  }
}
