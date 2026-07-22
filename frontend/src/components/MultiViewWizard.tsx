/**
 * Guided multi-view capture — 4-step ritual (Wave C/D).
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
} from '../lib/multiViewSlots'
import { featureFlags } from '../lib/featureFlags'
import { IconCamera, ViewIcon } from './icons'

type Props = {
  assignments: SlotAssignment
  onAssign: (view: CanonicalView, file: File, previewUrl: string) => void
  onClear: (view: CanonicalView) => void
  onOpenCamera?: () => void
  /** B-36 deep-link: highlight + scroll this wizard slot. */
  focusView?: CanonicalView | null
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
  const { t } = useTranslation()
  const hardMinViews = featureFlags.HARD_VIEW_MIN
  const readiness = useMemo(
    () => assessMultiViewReadiness(assignments, { hardMinViews }),
    [assignments, hardMinViews],
  )
  const inputRefs = useRef<Partial<Record<CanonicalView, HTMLInputElement | null>>>({})
  const slotElRefs = useRef<Partial<Record<CanonicalView, HTMLDivElement | null>>>({})

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
          {t('identify.wizardTitle', { defaultValue: 'Cuatro vistas de campo' })}
        </h2>
        <p>
          {t('identify.wizardSubtitle', {
            defaultValue:
              'Láminas, perfil, hábitat y detalle. Completa las críticas antes de analizar.',
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
                  {filled ? '✓' : i + 1}
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
              ·{' '}
              {t('identify.missingCritical', {
                views: readiness.missingRequired.map(labelOf).join(', '),
                defaultValue: `faltan críticas: ${readiness.missingRequired.map(labelOf).join(', ')}`,
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
