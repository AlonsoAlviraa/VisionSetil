/**
 * ImageCompare — wipe | side-by-side of two user capture previews (UX-02).
 * Default pairing: gills vs front when view labels exist.
 * Footnote: orientation only · never consumption. No confetti.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui'

export type ImageCompareMode = 'side' | 'wipe'

export type ImageCompareSlot = {
  src: string
  label?: string
  view?: string
}

export type ImageCompareProps = {
  left: ImageCompareSlot
  right: ImageCompareSlot
  /** Default side-by-side; wipe uses a range slider. */
  defaultMode?: ImageCompareMode
  className?: string
  /** SSOT testid — never rename without e2e/ImageCompare tests. */
  testId?: string
  footnote?: string
}

/**
 * Pick gills vs front (or first two) from parallel viewTypes + previews arrays.
 * Returns null when fewer than 2 previews.
 */
export function pickComparePair(
  viewTypes: string[] | undefined,
  previews: string[] | undefined,
): { left: ImageCompareSlot; right: ImageCompareSlot } | null {
  const views = viewTypes || []
  const imgs = (previews || []).filter(Boolean)
  if (imgs.length < 2) return null

  const findIdx = (want: string) =>
    views.findIndex((v) => (v || '').toLowerCase() === want)

  let iLeft = findIdx('gills')
  let iRight = findIdx('front')
  if (iLeft < 0 || iLeft >= imgs.length) iLeft = 0
  if (iRight < 0 || iRight >= imgs.length || iRight === iLeft) {
    iRight = iLeft === 0 ? 1 : 0
  }
  if (iRight >= imgs.length) iRight = Math.min(1, imgs.length - 1)
  if (iLeft === iRight && imgs.length > 1) {
    iRight = (iLeft + 1) % imgs.length
  }

  return {
    left: {
      src: imgs[iLeft],
      view: views[iLeft] || 'a',
      label: views[iLeft] || 'A',
    },
    right: {
      src: imgs[iRight],
      view: views[iRight] || 'b',
      label: views[iRight] || 'B',
    },
  }
}

export function ImageCompare({
  left,
  right,
  defaultMode = 'side',
  className = '',
  testId = 'identify-result-image-compare',
  footnote,
}: ImageCompareProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<ImageCompareMode>(defaultMode)
  const [wipe, setWipe] = useState(50)

  const foot =
    footnote ||
    t('result.imageCompareFootnote', {
      defaultValue: 'Solo orientación · nunca consumo',
    })

  const leftLabel =
    left.label ||
    t(`identify.views.${left.view || 'gills'}`, {
      defaultValue: left.view || 'A',
    })
  const rightLabel =
    right.label ||
    t(`identify.views.${right.view || 'front'}`, {
      defaultValue: right.view || 'B',
    })

  const wipeStyle = useMemo(
    () =>
      ({
        ['--wipe-pct' as string]: `${wipe}%`,
      }) as CSSProperties,
    [wipe],
  )

  return (
    <section
      className={`image-compare image-compare--${mode} ${className}`.trim()}
      data-testid={testId}
      data-mode={mode}
      aria-label={t('result.imageCompareAria', {
        defaultValue: 'Comparar tus fotos',
      })}
    >
      <header className="image-compare__head">
        <strong className="image-compare__title">
          {t('result.imageCompareTitle', {
            defaultValue: 'Compara tus vistas',
          })}
        </strong>
        <div
          className="image-compare__modes"
          role="group"
          aria-label={t('result.imageCompareModeAria', {
            defaultValue: 'Modo de comparación',
          })}
        >
          <Button
            type="button"
            size="sm"
            variant={mode === 'side' ? 'secondary' : 'ghost'}
            data-testid="image-compare-mode-side"
            aria-pressed={mode === 'side'}
            onClick={() => setMode('side')}
          >
            {t('result.imageCompareSide', { defaultValue: 'Lado a lado' })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'wipe' ? 'secondary' : 'ghost'}
            data-testid="image-compare-mode-wipe"
            aria-pressed={mode === 'wipe'}
            onClick={() => setMode('wipe')}
          >
            {t('result.imageCompareWipe', { defaultValue: 'Deslizar' })}
          </Button>
        </div>
      </header>

      {mode === 'side' ? (
        <div className="image-compare__side" data-testid="image-compare-side">
          <figure className="image-compare__panel">
            <img src={left.src} alt={leftLabel} loading="lazy" decoding="async" />
            <figcaption>{leftLabel}</figcaption>
          </figure>
          <figure className="image-compare__panel">
            <img src={right.src} alt={rightLabel} loading="lazy" decoding="async" />
            <figcaption>{rightLabel}</figcaption>
          </figure>
        </div>
      ) : (
        <div
          className="image-compare__wipe"
          data-testid="image-compare-wipe"
          style={wipeStyle}
        >
          <div className="image-compare__wipe-base">
            <img src={right.src} alt={rightLabel} loading="lazy" decoding="async" />
          </div>
          <div className="image-compare__wipe-top" style={{ width: `${wipe}%` }}>
            <img src={left.src} alt={leftLabel} loading="lazy" decoding="async" />
          </div>
          <label className="image-compare__wipe-control">
            <span className="visually-hidden">
              {t('result.imageCompareWipeSlider', {
                defaultValue: 'Deslizar comparación',
              })}
            </span>
            <input
              type="range"
              min={5}
              max={95}
              value={wipe}
              data-testid="image-compare-wipe-range"
              aria-valuemin={5}
              aria-valuemax={95}
              aria-valuenow={wipe}
              onChange={(e) => setWipe(Number(e.target.value))}
            />
          </label>
          <div className="image-compare__wipe-labels" aria-hidden="true">
            <span>{leftLabel}</span>
            <span>{rightLabel}</span>
          </div>
        </div>
      )}

      <p className="image-compare__footnote" data-testid="image-compare-footnote" role="note">
        {foot}
      </p>
    </section>
  )
}
