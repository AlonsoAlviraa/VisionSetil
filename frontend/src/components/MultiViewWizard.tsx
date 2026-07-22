/**
 * Guided multi-view capture — 4-step ritual (Wave C/D).
 * Field-ready icons, camera per slot, no dev jargon.
 */
import { useCallback, useRef } from 'react'
import {
  VIEW_SLOTS,
  type CanonicalView,
  type SlotAssignment,
  assessMultiViewReadiness,
} from '../lib/multiViewSlots'
import { IconCamera, ViewIcon } from './icons'

type Props = {
  assignments: SlotAssignment
  onAssign: (view: CanonicalView, file: File, previewUrl: string) => void
  onClear: (view: CanonicalView) => void
  onOpenCamera?: () => void
}

export function MultiViewWizard({ assignments, onAssign, onClear, onOpenCamera }: Props) {
  const readiness = assessMultiViewReadiness(assignments)
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

  return (
    <section className="multi-view-wizard" aria-label="Captura multi-vista guiada">
      <div className="mv-header">
        <h2>Cuatro vistas de campo</h2>
        <p>Láminas, perfil, hábitat y detalle. Completa las críticas antes de analizar.</p>

        <ol className="mv-ritual" aria-label={`Progreso ${readiness.filled} de 4`}>
          {VIEW_SLOTS.map((slot, i) => {
            const filled = Boolean(assignments[slot.view])
            const isNext =
              !filled &&
              VIEW_SLOTS.slice(0, i).every((s) => assignments[s.view] || !s.required || true) &&
              VIEW_SLOTS.findIndex((s) => !assignments[s.view]) === i
            return (
              <li
                key={slot.view}
                className={`mv-ritual__step ${filled ? 'is-done' : ''} ${isNext ? 'is-next' : ''}`}
              >
                <span className="mv-ritual__dot" aria-hidden="true">
                  {filled ? '✓' : i + 1}
                </span>
                <span className="mv-ritual__label">{slot.labelEs}</span>
              </li>
            )
          })}
        </ol>

        <p className="mv-progress">
          <strong>{readiness.filled}/4</strong> vistas
          {readiness.missingRequired.length > 0 && (
            <span className="mv-warn">
              {' '}
              · faltan críticas: {readiness.missingRequired.join(', ')}
            </span>
          )}
        </p>
      </div>

      <div className="mv-grid">
        {VIEW_SLOTS.map((slot) => {
          const filled = assignments[slot.view]
          return (
            <div
              key={slot.view}
              className={`mv-slot ${filled ? 'mv-slot--filled' : ''} ${slot.required ? 'mv-slot--required' : ''}`}
            >
              <div className="mv-slot-title">
                <span className="mv-slot-icon" aria-hidden="true">
                  <ViewIcon view={slot.view} size={18} />
                </span>
                <span>{slot.labelEs}</span>
                {slot.required ? (
                  <span className="mv-badge">crítica</span>
                ) : (
                  <span className="mv-badge mv-badge--opt">opcional</span>
                )}
              </div>
              <p className="mv-hint">{slot.hintEs}</p>
              {filled ? (
                <div className="mv-preview-wrap">
                  <img src={filled.previewUrl} alt={`Vista ${slot.labelEs}`} className="mv-preview" />
                  <button type="button" className="mv-clear" onClick={() => onClear(slot.view)}>
                    Quitar
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
                    Galería
                  </button>
                  {onOpenCamera && (
                    <button
                      type="button"
                      className="btn-atelier btn-atelier--ghost mv-camera-btn"
                      onClick={onOpenCamera}
                    >
                      <IconCamera size={16} />
                      Cámara
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
      {readiness.warnings.length > 0 && (
        <ul className="mv-warnings">
          {readiness.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
