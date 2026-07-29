/**
 * In-app beta feedback form (GTM try-first).
 * Works without Google Forms: stores locally + optional mailto handoff.
 * Orientation only — never consumption permission.
 */
import { FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BETA_FEEDBACK_MAILTO,
  betaFeedbackFormUrl,
  isBetaMailto,
} from '../lib/betaFeedback'
import { publicAppUrlForInvite } from '../lib/hostingPublicUrl'

const STORAGE_KEY = 'visionsetil_beta_feedback_v1'

export type BetaFeedbackEntry = {
  at: string
  tried: string
  failed: string
  device: string
  multiPhoto: string
  notes: string
  policy: 'orientation_only_never_consume'
}

function loadLocal(): BetaFeedbackEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveLocal(entry: BetaFeedbackEntry): void {
  const prev = loadLocal()
  prev.unshift(entry)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prev.slice(0, 50)))
}

export function BetaFeedbackPage() {
  const { t } = useTranslation()
  const externalForm = betaFeedbackFormUrl()
  const [tried, setTried] = useState('identificar')
  const [failed, setFailed] = useState('')
  const [device, setDevice] = useState('')
  const [multiPhoto, setMultiPhoto] = useState('no')
  const [notes, setNotes] = useState('')
  const [sent, setSent] = useState(false)
  const [count, setCount] = useState(() => loadLocal().length)

  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent('VisionSetil beta feedback')
    const body = encodeURIComponent(
      [
        `App: ${publicAppUrlForInvite()}`,
        `Qué probé: ${tried}`,
        `Qué falló: ${failed}`,
        `Dispositivo: ${device}`,
        `Multi-foto: ${multiPhoto}`,
        `Notas: ${notes}`,
        '',
        'Política: solo orientación — nunca permiso de consumo.',
      ].join('\n'),
    )
    return `mailto:alonso.alvbal@gmail.com?subject=${subject}&body=${body}`
  }, [tried, failed, device, multiPhoto, notes])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const entry: BetaFeedbackEntry = {
      at: new Date().toISOString(),
      tried,
      failed: failed.trim(),
      device: device.trim(),
      multiPhoto,
      notes: notes.trim(),
      policy: 'orientation_only_never_consume',
    }
    saveLocal(entry)
    setCount(loadLocal().length)
    setSent(true)
  }

  return (
    <div className="page-atelier beta-feedback-page" data-testid="beta-feedback-page">
      <h1>{t('betaFeedback.title', { defaultValue: 'Feedback beta' })}</h1>
      <p className="muted" data-testid="beta-feedback-policy">
        {t('betaFeedback.policy', {
          defaultValue:
            'Solo orientación de campo — nunca permiso de consumo ni recolección. Open-set / abstenerse es una feature.',
        })}
      </p>

      <div
        className="atelier-panel beta-feedback-multiview-tip"
        data-testid="beta-feedback-multiview-tip"
        role="note"
      >
        <p>
          {t('betaFeedback.multiviewTip', {
            defaultValue:
              'Si probaste Identificar: prioriza láminas (gills), perfil/pie (front) y base/volva/anillo (detail). Multi-foto sin esas vistas no basta para confusiones mortales — solo orientación, nunca consumo.',
          })}
        </p>
        <p className="muted">
          <Link to="/identificar" data-testid="beta-feedback-link-identify">
            {t('nav.identify', { defaultValue: 'Identificar multi-vista' })}
          </Link>
          {' · '}
          <Link to="/educacion" data-testid="beta-feedback-link-edu">
            {t('nav.education', { defaultValue: 'Educación' })}
          </Link>
        </p>
      </div>

      {externalForm ? (
        <p className="atelier-panel" data-testid="beta-feedback-external">
          {t('betaFeedback.externalHint', {
            defaultValue: 'También hay un formulario online:',
          })}{' '}
          <a
            href={externalForm}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="beta-feedback-external-link"
          >
            {t('betaFeedback.openExternal', { defaultValue: 'Abrir form externo' })}
          </a>
        </p>
      ) : null}

      {sent ? (
        <div className="atelier-panel" data-testid="beta-feedback-thanks" role="status">
          <p>
            <strong>
              {t('betaFeedback.thanks', {
                defaultValue: 'Gracias — feedback guardado en este dispositivo.',
              })}
            </strong>
          </p>
          <p className="muted">
            {t('betaFeedback.localCount', {
              defaultValue: `Entradas locales: ${count}`,
              count,
            })}
          </p>
          <p>
            <a
              href={mailtoHref}
              className="btn-atelier btn-atelier--primary"
              data-testid="beta-feedback-mailto-send"
            >
              {t('betaFeedback.alsoEmail', {
                defaultValue: 'Enviar también por email al equipo',
              })}
            </a>
          </p>
          <p>
            <Link to="/identificar" className="btn-atelier btn-atelier--ghost">
              {t('betaFeedback.tryId', { defaultValue: 'Probar Identificar' })}
            </Link>
          </p>
        </div>
      ) : (
        <form className="atelier-panel beta-feedback-form" onSubmit={onSubmit}>
          <label>
            {t('betaFeedback.tried', { defaultValue: 'Qué probaste' })}
            <select
              value={tried}
              onChange={(ev) => setTried(ev.target.value)}
              data-testid="beta-feedback-tried"
              required
            >
              <option value="identificar">Identificar</option>
              <option value="enciclopedia">Enciclopedia</option>
              <option value="mapa">Mapa / cotos</option>
              <option value="juegos">Juegos (Wordle / Setadle / Quiz)</option>
              <option value="offline">Pack offline</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <label>
            {t('betaFeedback.failed', { defaultValue: 'Qué falló o confudió' })}
            <textarea
              value={failed}
              onChange={(ev) => setFailed(ev.target.value)}
              rows={3}
              required
              maxLength={2000}
              data-testid="beta-feedback-failed"
              placeholder={t('betaFeedback.failedPh', {
                defaultValue: 'Ej. no entendí el open-set / multi-foto confuso…',
              })}
            />
          </label>
          <label>
            {t('betaFeedback.device', { defaultValue: 'Dispositivo' })}
            <input
              value={device}
              onChange={(ev) => setDevice(ev.target.value)}
              maxLength={120}
              data-testid="beta-feedback-device"
              placeholder="iPhone 14 / Pixel / Windows Chrome…"
            />
          </label>
          <label>
            {t('betaFeedback.multiPhoto', { defaultValue: '¿Usaste multi-foto?' })}
            <select
              value={multiPhoto}
              onChange={(ev) => setMultiPhoto(ev.target.value)}
              data-testid="beta-feedback-multiphoto"
            >
              <option value="si">Sí (incl. láminas/perfil/base)</option>
              <option value="parcial_diag">Parcial con vistas diag. (1–2 de gills/front/detail)</option>
              <option value="parcial">Parcial (varias fotos, sin vistas diag.)</option>
              <option value="no">No (una sola foto)</option>
            </select>
          </label>
          <p className="muted beta-feedback-multiphoto-hint" data-testid="beta-feedback-multiphoto-hint">
            {t('betaFeedback.multiPhotoHint', {
              defaultValue:
                'Gills = láminas · front = perfil/pie · detail = base/volva/anillo. Sin ellas, multi-foto no es “más seguro”.',
            })}
          </p>
          <label>
            {t('betaFeedback.notes', { defaultValue: 'Nota libre' })}
            <textarea
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              rows={2}
              maxLength={2000}
              data-testid="beta-feedback-notes"
            />
          </label>
          <div className="identify-mode-toggle">
            <button
              type="submit"
              className="btn-atelier btn-atelier--primary"
              data-testid="beta-feedback-submit"
            >
              {t('betaFeedback.submit', { defaultValue: 'Enviar feedback' })}
            </button>
            <a
              href={isBetaMailto(mailtoHref) ? mailtoHref : BETA_FEEDBACK_MAILTO}
              className="btn-atelier btn-atelier--ghost"
            >
              {t('betaFeedback.mailtoOnly', { defaultValue: 'Solo email' })}
            </a>
          </div>
        </form>
      )}
    </div>
  )
}
