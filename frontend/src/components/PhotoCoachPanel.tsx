/**
 * PhotoCoach panel — multi-view learning (UX-03).
 * Works with ZERO webp: JSON captions + CSS wireframes; optional thumbs progressive.
 * Orientation only — never consumption permission.
 */
import { useCallback, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { CanonicalView } from '../lib/multiViewSlots'
import {
  assessPhotoClientHints,
  checklistForView,
  examplesForView,
  recordPhotoCoachOpen,
  type CoachHint,
} from '../lib/photoCoach'
import { featureFlags } from '../lib/featureFlags'

export type PhotoCoachPanelProps = {
  /** Active / next slot the coach explains. */
  view: CanonicalView
  /** Optional file metadata for client quality hints. */
  fileMeta?: {
    byteLength?: number
    width?: number
    height?: number
    lumaMean?: number
  }
  /** Start expanded (default collapsed). */
  defaultOpen?: boolean
  className?: string
}

function hintFallbackEs(code: string): string {
  switch (code) {
    case 'file_tiny':
      return 'Archivo muy pequeño: puede faltar detalle diagnóstico.'
    case 'edge_small':
      return 'Resolución baja en el lado corto: acércate o usa más megapíxeles.'
    case 'aspect_extreme':
      return 'Proporción extrema: reencuadra la seta al centro.'
    case 'luma_dark':
      return 'Imagen muy oscura: busca luz frontal (sin flash cegador).'
    case 'luma_bright':
      return 'Imagen muy clara: evita contraluz y brillos quemados.'
    default:
      return 'Revisa el encuadre diagnóstico.'
  }
}

function hintFallbackEn(code: string): string {
  switch (code) {
    case 'file_tiny':
      return 'File is very small: diagnostic detail may be missing.'
    case 'edge_small':
      return 'Short edge is low-res: move closer or use more megapixels.'
    case 'aspect_extreme':
      return 'Extreme aspect ratio: reframe the mushroom in the center.'
    case 'luma_dark':
      return 'Very dark image: prefer front light (no blinding flash).'
    case 'luma_bright':
      return 'Very bright image: avoid backlight and blown highlights.'
    default:
      return 'Check diagnostic framing.'
  }
}

export function PhotoCoachPanel({
  view,
  fileMeta,
  defaultOpen = false,
  className = '',
}: PhotoCoachPanelProps) {
  const { t, i18n } = useTranslation()
  const panelId = useId()
  const [open, setOpen] = useState(defaultOpen)
  const [thumbFailed, setThumbFailed] = useState<Record<string, boolean>>({})
  const locale = (i18n.resolvedLanguage || i18n.language || 'es').toLowerCase()
  const en = locale.startsWith('en')

  const checklist = useMemo(() => checklistForView(view), [view])
  const examples = useMemo(() => examplesForView(view), [view])

  const clientHints: CoachHint[] = useMemo(() => {
    const byteLength = fileMeta?.byteLength
    if (byteLength == null && fileMeta?.width == null) return []
    return assessPhotoClientHints(
      {
        byteLength: byteLength ?? 0,
        width: fileMeta?.width,
        height: fileMeta?.height,
        lumaMean: fileMeta?.lumaMean,
      },
      { luminance: featureFlags.PHOTO_COACH_LUMINANCE },
    )
  }, [fileMeta])

  const onToggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      if (next && typeof localStorage !== 'undefined') {
        try {
          recordPhotoCoachOpen(localStorage)
        } catch {
          /* fail-open */
        }
      }
      return next
    })
  }, [])

  const viewLabel = t(`identify.views.${view}`, {
    defaultValue: view,
  })

  return (
    <section
      className={['photo-coach-panel', open ? 'is-open' : '', className].filter(Boolean).join(' ')}
      data-testid="photo-coach-panel"
      data-view={view}
      data-open={open ? 'true' : 'false'}
      aria-label={t('identify.coach.panelAria', {
        view: viewLabel,
        defaultValue: `Consejos de foto para ${viewLabel}`,
      })}
    >
      <button
        type="button"
        className="photo-coach-panel__toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="photo-coach-toggle"
      >
        <span className="photo-coach-panel__toggle-title">
          {t('identify.coach.title', { defaultValue: 'Cómo fotografiar esta vista' })}
        </span>
        <span className="photo-coach-panel__toggle-view">{viewLabel}</span>
        <span className="photo-coach-panel__chevron" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>

      <div
        id={panelId}
        className="photo-coach-panel__body"
        hidden={!open}
        data-testid="photo-coach-body"
      >
        <p className="photo-coach-panel__policy" role="note">
          {t('identify.coach.policy', {
            defaultValue:
              'Solo orientación de campo — mejores fotos reducen confusiones, nunca autorizan consumo.',
          })}
        </p>

        <ul className="photo-coach-panel__checklist" data-testid="photo-coach-checklist">
          {checklist.map((item) => (
            <li key={item.id} data-checklist-id={item.id}>
              {t(`identify.coach.checklist.${view}.${item.id}`, {
                defaultValue: en ? item.labelEn : item.labelEs,
              })}
            </li>
          ))}
        </ul>

        <div className="photo-coach-panel__examples" data-testid="photo-coach-examples">
          {examples.map((ex) => {
            const label = en ? ex.labelEn : ex.labelEs
            const showThumb = Boolean(ex.thumb) && !thumbFailed[ex.id]
            return (
              <figure
                key={ex.id}
                className={`photo-coach-example photo-coach-example--${ex.quality}`}
                data-quality={ex.quality}
                data-example-id={ex.id}
              >
                <div
                  className={[
                    'photo-coach-frame',
                    `photo-coach-frame--${ex.cssFrame}`,
                    `photo-coach-frame--${ex.quality}`,
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {showThumb ? (
                    <img
                      src={ex.thumb}
                      alt=""
                      className="photo-coach-frame__thumb"
                      loading="lazy"
                      decoding="async"
                      onError={() =>
                        setThumbFailed((prev) => ({ ...prev, [ex.id]: true }))
                      }
                    />
                  ) : (
                    <span className="photo-coach-frame__wire" />
                  )}
                  <span className="photo-coach-frame__badge">
                    {ex.quality === 'good'
                      ? t('identify.coach.good', { defaultValue: 'Bien' })
                      : t('identify.coach.bad', { defaultValue: 'Mal' })}
                  </span>
                </div>
                <figcaption className="photo-coach-example__caption">{label}</figcaption>
              </figure>
            )
          })}
        </div>

        {clientHints.length > 0 && (
          <ul className="photo-coach-panel__hints" data-testid="photo-coach-hints" role="status">
            {clientHints.map((h) => (
              <li
                key={h.code}
                data-hint-code={h.code}
                data-severity={h.severity}
                className={`photo-coach-hint photo-coach-hint--${h.severity}`}
              >
                {t(h.messageKey, {
                  defaultValue: en ? hintFallbackEn(h.code) : hintFallbackEs(h.code),
                })}
              </li>
            ))}
          </ul>
        )}

        <Link
          to="/educacion#multi-view"
          className="photo-coach-panel__edu-link"
          data-testid="photo-coach-edu-link"
        >
          {t('identify.coach.learnMore', {
            defaultValue: 'Cómo fotografiar (guía multi-vista)',
          })}
        </Link>
      </div>
    </section>
  )
}
