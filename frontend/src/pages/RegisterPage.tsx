import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { deadlyPriorityViews } from '../lib/diagnosticViews'
import { Button, PageShell } from '../components/ui'

export function RegisterPage() {
  const { t } = useTranslation()
  const { register, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const priorityViews = deadlyPriorityViews().slice(0, 3)

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
    <PageShell
      bare
      className="page-auth page-atelier-shell"
      testId="register-page"
      orientationSticky
      orientationText={t('auth.orientation', {
        defaultValue: 'Solo orientación · cuenta de estudio · nunca consumo',
      })}
    >
      <div className="auth-atelier">
        <div className="page-header">
          <p className="atelier-kicker" style={{ color: 'var(--ink-mute)' }}>
            {t('auth.kicker', { defaultValue: 'Cuenta' })}
          </p>
          <h1 className="page-title">
            {t('auth.registerTitle', { defaultValue: 'Crear cuenta' })}
          </h1>
          <p className="page-subtitle" data-testid="register-orientation-policy">
            {t('auth.registerSubtitle', {
              defaultValue:
                'Únete a la comunidad. Espacio educativo — nunca permiso de consumo ni recolección. Solo orientación de campo.',
            })}
          </p>
        </div>

        <section
          className="atelier-panel auth-multiview-tip"
          data-testid="register-multiview-tip"
          role="note"
        >
          <p>
            {t('auth.multiviewTip', {
              defaultValue:
                'Al Identificar: prioriza láminas, perfil/pie y base (volva/anillo). Multi-foto sin esas vistas no basta para confusiones mortales — nunca consumo.',
            })}
          </p>
          <div className="lookalike-item__diag-views" data-testid="register-multiview-priority">
            {priorityViews.map((view) => (
              <span
                key={view}
                className="lookalike-item__diag-badge lookalike-item__diag-badge--static"
                data-slot={view}
              >
                {t(`identify.views.${view}`, { defaultValue: view })}
              </span>
            ))}
          </div>
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            <Link to="/identificar" data-testid="register-cta-identify">
              {t('nav.identify', { defaultValue: 'Identificar multi-vista' })}
            </Link>
            {' · '}
            <Link to="/educacion" data-testid="register-cta-edu">
              {t('nav.education', { defaultValue: 'Educación' })}
            </Link>
          </p>
        </section>

        <form className="auth-form-atelier" onSubmit={onSubmit}>
          <label>
            {t('auth.email', { defaultValue: 'Email' })}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            {t('auth.username', { defaultValue: 'Usuario' })}
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[A-Za-z0-9_.\-]{3,32}"
              required
            />
          </label>
          <label>
            {t('auth.displayName', { defaultValue: 'Nombre visible (opcional)' })}
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label>
            {t('auth.passwordMin', { defaultValue: 'Contraseña (mín. 8)' })}
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
          <Button type="submit" variant="primary" block disabled={busy}>
            {busy
              ? t('auth.registerBusy', { defaultValue: 'Creando…' })
              : t('auth.registerSubmit', { defaultValue: 'Registrarme' })}
          </Button>
          <p className="auth-form-atelier__foot">
            {t('auth.hasAccount', { defaultValue: '¿Ya tienes cuenta?' })}{' '}
            <Link to="/login">{t('auth.loginLink', { defaultValue: 'Inicia sesión' })}</Link>
          </p>
        </form>
      </div>
    </PageShell>
  )
}
