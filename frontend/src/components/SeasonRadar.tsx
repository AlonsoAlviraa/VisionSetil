/** Season Radar — photography-first educational taxa for the current season. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ensureSeasonCatalog,
  seasonRadarSnapshot,
  taxaForSeason,
  SEASON_META,
  type SeasonId,
} from '../lib/seasonRadar'
import { RiskChip } from './RiskChip'
import { SpeciesNameBlock } from './SpeciesNameBlock'
import { SpeciesThumb } from './SpeciesThumb'

type Props = {
  seasonId?: SeasonId
  date?: Date
  compact?: boolean
  className?: string
}

export function SeasonRadar({ seasonId, date, compact, className = '' }: Props) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void ensureSeasonCatalog().then(() => setReady(true))
  }, [])
  const base = seasonRadarSnapshot(date)
  const season = seasonId ? SEASON_META[seasonId] : base.season
  const taxa = ready ? taxaForSeason(season.id, compact ? 4 : 7) : []

  return (
    <section
      className={`season-radar ${compact ? 'season-radar--compact' : ''} ${className}`.trim()}
      aria-labelledby="season-radar-title"
    >
      <div className="season-radar__head">
        <p className="atelier-kicker" style={{ color: 'var(--ink-mute)' }}>
          Radar de temporada
        </p>
        <h2 id="season-radar-title" className="season-radar__title">
          {season.labelEs}
          <span className="season-radar__months"> · {season.months}</span>
        </h2>
        <p className="season-radar__note">{season.note}</p>
        <p className="season-radar__disc" role="note">
          {base.disclaimer}
        </p>
      </div>
      <ul className="season-radar__list">
        {taxa.map((t) => (
          <li key={t.taxon}>
            <Link to={`/enciclopedia/${t.slug}`} className="season-radar__item">
              <SpeciesThumb
                taxon={t.taxon}
                riskLabel={t.risk_label}
                size={compact ? 48 : 56}
                className="season-radar__thumb"
              />
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
