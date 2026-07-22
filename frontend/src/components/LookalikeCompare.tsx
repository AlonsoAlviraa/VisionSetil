/** Side-by-side lookalike comparison for species detail. */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesImage } from './SpeciesImage'
import { scientificNameToSlug } from '../lib/slug'
import { EDIBILITY_COLORS_D16, riskToPlaceholder } from '../lib/edibility'
import type { CatalogSpecies } from '../hooks/useSpeciesCatalog'

interface LookalikeRef {
  scientific_name: string
  note_key?: string | null
}

interface LookalikeCompareProps {
  current: CatalogSpecies
  lookalikes: LookalikeRef[]
  resolve: (scientificName: string) => CatalogSpecies | null
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
  const otherName =
    other?.common_name ||
    other?.vernacular_names?.[0] ||
    selected.la.scientific_name

  const curLabel = t(`edibility.${current.edibility_code}`, {
    defaultValue: current.edibility_code,
  })
  const otherLabel = other
    ? t(`edibility.${other.edibility_code}`, { defaultValue: other.edibility_code })
    : t('lookalike.unknownEdibility', { defaultValue: 'Desconocido' })

  return (
    <div className="lookalike-compare" data-testid="lookalike-section">
      <h2>↔️ {t('lookalike.title', { defaultValue: 'Confusiones posibles' })}</h2>
      <p className="lookalike-compare__hint">
        {t('lookalike.hint', {
          defaultValue:
            'Compara rasgos con especies similares. Nunca uses solo una foto para decidir consumo.',
        })}
      </p>

      <div className="lookalike-compare__picker">
        {pairs.map((p, idx) => (
          <button
            key={p.la.scientific_name}
            type="button"
            className={`lookalike-compare__chip ${idx === selectedIdx ? 'lookalike-compare__chip--active' : ''}`}
            onClick={() => setSelectedIdx(idx)}
          >
            {p.rec?.common_name || p.la.scientific_name}
          </button>
        ))}
      </div>

      <div className="lookalike-compare__grid">
        <div className="lookalike-compare__card">
          <div className="lookalike-compare__img">
            <SpeciesImage
              scientificName={current.scientific_name}
              slug={current.slug}
              variant="card"
              riskLevel={riskToPlaceholder(current.risk_level, current.edibility_code)}
              alt={current.scientific_name}
            />
          </div>
          <h3>{current.common_name || current.scientific_name}</h3>
          <p>
            <em>{current.scientific_name}</em>
          </p>
          <table className="lookalike-compare__table">
            <tbody>
              <tr>
                <th>{t('lookalike.family', { defaultValue: 'Familia' })}</th>
                <td>{current.family || '—'}</td>
              </tr>
              <tr>
                <th>{t('lookalike.risk', { defaultValue: 'Riesgo / edib.' })}</th>
                <td>
                  <span
                    className="detail-badge"
                    style={{
                      backgroundColor:
                        EDIBILITY_COLORS_D16[
                          current.edibility_code as keyof typeof EDIBILITY_COLORS_D16
                        ] || EDIBILITY_COLORS_D16.desconocido,
                    }}
                  >
                    {curLabel}
                  </span>
                </td>
              </tr>
              <tr>
                <th>{t('lookalike.habitat', { defaultValue: 'Hábitat' })}</th>
                <td>{current.habitat || '—'}</td>
              </tr>
              <tr>
                <th>{t('lookalike.season', { defaultValue: 'Temporada' })}</th>
                <td>{current.season || '—'}</td>
              </tr>
            </tbody>
          </table>
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
              riskLevel={riskToPlaceholder(other?.risk_level, other?.edibility_code)}
              alt={selected.la.scientific_name}
            />
          </div>
          <h3>{otherName}</h3>
          <p>
            <em>{selected.la.scientific_name}</em>
          </p>
          {selected.la.note_key ? (
            <p className="lookalike-compare__note">{selected.la.note_key}</p>
          ) : null}
          {other ? (
            <>
              <table className="lookalike-compare__table">
                <tbody>
                  <tr>
                    <th>{t('lookalike.family', { defaultValue: 'Familia' })}</th>
                    <td>{other.family || '—'}</td>
                  </tr>
                  <tr>
                    <th>{t('lookalike.risk', { defaultValue: 'Riesgo / edib.' })}</th>
                    <td>
                      <span
                        className="detail-badge"
                        style={{
                          backgroundColor:
                            EDIBILITY_COLORS_D16[
                              other.edibility_code as keyof typeof EDIBILITY_COLORS_D16
                            ] || EDIBILITY_COLORS_D16.desconocido,
                        }}
                      >
                        {otherLabel}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>{t('lookalike.habitat', { defaultValue: 'Hábitat' })}</th>
                    <td>{other.habitat || '—'}</td>
                  </tr>
                  <tr>
                    <th>{t('lookalike.season', { defaultValue: 'Temporada' })}</th>
                    <td>{other.season || '—'}</td>
                  </tr>
                </tbody>
              </table>
              <Link to={`/enciclopedia/${other.slug}`} className="btn-hero-secondary">
                {t('lookalike.viewDetail', { defaultValue: 'Ver ficha' })}
              </Link>
            </>
          ) : (
            <p className="lookalike-compare__missing">
              {t('lookalike.notInCatalog', {
                defaultValue: 'No está en el catálogo local; solo referencia de nombre.',
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
