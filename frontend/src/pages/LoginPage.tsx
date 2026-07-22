import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from || '/comunidad'
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true })
  }, [isAuthenticated, navigate, from])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(loginId, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de login')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-auth page-atelier-shell">
      <div className="auth-atelier">
        <div className="page-header">
          <p className="atelier-kicker" style={{ color: 'var(--ink-mute)' }}>
            Cuenta
          </p>
          <h1 className="page-title">Iniciar sesión</h1>
          <p className="page-subtitle">
            Accede para publicar en la comunidad y comentar. La cuenta no autoriza consumo.
          </p>
        </div>
        <form className="auth-form-atelier" onSubmit={onSubmit}>
          <label>
            Email o usuario
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              minLength={8}
            />
          </label>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <button className="btn-atelier btn-atelier--primary btn-atelier--block" type="submit" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="auth-form-atelier__foot">
            ¿No tienes cuenta? <Link to="/registro">Regístrate</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
