import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function RegisterPage() {
  const { register, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/comunidad', { replace: true })
  }, [isAuthenticated, navigate])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await register({
        email,
        username,
        password,
        display_name: displayName || undefined,
      })
      navigate('/comunidad', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de registro')
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
          <h1 className="page-title">Crear cuenta</h1>
          <p className="page-subtitle">
            Únete a la comunidad. Espacio educativo — nunca permiso de consumo.
          </p>
        </div>
        <form className="auth-form-atelier" onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Usuario
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[A-Za-z0-9_.\-]{3,32}"
              required
            />
          </label>
          <label>
            Nombre visible (opcional)
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label>
            Contraseña (mín. 8)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <button className="btn-atelier btn-atelier--primary btn-atelier--block" type="submit" disabled={busy}>
            {busy ? 'Creando…' : 'Registrarme'}
          </button>
          <p className="auth-form-atelier__foot">
            ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
