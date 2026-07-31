import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { deadlyPriorityViews } from '../lib/diagnosticViews'
import { Button, PageShell } from '../components/ui'

export function LoginPage() {
  const { t } = useTranslation()
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from || '/comunidad'
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const priorityViews = deadlyPriorityViews().slice(0, 3)

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
    <PageShell
      bare
      className="page-auth page-atelier-shell"
      testId="login-page"
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
            {t('auth.loginTitle', { defaultValue: 'Iniciar sesión' })}
          </h1>
          <p className="page-subtitle" data-testid="login-orientation-policy">
            {t('auth.loginSubtitle', {
              defaultValue:
                'Accede para publicar en la comunidad y comentar. La cuenta no autoriza consumo ni recolección — solo orientación de campo.',
            })}
          </p>
        </div>

        <section
          className="atelier-panel auth-multiview-tip"
          data-testid="login-multiview-tip"
          role="note"
        >
          <p>
            {t('auth.multiviewTip', {
              defaultValue:
                'Al Identificar: prioriza láminas, perfil/pie y base (volva/anillo). Multi-foto sin esas vistas no basta para confusiones mortales — nunca consumo.',
            })}
          </p>
          <div className="lookalike-item__diag-views" data-testid="login-multiview-priority">
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
            <Link to="/identificar" data-testid="login-cta-identify">
              {t('nav.identify', { defaultValue: 'Identificar' })}
            </Link>
            {' · '}
            <Link to="/educacion" data-testid="login-cta-edu">
              {t('nav.education', { defaultValue: 'Educación' })}
            </Link>
          </p>
        </section>

        <form className="auth-form-atelier" onSubmit={onSubmit}>
          <label>
            {t('auth.loginId', { defaultValue: 'Email o usuario' })}
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            {t('auth.password', { defaultValue: 'Contraseña' })}
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
          <Button type="submit" variant="primary" block disabled={busy}>
            {busy
              ? t('auth.loginBusy', { defaultValue: 'Entrando…' })
              : t('auth.loginSubmit', { defaultValue: 'Entrar' })}
          </Button>
          <p className="auth-form-atelier__foot">
            {t('auth.noAccount', { defaultValue: '¿No tienes cuenta?' })}{' '}
            <Link to="/registro">{t('auth.registerLink', { defaultValue: 'Regístrate' })}</Link>
          </p>
        </form>
      </div>
    </PageShell>
  )
}
