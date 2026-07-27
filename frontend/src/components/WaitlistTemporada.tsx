/**
 * Waitlist temporada UI — local-first email capture.
 * Seasonal Spain / Soria / CyL messaging; educational framing only.
 */
import { useMemo, useState, type FormEvent } from 'react'
import {
  joinWaitlist,
  maskEmail,
  readWaitlist,
  regionLabelEs,
  temporadaBlurbEs,
  temporadaHeadlineEs,
  type WaitlistRegion,
} from '../lib/waitlistTemporada'

type Props = {
  className?: string
  source?: string
  compact?: boolean
}

const REGIONS: WaitlistRegion[] = ['soria', 'cyl', 'spain', 'other']

export function WaitlistTemporada({
  className = '',
  source = 'home',
  compact = false,
}: Props) {
  const existing = useMemo(() => readWaitlist(), [])
  const [email, setEmail] = useState(existing?.email || '')
  const [region, setRegion] = useState<WaitlistRegion>(existing?.region || 'soria')
  const [status, setStatus] = useState<'idle' | 'ok' | 'already' | 'error'>(
    existing ? 'already' : 'idle',
  )
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const res = joinWaitlist({ email, region, source })
    if (!res.ok) {
      setStatus('error')
      setError(
        res.error === 'invalid_email'
          ? 'Introduce un email válido.'
          : 'No se pudo guardar en este dispositivo.',
      )
      return
    }
    setStatus(res.already ? 'already' : 'ok')
  }

  return (
    <section
      className={`waitlist-temporada ${compact ? 'waitlist-temporada--compact' : ''} ${className}`.trim()}
      data-testid="waitlist-temporada"
      aria-label="Waitlist temporada"
    >
      <p className="waitlist-temporada__kicker">Temporada · España</p>
      <h2 className="waitlist-temporada__title">{temporadaHeadlineEs()}</h2>
      {!compact && <p className="waitlist-temporada__blurb">{temporadaBlurbEs()}</p>}

      {status === 'ok' || status === 'already' ? (
        <div className="waitlist-temporada__done" role="status" data-testid="waitlist-joined">
          <p>
            {status === 'already'
              ? 'Ya estás en la lista en este dispositivo.'
              : 'Apuntado. Te avisaremos de la temporada (local en este navegador).'}
          </p>
          <p className="waitlist-temporada__meta">
            {maskEmail(email || existing?.email || '')} · {regionLabelEs(region)}
          </p>
          <p className="waitlist-temporada__meta">
            Guardado solo en este dispositivo hasta que exista backend.
          </p>
        </div>
      ) : (
        <form className="waitlist-temporada__form" onSubmit={onSubmit} noValidate>
          <label className="waitlist-temporada__label">
            <span className="visually-hidden">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="tu@email.com"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              data-testid="waitlist-email"
              className="waitlist-temporada__input"
            />
          </label>
          <label className="waitlist-temporada__label">
            <span className="visually-hidden">Zona</span>
            <select
              name="region"
              value={region}
              onChange={(ev) => setRegion(ev.target.value as WaitlistRegion)}
              data-testid="waitlist-region"
              className="waitlist-temporada__select"
              aria-label="Zona de interés"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {regionLabelEs(r)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="mkt-btn mkt-btn--primary"
            data-testid="waitlist-submit"
          >
            Unirme a la waitlist
          </button>
        </form>
      )}

      {error && (
        <p className="waitlist-temporada__error" role="alert">
          {error}
        </p>
      )}

      <p className="waitlist-temporada__disclaimer" role="note">
        Local en tu navegador · sin spam garantizado de backend · orientación de campo, no
        permiso de recolección
      </p>
    </section>
  )
}
