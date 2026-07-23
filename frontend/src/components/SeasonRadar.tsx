/** Season Radar — magazine strip educational taxa for the current season (Phase C). */
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ensureSeasonCatalog,
  isSeasonPackEnabled,
  seasonRadarSnapshot,
  seasonRadarSnapshotSync,
  taxaForSeason,
  SEASON_META,
  type SeasonId,
} from '../lib/seasonRadar'
import { RiskChip } from './RiskChip'
import { SpeciesNameBlock } from './SpeciesNameBlock'
import { SpeciesThumb } from './SpeciesThumb'
import { featureFlags } from '../lib/featureFlags'

type Props = {
  seasonId?: SeasonId
  date?: Date
  compact?: boolean
  className?: string
}

export function SeasonRadar({ seasonId, date, compact, className = '' }: Props) {
  const packOn = isSeasonPackEnabled()

  // Pack path: sync, no catalog wait. Legacy: hydrate catalog once.
  useEffect(() => {
    if (packOn) return
    void ensureSeasonCatalog()
  }, [packOn])

  const base = useMemo(() => {
    if (packOn) return seasonRadarSnapshotSync(date)
    return seasonRadarSnapshot(date)
  }, [date, packOn])

  const season = seasonId ? SEASON_META[seasonId] : base.season
  const taxa = packOn
    ? (seasonId
        ? taxaForSeason(seasonId, compact ? 4 : 7)
        : base.taxa.slice(0, compact ? 4 : 7))
    : taxaForSeason(season.id, compact ? 4 : 7)

  // C-23: mark ready as soon as pack taxa are known (no catalog hang)
  useEffect(() => {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark('season-radar-ready')
    }
  }, [season.id, taxa.length, packOn])

  const immersive = featureFlags.HOME_SEASON_IMMERSE && !compact

  return (
    <section
      className={[
        'season-radar',
        compact ? 'season-radar--compact' : '',
        immersive ? 'season-radar--immersive' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby="season-radar-title"
      data-testid="season-radar"
      data-pack={packOn ? '1' : '0'}
      data-ready="1"
    >
      <div className="season-radar__mood" aria-hidden />
      <div className="season-radar__head">
        <p className="atelier-kicker" style={{ color: 'var(--ink-mute)' }}>
          Radar de temporada
        </p>
        <h2 id="season-radar-title" className="season-radar__title">
          {season.labelEs}
          <span className="season-radar__months"> · {season.months}</span>
        </h2>
        <p className="season-radar__note">{season.note}</p>
        <p className="season-radar__disc" role="note" data-testid="season-disclaimer">
          {base.disclaimer}
        </p>
      </div>
      <ul className="season-radar__list" data-testid="season-radar-list">
        {taxa.map((t) => (
          <li key={t.slug || t.taxon}>
            <Link to={`/enciclopedia/${t.slug}`} className="season-radar__item">
              <div className="season-radar__photo">
                <SpeciesThumb
                  taxon={t.taxon}
                  slug={t.slug}
                  riskLabel={t.risk_label}
                  /* Immersive: fill 4:5 cell (no forced 56px). Compact lists keep fixed size. */
                  fill={immersive}
                  size={compact ? 48 : 56}
                  className="season-radar__thumb"
                />
              </div>
              <div className="season-radar__copy">
                <RiskChip risk={t.risk_label} />
                <SpeciesNameBlock
                  taxon={t.taxon}
                  commonNames={[t.common_name]}
                  size="sm"
                  showFamily={false}
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
