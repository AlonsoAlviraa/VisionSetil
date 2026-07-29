/**
 * Shroomify-style “top of season” educational strip.
 * Field photos only · orientation never forage.
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  currentSeason,
  taxaForSeason,
  type SeasonTaxonCard,
} from '../lib/seasonRadar'
import { SpeciesImage } from './SpeciesImage'
import { RiskChip } from './RiskChip'

export function SeasonalTopStrip({ limit = 8 }: { limit?: number }) {
  const { t } = useTranslation()
  const season = currentSeason()
  const taxa: SeasonTaxonCard[] = taxaForSeason(season.id, limit)

  if (taxa.length === 0) return null

  return (
    <section
      className="seasonal-top-strip"
      data-testid="seasonal-top-strip"
      aria-label={t('home.seasonStripAria', {
        defaultValue: 'Especies de temporada (educativo)',
      })}
    >
      <header className="seasonal-top-strip__head">
        <p className="cn-kicker mkt-kicker">
          {t('home.seasonStripKicker', { defaultValue: 'Como las apps top' })}
        </p>
        <h2 className="seasonal-top-strip__title">
          {t('home.seasonStripTitle', {
            defaultValue: 'De temporada · {{season}}',
            season: season.labelEs,
          })}
        </h2>
        <p className="seasonal-top-strip__lead">
          {t('home.seasonStripLead', {
            defaultValue:
              'Selección educativa del mes (patrón “top del mes”). Solo orientación — no es guía de recolección.',
          })}
        </p>
      </header>
      <ul className="seasonal-top-strip__grid">
        {taxa.map((item) => (
          <li key={item.slug || item.taxon}>
            <Link
              to={`/enciclopedia/${item.slug}`}
              className="seasonal-top-strip__card"
            >
              <div className="seasonal-top-strip__media" aria-hidden="true">
                <SpeciesImage
                  scientificName={item.taxon}
                  slug={item.slug}
                  alt=""
                  variant="card"
                  layout="fill"
                  preferCatalog
                />
              </div>
              <div className="seasonal-top-strip__meta">
                <span className="seasonal-top-strip__common">
                  {item.common_name || item.taxon}
                </span>
                <em className="seasonal-top-strip__taxon">{item.taxon}</em>
                <RiskChip risk={item.risk_label} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="seasonal-top-strip__note" role="note">
        {season.note}
      </p>
    </section>
  )
}

export default SeasonalTopStrip
