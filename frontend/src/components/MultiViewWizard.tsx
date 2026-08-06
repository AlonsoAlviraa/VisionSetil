/**
 * Guided multi-view capture — 4 slots, field-ready, orientation-only.
 * Soft readiness (≥1 photo); critical views (gills/front) recommended.
 * PhotoCoach panel (UX-03): educates better photos — never consumption.
 */
import { useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  VIEW_SLOTS,
  type CanonicalView,
  type MultiViewWarningCode,
  type SlotAssignment,
  assessMultiViewReadiness,
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
import { prepareIdentifyImageFile } from '../lib/prepareIdentifyImage'
import { IconCamera, ViewIcon } from './icons'
import { Button } from './ui'
import { PhotoCoachPanel } from './PhotoCoachPanel'

type Props = {
  assignments: SlotAssignment
  onAssign: (view: CanonicalView, file: File, previewUrl: string) => void
  onClear: (view: CanonicalView) => void
  /** Opens camera for a specific wizard slot. */
  onOpenCamera?: (view: CanonicalView) => void
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
      const raw = fileList?.[0]
      if (!raw) return
      // Async re-encode (JPEG edge cap) — fail-open to original file
      void prepareIdentifyImageFile(raw).then((file) => {
        const previewUrl = URL.createObjectURL(file)
        onAssign(view, file, previewUrl)
      })
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

  const nextEmpty = VIEW_SLOTS.find((s) => !assignments[s.view])?.view ?? null
  const pct = Math.round((readiness.filled / FULL_PACKET_PHOTOS) * 100)
  const filledKeys = orderedSlotKeys(assignments)
  /** Checklist/examples target: next empty slot, else last filled, else gills. */
  const coachView: CanonicalView = nextEmpty ?? filledKeys.slice(-1)[0] ?? 'gills'
  /**
   * Quality hints from last filled photo (not the empty next-slot), so edge/aspect
   * and file_tiny can fire while the checklist still coaches the next view.
   * previewUrl drives progressive dim probe in PhotoCoachPanel (fail-open).
   */
  const hintView: CanonicalView | null = filledKeys.slice(-1)[0] ?? null
  const hintSlot = hintView ? assignments[hintView] : undefined
  const coachFileMeta = useMemo(() => {
    if (!hintSlot) return undefined
    const byteLength = hintSlot.file?.size
    const previewUrl = hintSlot.previewUrl || undefined
    if (byteLength == null && !previewUrl) return undefined
    return {
      byteLength,
      previewUrl,
    }
  }, [hintSlot?.file?.size, hintSlot?.previewUrl, hintView])

  return (
    <section
      className="multi-view-wizard multi-view-wizard--clean"
      aria-label={t('identify.wizardAriaLabel', {
        defaultValue: 'Captura multi-vista guiada',
      })}
      data-testid="multi-view-wizard"
      data-hard-view-min={hardMinViews ? 'true' : 'false'}
      data-can-submit={readiness.canSubmit ? 'true' : 'false'}
      data-filled={readiness.filled}
    >
      <header className="mv-header">
        <div className="mv-header__top">
          <div>
            <h2 className="mv-header__title">
              {t('identify.wizardTitle', {
                defaultValue: 'Cuatro fotos, mejor pista',
              })}
            </h2>
            <p className="mv-header__lead">
              {t('identify.wizardSubtitleShort', {
                defaultValue:
                  'Empieza por láminas y perfil. Opcional: hábitat y detalle. Solo orientación — nunca consumo.',
              })}
            </p>
          </div>
          <div
            className="mv-progress-ring"
            role="progressbar"
            aria-valuenow={readiness.filled}
            aria-valuemin={0}
            aria-valuemax={4}
            aria-label={t('identify.progressAria', {
              filled: readiness.filled,
              total: 4,
              defaultValue: `Progreso ${readiness.filled} de 4`,
            })}
          >
            <strong>
              {t('identify.progressCount', {
                filled: readiness.filled,
                total: 4,
                defaultValue: `${readiness.filled}/4`,
              })}
            </strong>
            <span>{t('identify.progressViewsLabel', { defaultValue: 'vistas' })}</span>
          </div>
        </div>

        <div className="mv-progress-track" aria-hidden="true">
          <div className="mv-progress-track__fill" style={{ width: `${pct}%` }} />
        </div>

        <ol
          className="mv-ritual"
          aria-label={t('identify.progressViewsLabel', { defaultValue: 'vistas' })}
        >
          {VIEW_SLOTS.map((slot, i) => {
            const filled = Boolean(assignments[slot.view])
            const isNext = slot.view === nextEmpty
            const label = slotLabel(t, slot.view, slot.labelEs)
            return (
              <li
                key={slot.view}
                className={`mv-ritual__step ${filled ? 'is-done' : ''} ${isNext ? 'is-next' : ''}`}
              >
                <span className="mv-ritual__dot" aria-hidden="true">
                  {filled ? '✓' : i + 1}
                </span>
                <span className="mv-ritual__label">{label}</span>
              </li>
            )
          })}
        </ol>

        {/* Single coach line (contracts keep progressive + quality testids) */}
        <p
          className={`mv-status mv-progressive-coach mv-progressive-coach--${coach.code}`}
          data-testid="mv-progressive-coach"
          data-coach-stage={coach.stage}
          data-coach-code={coach.code}
          data-next-view={coach.nextView || ''}
          role="status"
        >
          <span className="mv-status__label">
            {t('identify.progressiveCoach.label', {
              defaultValue: 'Siguiente',
            })}
          </span>
          <span className="mv-status__text">{progressiveHeadline}</span>
          {coach.softSubmitAllowed && coach.stage > 0 && coach.stage < 4 ? (
            <span className="mv-progressive-coach__soft visually-hidden">
              {t('identify.progressiveCoach.softOk', {
                defaultValue: '(Envío soft permitido — orientación, no consumo.)',
              })}
            </span>
          ) : null}
        </p>

        {readiness.filled > 0 && (
          <p className="mv-quality-hint visually-hidden" data-testid="mv-quality-hint" role="status">
            {progressiveHeadline}
          </p>
        )}

        {hardMinViews && !readiness.canSubmit && readiness.filled > 0 && (
          <p className="mv-warn mv-hard-block" data-testid="mv-hard-block" role="status">
            {t('identify.readiness.hard_blocked', {
              defaultValue:
                'Añade las vistas críticas (láminas y perfil) antes de analizar.',
            })}
          </p>
        )}

        {readiness.filled > 0 && deadlyMissing.length > 0 && (
          <p
            className="mv-deadly-coach mv-deadly-coach--compact"
            data-testid="mv-deadly-diagnostic-coach"
            role="note"
          >
            <span className="visually-hidden">{deadlyCoachText}</span>
            {t('identify.deadlyDiagnostic.missingShort', {
              views: deadlyMissing.map(labelOf).join(', '),
              defaultValue: `Para confusiones de riesgo, falta: ${deadlyMissing.map(labelOf).join(', ')}.`,
            })}
          </p>
        )}
        {readiness.filled === 0 && (
          <p
            className="mv-deadly-coach visually-hidden"
            data-testid="mv-deadly-diagnostic-coach"
            role="note"
          >
            {deadlyCoachText}
          </p>
        )}
      </header>

      <div className="mv-grid">
        {VIEW_SLOTS.map((slot) => {
          const filled = assignments[slot.view]
          const label = slotLabel(t, slot.view, slot.labelEs)
          const hint = slotHint(t, slot.view, slot.hintEs)
          const isNext = !filled && slot.view === nextEmpty
          const frame = framingGuideForView(slot.view, locale)
          return (
            <article
              key={slot.view}
              className={[
                'mv-slot',
                filled ? 'mv-slot--filled' : '',
                slot.required ? 'mv-slot--required' : '',
                isNext ? 'mv-slot--next' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-view={slot.view}
              data-required={slot.required ? 'true' : 'false'}
            >
              <header className="mv-slot-title">
                <span className="mv-slot-icon" aria-hidden="true">
                  <ViewIcon view={slot.view} size={18} />
                </span>
                <span className="mv-slot-name">{label}</span>
                {slot.required ? (
                  <span className="mv-badge">
                    {t('identify.badgeCritical', { defaultValue: 'clave' })}
                  </span>
                ) : (
                  <span className="mv-badge mv-badge--opt">
                    {t('identify.badgeOptional', { defaultValue: 'opcional' })}
                  </span>
                )}
                {isDeadlyCriticalView(slot.view) && (
                  <span
                    className="mv-badge mv-badge--diag visually-hidden"
                    data-testid={`mv-diag-badge-${slot.view}`}
                    title={t('identify.deadlyDiagnostic.badgeTitle', {
                      defaultValue:
                        'Vista prioritaria para confusiones con especies peligrosas (educativo)',
                    })}
                  >
                    {t('identify.deadlyDiagnostic.badge', { defaultValue: 'diag' })}
                  </span>
                )}
              </header>

              {filled ? (
                <div className="mv-preview-wrap">
                  <img
                    src={filled.previewUrl}
                    alt={t('identify.viewAlt', {
                      view: label,
                      defaultValue: `Vista ${label}`,
                    })}
                    className="mv-preview"
                    // User-selected blob previews are above-fold — lazy can blank on mobile WebView/PWA
                    loading="eager"
                    decoding="async"
                    data-testid={`mv-preview-${slot.view}`}
                    onError={(e) => {
                      e.currentTarget.style.opacity = '0.35'
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mv-clear"
                    onClick={() => onClear(slot.view)}
                    aria-label={t('identify.removeView', {
                      defaultValue: 'Quitar foto de esta vista',
                    })}
                  >
                    {t('identify.remove', { defaultValue: 'Quitar' })}
                  </Button>
                </div>
              ) : (
                <div className="mv-slot-actions">
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
                          <ellipse
                            cx="60"
                            cy="42"
                            rx="34"
                            ry="22"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            opacity="0.55"
                          />
                          <path
                            d="M30 42 Q45 52 60 42 Q75 32 90 42"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1"
                            opacity="0.4"
                          />
                        </>
                      )}
                      {slot.view === 'front' && (
                        <>
                          <ellipse
                            cx="60"
                            cy="28"
                            rx="28"
                            ry="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            opacity="0.55"
                          />
                          <path
                            d="M60 40 v28"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            opacity="0.5"
                          />
                          <ellipse
                            cx="60"
                            cy="70"
                            rx="10"
                            ry="5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.1"
                            opacity="0.45"
                          />
                        </>
                      )}
                      {slot.view === 'habitat' && (
                        <>
                          <path
                            d="M12 68 Q40 50 60 62 T108 55"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            opacity="0.4"
                          />
                          <ellipse
                            cx="58"
                            cy="52"
                            rx="14"
                            ry="8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.1"
                            opacity="0.5"
                          />
                        </>
                      )}
                      {slot.view === 'detail' && (
                        <>
                          <circle
                            cx="60"
                            cy="45"
                            r="22"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            opacity="0.5"
                          />
                          <circle
                            cx="60"
                            cy="45"
                            r="8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1"
                            opacity="0.4"
                          />
                        </>
                      )}
                    </svg>
                    <span className="mv-frame-guide__label">{frame.title}</span>
                  </div>
                  <p className="mv-hint">{hint}</p>
                  <p
                    className="mv-frame-guide__body visually-hidden"
                    data-testid={`mv-frame-body-${slot.view}`}
                  >
                    {frame.body}
                  </p>
                  <div className="mv-slot-cta-row">
                    {onOpenCamera && (
                      <Button
                        type="button"
                        variant="primary"
                        className="mv-camera-btn"
                        onClick={() => onOpenCamera(slot.view)}
                      >
                        <IconCamera size={16} />
                        {t('identify.camera', {
                          defaultValue: 'Cámara',
                        })}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant={onOpenCamera ? 'ghost' : 'primary'}
                      className="mv-add"
                      onClick={() => inputRefs.current[slot.view]?.click()}
                    >
                      {t('identify.gallery', { defaultValue: 'Galería' })}
                    </Button>
                  </div>
                </div>
              )}
              {/*
                Galería MUST NOT set capture=environment — on iOS/Android WebView/PWA
                that forces the camera and blocks photo-library pick (app shell break
                while desktop web still works). Camera path uses CameraCapture (getUserMedia).
              */}
              <input
                ref={(el) => {
                  inputRefs.current[slot.view] = el
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                // No capture attr — library picker on phones; camera is explicit CTA
                data-testid={`mv-gallery-input-${slot.view}`}
                className="mv-gallery-input"
                hidden
                onChange={(e) => {
                  onFile(slot.view, e.target.files)
                  e.target.value = ''
                }}
              />
            </article>
          )
        })}
      </div>

      <PhotoCoachPanel
        view={coachView}
        fileMeta={coachFileMeta}
        className="multi-view-wizard__photo-coach"
      />

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
