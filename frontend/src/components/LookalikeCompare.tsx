/** Side-by-side lookalike comparison (works with colleague CatalogSpecies or minimal shape). */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesImage } from './SpeciesImage'
import { scientificNameToSlug } from '../lib/slug'
import { EDIBILITY_COLORS_D16, riskToPlaceholder } from '../lib/edibility'

export interface LookalikeSpecies {
  scientific_name?: string
  taxon?: string
  slug: string
  family?: string | null
  risk_level?: string
  risk_label?: string
  edibility_code?: string
  habitat?: string | null
  season?: string | null
  common_name?: string | null
  vernacular_names?: string[]
  common_names?: string[]
  display_name?: string
}

interface LookalikeRef {
  scientific_name: string
  note_key?: string | null
}

interface LookalikeCompareProps {
  current: LookalikeSpecies
  lookalikes: LookalikeRef[]
  resolve: (scientificName: string) => LookalikeSpecies | null
}

function displayName(s: LookalikeSpecies): string {
  return (
    s.display_name ||
    s.common_name ||
    s.common_names?.[0] ||
    s.vernacular_names?.[0] ||
    s.scientific_name ||
    s.taxon ||
    s.slug
  )
}

function sciName(s: LookalikeSpecies): string {
  return s.scientific_name || s.taxon || s.slug
}

export function LookalikeCompare({ current, lookalikes, resolve }: LookalikeCompareProps) {
  const { t } = useTranslation()
  const [selectedIdx, setSelectedIdx] = useState(0)

  const pairs = useMemo(() => {
    return lookalikes.map((la) => {
      const rec = resolve(la.scientific_name)
      const slug = rec?.slug || scientificNameToSlug(la.scientific_name)
      return { la, rec, slug }
    })
  }, [lookalikes, resolve])

  if (!pairs.length) return null

  const selected = pairs[Math.min(selectedIdx, pairs.length - 1)]
  const other = selected.rec
  const curRisk = current.risk_level || current.risk_label || 'unknown'
  const curEdib = current.edibility_code || 'desconocido'

  return (
    <div className="lookalike-compare" data-testid="lookalike-section">
      <h2>↔️ {t('lookalike.title', { defaultValue: 'Confusiones posibles' })}</h2>
      <div className="lookalike-compare__picker">
        {pairs.map((p, idx) => (
          <button
            key={p.la.scientific_name}
            type="button"
            className={`lookalike-compare__chip ${idx === selectedIdx ? 'lookalike-compare__chip--active' : ''}`}
            onClick={() => setSelectedIdx(idx)}
          >
            {p.rec ? displayName(p.rec) : p.la.scientific_name}
          </button>
        ))}
      </div>

      <div className="lookalike-compare__grid">
        <div className="lookalike-compare__card">
          <div className="lookalike-compare__img">
            <SpeciesImage
              scientificName={sciName(current)}
              slug={current.slug}
              variant="card"
              riskLevel={riskToPlaceholder(curRisk, curEdib)}
              alt={sciName(current)}
            />
          </div>
          <h3>{displayName(current)}</h3>
          <p>
            <em>{sciName(current)}</em>
          </p>
          <p>{current.family || '—'}</p>
          <span
            className="detail-badge"
            style={{
              backgroundColor:
                EDIBILITY_COLORS_D16[curEdib as keyof typeof EDIBILITY_COLORS_D16] ||
                EDIBILITY_COLORS_D16.desconocido,
            }}
          >
            {t(`edibility.${curEdib}`, { defaultValue: curRisk })}
          </span>
        </div>

        <div className="lookalike-compare__vs" aria-hidden>
          VS
        </div>

        <div className="lookalike-compare__card">
          <div className="lookalike-compare__img">
            <SpeciesImage
              scientificName={selected.la.scientific_name}
              slug={selected.slug}
              variant="card"
              riskLevel={riskToPlaceholder(
                other?.risk_level || other?.risk_label,
                other?.edibility_code,
              )}
              alt={selected.la.scientific_name}
            />
          </div>
          <h3>{other ? displayName(other) : selected.la.scientific_name}</h3>
          <p>
            <em>{selected.la.scientific_name}</em>
          </p>
          {other ? (
            <Link to={`/enciclopedia/${other.slug}`} className="vs-btn vs-btn--secondary vs-btn--sm">
              {t('lookalike.viewDetail', { defaultValue: 'Ver ficha' })}
            </Link>
          ) : (
            <p className="lookalike-compare__missing">
              {t('lookalike.notInCatalog', { defaultValue: 'No está en el catálogo local.' })}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
