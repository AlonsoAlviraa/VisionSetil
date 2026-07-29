/**
 * First-Nature-style family picture guide entry points.
 * Tapping a family filters encyclopedia (parent passes onSelect).
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { CatalogSpecies } from '../data/speciesCatalog'
import { SpeciesImage } from './SpeciesImage'
import { photoPriorityScore } from '../lib/speciesMediaStack'

type FamilyRow = {
  family: string
  family_es: string
  count: number
  hero: CatalogSpecies
}

type Props = {
  catalog: CatalogSpecies[]
  onSelectFamily: (family: string) => void
  maxFamilies?: number
}

export function FamilyGuideStrip({
  catalog,
  onSelectFamily,
  maxFamilies = 8,
}: Props) {
  const { t } = useTranslation()

  const rows = useMemo(() => {
    const by = new Map<string, CatalogSpecies[]>()
    for (const s of catalog) {
      const f = s.family || 'Sin familia'
      if (f === 'Sin familia') continue
      const list = by.get(f) || []
      list.push(s)
      by.set(f, list)
    }
    const out: FamilyRow[] = []
    for (const [family, list] of by) {
      if (list.length < 2) continue
      const sorted = [...list].sort(
        (a, b) => photoPriorityScore(b.taxon) - photoPriorityScore(a.taxon),
      )
      const hero = sorted[0]
      out.push({
        family,
        family_es: hero.family_es || family,
        count: list.length,
        hero,
      })
    }
    out.sort((a, b) => b.count - a.count)
    return out.slice(0, maxFamilies)
  }, [catalog, maxFamilies])

  if (rows.length === 0) return null

  return (
    <section
      className="family-guide-strip"
      data-testid="family-guide-strip"
      aria-label={t('encyclopedia.familyGuideAria', {
        defaultValue: 'Guía visual por familias',
      })}
    >
      <header className="family-guide-strip__head">
        <p className="cn-kicker mkt-kicker">
          {t('encyclopedia.familyGuideKicker', {
            defaultValue: 'Estilo First Nature',
          })}
        </p>
        <h2 className="family-guide-strip__title">
          {t('encyclopedia.familyGuideTitle', {
            defaultValue: 'Explorar por familia',
          })}
        </h2>
        <p className="family-guide-strip__lead">
          {t('encyclopedia.familyGuideLead', {
            defaultValue:
              'Entra por la familia (como las guías web más visitadas). Solo estudio — nunca consumo.',
          })}
        </p>
      </header>
      <ul className="family-guide-strip__grid">
        {rows.map((row) => (
          <li key={row.family}>
            <button
              type="button"
              className="family-guide-strip__card"
              onClick={() => onSelectFamily(row.family)}
              data-testid={`family-guide-${row.family}`}
            >
              <div className="family-guide-strip__media" aria-hidden="true">
                <SpeciesImage
                  scientificName={row.hero.taxon}
                  slug={row.hero.slug}
                  alt=""
                  variant="card"
                  layout="fill"
                  preferCatalog
                  quality="thumb"
                  sizes="(max-width: 640px) 40vw, 180px"
                />
              </div>
              <span className="family-guide-strip__name">{row.family_es}</span>
              <span className="family-guide-strip__count">
                {t('encyclopedia.familyGuideCount', {
                  defaultValue: '{{n}} especies',
                  n: row.count,
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default FamilyGuideStrip
