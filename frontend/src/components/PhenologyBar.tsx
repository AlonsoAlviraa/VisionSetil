/**
 * Educational 12-month phenology bar for species detail.
 * Not a harvest calendar — orientation only.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { buildPhenologyBar, isInSeasonNow } from '../lib/phenology'

type Props = {
  season: string | null | undefined
  className?: string
}

export function PhenologyBar({ season, className = '' }: Props) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const bar = useMemo(
    () => buildPhenologyBar(season, { locale }),
    [season, locale],
  )
  const inSeason = useMemo(() => isInSeasonNow(season), [season])

  if (!season || !String(season).trim()) return null

  return (
    <section
      className={`phenology-bar ${className}`.trim()}
      aria-label={t('detail.phenology.aria', {
        defaultValue: 'Temporada educativa',
      })}
      data-testid="phenology-bar"
    >
      <header className="phenology-bar__head">
        <h3 className="phenology-bar__title">
          {t('detail.phenology.title', { defaultValue: 'Temporada (educativa)' })}
        </h3>
        {inSeason ? (
          <span className="phenology-bar__chip phenology-bar__chip--now" data-testid="phenology-in-season">
            {t('detail.phenology.inSeason', {
              defaultValue: 'En ventana típica ahora',
            })}
          </span>
        ) : (
          <span className="phenology-bar__chip">
            {t('detail.phenology.outSeason', {
              defaultValue: 'Fuera de ventana típica',
            })}
          </span>
        )}
      </header>
      <p className="phenology-bar__label">
        {bar.seasonLabels.length
          ? bar.seasonLabels.join(' · ')
          : season}
      </p>
      <ol className="phenology-bar__months" aria-hidden="false">
        {bar.months.map((m) => (
          <li
            key={m.month}
            className={[
              'phenology-bar__month',
              m.active ? 'is-active' : '',
              m.isCurrent ? 'is-current' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={m.label}
          >
            <span className="phenology-bar__month-lab">{m.label}</span>
            <span className="phenology-bar__month-seg" />
          </li>
        ))}
      </ol>
      <p className="phenology-bar__disclaimer">{bar.disclaimer}</p>
    </section>
  )
}
