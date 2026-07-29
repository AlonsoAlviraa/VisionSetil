/**
 * Guided multi-view capture ÔÇö 4-step ritual (Wave C/D).
 * Field-ready icons, camera per slot, no dev jargon.
 * B-25: soft readiness (D-B14) + i18n slot labels.
 */
import { useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  VIEW_SLOTS,
  type CanonicalView,
  type MultiViewWarningCode,
  type SlotAssignment,
  assessMultiViewReadiness,
  multiViewQualityHint,
  progressiveMultiViewCoach,
  framingGuideForView,
  FULL_PACKET_PHOTOS,
  orderedSlotKeys,
} from '../lib/multiViewSlots'
import {
  deadlyCoach,
  isDeadlyCriticalView,
  missingDeadlyCriticalViews,
} from '../lib/diagnosticViews'
import { featureFlags } from '../lib/featureFlags'
import { IconCamera, ViewIcon } from './icons'

type Props = {
  assignments: SlotAssignment
  onAssign: (view: CanonicalView, file: File, previewUrl: string) => void
  onClear: (view: CanonicalView) => void
  onOpenCamera?: () => void
}

function slotLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  view: CanonicalView,
  fallback: string,
): string {
  return t(`identify.views.${view}`, { defaultValue: fallback })
}

function slotHint(
  t: (key: string, opts?: Record<string, unknown>) => string,
  view: CanonicalView,
  fallback: string,
): string {
  return t(`identify.viewHint.${view}`, { defaultValue: fallback })
}

function warningText(
  t: (key: string, opts?: Record<string, unknown>) => string,
  code: MultiViewWarningCode,
  missingRequired: CanonicalView[],
  labelOf: (v: CanonicalView) => string,
  softEs: string,
): string {
  if (code === 'missing_required') {
    const views = missingRequired.map(labelOf).join(', ')
    return t('identify.readiness.missing_required', {
      views,
      defaultValue: softEs,
    })
  }
  return t(`identify.readiness.${code}`, { defaultValue: softEs })
}

export function MultiViewWizard({ assignments, onAssign, onClear, onOpenCamera }: Props) {
  const { t, i18n } = useTranslation()
  const hardMinViews = featureFlags.HARD_VIEW_MIN
  const readiness = useMemo(
    () => assessMultiViewReadiness(assignments, { hardMinViews }),
    [assignments, hardMinViews],
  )
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const coach = useMemo(
    () => progressiveMultiViewCoach(assignments, { hardMinViews }),
    [assignments, hardMinViews],
  )

  const qualityHint = useMemo(() => {
    if (readiness.filled <= 0) return null
    // Prefer i18n keys when present; fallback to lib copy (bench-informed)
    if (readiness.filled >= FULL_PACKET_PHOTOS) {
      return t('identify.qualityHint.full', {
        defaultValue: multiViewQualityHint(readiness.filled, locale),
      })
    }
    if (readiness.filled >= 2) {
      return t('identify.qualityHint.pair', {
        defaultValue: multiViewQualityHint(readiness.filled, locale),
      })
    }
    return t('identify.qualityHint.single', {
      defaultValue: multiViewQualityHint(readiness.filled, locale),
    })
  }, [readiness.filled, t, locale])

  const progressiveHeadline = useMemo(() => {
    const en = locale.toLowerCase().startsWith('en')
    return t(`identify.progressiveCoach.${coach.code}`, {
      defaultValue: en ? coach.headlineEn : coach.headlineEs,
      requiredDone: coach.requiredDone,
      requiredTotal: coach.requiredTotal,
      filled: coach.filled,
    })
  }, [coach, t, locale])

  const deadlyMissing = useMemo(() => {
    const filled = orderedSlotKeys(assignments)
    return missingDeadlyCriticalViews(filled)
  }, [assignments])

  const deadlyCoachText = useMemo(
    () =>
      t('identify.deadlyDiagnostic.coach', {
        defaultValue: deadlyCoach(locale),
      }),
    [t, locale],
  )
  const inputRefs = useRef<Partial<Record<CanonicalView, HTMLInputElement | null>>>({})

  const onFile = useCallback(
    (view: CanonicalView, fileList: FileList | null) => {
      const file = fileList?.[0]
      if (!file) return
      const previewUrl = URL.createObjectURL(file)
      onAssign(view, file, previewUrl)
    },
    [onAssign],
  )

  const labelOf = useCallback(
    (view: CanonicalView) => {
      const slot = VIEW_SLOTS.find((s) => s.view === view)
      return slotLabel(t, view, slot?.labelEs ?? view)
    },
    [t],
  )

  const ariaLabel = t('identify.wizardAriaLabel', {
    defaultValue: 'Captura multi-vista guiada',
  })
  const progressAria = t('identify.progressAria', {
    filled: readiness.filled,
    total: 4,
    defaultValue: `Progreso ${readiness.filled} de 4`,
  })

  return (
    <section
      className="multi-view-wizard"
      aria-label={ariaLabel}
      data-testid="multi-view-wizard"
      data-hard-view-min={hardMinViews ? 'true' : 'false'}
      data-can-submit={readiness.canSubmit ? 'true' : 'false'}
      data-filled={readiness.filled}
    >
      <div className="mv-header">
        <h2>
          {t('identify.wizardTitle', {
            defaultValue: 'Varias fotos = mejor pista',
          })}
        </h2>
        <p>
          {t('identify.wizardSubtitle', {
            defaultValue:
              'Como las mejores apps de campo: inferior + perfil primero (crítico), luego hábitat y detalle. No garantiza identificación ni consumo.',
          })}
        </p>

        <ol className="mv-ritual" aria-label={progressAria}>
          {VIEW_SLOTS.map((slot, i) => {
            const filled = Boolean(assignments[slot.view])
            const isNext =
              !filled && VIEW_SLOTS.findIndex((s) => !assignments[s.view]) === i
            const label = slotLabel(t, slot.view, slot.labelEs)
            return (
              <li
                key={slot.view}
                className={`mv-ritual__step ${filled ? 'is-done' : ''} ${isNext ? 'is-next' : ''}`}
              >
                <span className="mv-ritual__dot" aria-hidden="true">
                  {filled ? 'Ô£ô' : i + 1}
                </span>
                <span className="mv-ritual__label">{label}</span>
              </li>
            )
          })}
        </ol>

        <p className="mv-progress">
          <strong>
            {t('identify.progressCount', {
              filled: readiness.filled,
              total: 4,
              defaultValue: `${readiness.filled}/4`,
            })}
          </strong>{' '}
          {t('identify.progressViewsLabel', { defaultValue: 'vistas' })}
          {readiness.missingRequired.length > 0 && (
            <span className="mv-warn">
              {' '}
              ┬À{' '}
              {t('identify.missingCritical', {
                views: readiness.missingRequired.map(labelOf).join(', '),
                defaultValue: `faltan cr├¡ticas: ${readiness.missingRequired.map(labelOf).join(', ')}`,
              })}
            </span>
          )}
        </p>

        {hardMinViews && !readiness.canSubmit && readiness.filled > 0 && (
          <p className="mv-warn mv-hard-block" data-testid="mv-hard-block" role="status">
            {t('identify.readiness.hard_blocked', {
              defaultValue:
                'Modo estricto: añade las vistas críticas (láminas y frontal) antes de analizar.',
            })}
          </p>
        )}

        {/* Progressive soft coach: 1-photo → critical pair → full 4-pack */}
        <p
          className={`mv-progressive-coach mv-progressive-coach--${coach.code}`}
          data-testid="mv-progressive-coach"
          data-coach-stage={coach.stage}
          data-coach-code={coach.code}
          data-next-view={coach.nextView || ''}
          role="status"
        >
          <strong>
            {t('identify.progressiveCoach.label', {
              defaultValue: 'Guía multi-foto',
            })}
            {': '}
          </strong>
          {progressiveHeadline}
          {coach.softSubmitAllowed && coach.stage > 0 && coach.stage < 4 ? (
            <span className="mv-progressive-coach__soft">
              {' '}
              {t('identify.progressiveCoach.softOk', {
                defaultValue: '(Envío soft permitido — orientación, no consumo.)',
              })}
            </span>
          ) : null}
        </p>

        {qualityHint && (
          <p className="mv-quality-hint" data-testid="mv-quality-hint" role="status">
            {qualityHint}
          </p>
        )}

        <p
          className="mv-deadly-coach"
          data-testid="mv-deadly-diagnostic-coach"
          role="note"
        >
          {deadlyCoachText}
          {deadlyMissing.length > 0 && (
            <span className="mv-deadly-coach__missing">
              {' '}
              {t('identify.deadlyDiagnostic.missing', {
                views: deadlyMissing.map(labelOf).join(', '),
                defaultValue: `Aún faltan vistas diagnósticas: ${deadlyMissing.map(labelOf).join(', ')}.`,
              })}
            </span>
          )}
        </p>
      </div>

      <div className="mv-grid">
        {VIEW_SLOTS.map((slot) => {
          const filled = assignments[slot.view]
          const label = slotLabel(t, slot.view, slot.labelEs)
          const hint = slotHint(t, slot.view, slot.hintEs)
          return (
            <div
              key={slot.view}
              className={`mv-slot ${filled ? 'mv-slot--filled' : ''} ${slot.required ? 'mv-slot--required' : ''}`}
              data-view={slot.view}
              data-required={slot.required ? 'true' : 'false'}
            >
              <div className="mv-slot-title">
                <span className="mv-slot-icon" aria-hidden="true">
                  <ViewIcon view={slot.view} size={18} />
                </span>
                <span>{label}</span>
                {slot.required ? (
                  <span className="mv-badge">
                    {t('identify.badgeCritical', { defaultValue: 'crítica' })}
                  </span>
                ) : (
                  <span className="mv-badge mv-badge--opt">
                    {t('identify.badgeOptional', { defaultValue: 'opcional' })}
                  </span>
                )}
                {isDeadlyCriticalView(slot.view) && (
                  <span
                    className="mv-badge mv-badge--diag"
                    data-testid={`mv-diag-badge-${slot.view}`}
                    title={t('identify.deadlyDiagnostic.badgeTitle', {
                      defaultValue:
                        'Vista prioritaria para confusiones con especies peligrosas (educativo)',
                    })}
                  >
                    {t('identify.deadlyDiagnostic.badge', { defaultValue: 'diag' })}
                  </span>
                )}
              </div>
              <p className="mv-hint">{hint}</p>
              {filled ? (
                <div className="mv-preview-wrap">
                  <img
                    src={filled.previewUrl}
                    alt={t('identify.viewAlt', {
                      view: label,
                      defaultValue: `Vista ${label}`,
                    })}
                    className="mv-preview"
                  />
                  <button type="button" className="mv-clear" onClick={() => onClear(slot.view)}>
                    {t('identify.remove', { defaultValue: 'Quitar' })}
                  </button>
                </div>
              ) : (
                <div className="mv-slot-actions">
                  {/* Static framing assist — never continuous species green-light */}
                  <div
                    className={`mv-frame-guide mv-frame-guide--${slot.view}`}
                    data-testid={`mv-frame-guide-${slot.view}`}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 120 90" className="mv-frame-guide__svg">
                      <rect
                        x="8"
                        y="8"
                        width="104"
                        height="74"
                        rx="8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                        opacity="0.45"
                      />
                      {slot.view === 'gills' && (
                        <>
                          <ellipse cx="60" cy="42" rx="34" ry="22" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
                          <path d="M30 42 Q45 52 60 42 Q75 32 90 42" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                          <path d="M32 48 Q48 58 60 48 Q72 38 88 48" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
                        </>
                      )}
                      {slot.view === 'front' && (
                        <>
                          <ellipse cx="60" cy="28" rx="28" ry="14" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
                          <path d="M60 40 v28" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
                          <ellipse cx="60" cy="70" rx="10" ry="5" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.45" />
                        </>
                      )}
                      {slot.view === 'habitat' && (
                        <>
                          <path d="M12 68 Q40 50 60 62 T108 55" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
                          <ellipse cx="58" cy="52" rx="14" ry="8" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
                          <path d="M90 70 v-22 M86 54 h8" stroke="currentColor" strokeWidth="1.1" opacity="0.4" />
                        </>
                      )}
                      {slot.view === 'detail' && (
                        <>
                          <circle cx="60" cy="45" r="22" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
                          <circle cx="60" cy="45" r="8" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                          <path d="M48 58 Q60 68 72 58" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                        </>
                      )}
                    </svg>
                    <span className="mv-frame-guide__label">
                      {framingGuideForView(slot.view, locale).title}
                    </span>
                  </div>
                  <p className="mv-frame-guide__body" data-testid={`mv-frame-body-${slot.view}`}>
                    {framingGuideForView(slot.view, locale).body}
                  </p>
                  <button
                    type="button"
                    className="mv-add"
                    onClick={() => inputRefs.current[slot.view]?.click()}
                  >
                    <span className="mv-add-icon" aria-hidden="true">
                      <ViewIcon view={slot.view} size={28} />
                    </span>
                    {t('identify.gallery', { defaultValue: 'Galería' })}
                  </button>
                  {onOpenCamera && (
                    <button
                      type="button"
                      className="btn-atelier btn-atelier--ghost mv-camera-btn"
                      onClick={onOpenCamera}
                    >
                      <IconCamera size={16} />
                      {t('identify.camera', {
                        defaultValue: t('identify.takePhoto', { defaultValue: 'Cámara' }),
                      })}
                    </button>
                  )}
                </div>
              )}
              <input
                ref={(el) => {
                  inputRefs.current[slot.view] = el
                }}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  onFile(slot.view, e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
          )
        })}
      </div>
      {readiness.warningCodes.length > 0 && (
        <ul className="mv-warnings" data-testid="mv-warnings">
          {readiness.warningCodes.map((code, i) => (
            <li key={code} data-warning-code={code}>
              {warningText(t, code, readiness.missingRequired, labelOf, readiness.warnings[i])}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
