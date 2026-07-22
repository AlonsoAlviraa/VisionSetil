/** Species detail — editorial layout, real photo 360, safe prose (Wave B). */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSpeciesBySlug, loadSpeciesCatalog } from '../data/speciesCatalog'
import { getMushroomByScientificName } from '../data/mushroomDatabase'
import { getRiskMeta } from '../lib/riskLabels'
import { PhotoSpinViewer } from '../components/PhotoSpinViewer'
import { rankLookalikes } from '../lib/lookalikeRisk'
import { SpeciesNameBlock } from '../components/SpeciesNameBlock'
import { RiskChip } from '../components/RiskChip'
import { sanitizeEducationalText } from '../lib/educationCopy'
import { EmptyState } from '../components/EmptyState'
import { getFoodQuality } from '../lib/foodQuality'

export function SpeciesDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void loadSpeciesCatalog().then(() => setReady(true))
  }, [])
  const catalog = ready && slug ? getSpeciesBySlug(slug) : undefined
  const scientificName =
    catalog?.taxon || (slug ? decodeURIComponent(slug).replace(/-/g, ' ') : '')
  const rich = scientificName ? getMushroomByScientificName(scientificName) : undefined
  const riskRaw = catalog?.risk_label || rich?.edibility || 'dangerous_or_unknown'
  const riskMeta = getRiskMeta(riskRaw)

  const commons =
    catalog?.common_names?.length ? catalog.common_names : rich?.commonNames || []

  const lookalikes = rankLookalikes(
    rich?.lookAlikes || catalog?.description?.match(/[A-Z][a-z]+ [a-z]+/g) || [],
  )

  const description = sanitizeEducationalText(
    catalog?.description || rich?.description || '',
  )
  const habitat = rich?.habitat ? sanitizeEducationalText(rich.habitat, '') : ''
  const toxicity = rich?.toxicity ? sanitizeEducationalText(rich.toxicity, '') : ''
  const foodQ = getFoodQuality(scientificName)

  if (!ready) {
    return (
      <div className="page-detail page-atelier-shell">
        <div className="skeleton-atelier" style={{ minHeight: 240 }}>
          <div className="skeleton-atelier__shimmer" />
        </div>
      </div>
    )
  }

  if (!catalog && !rich) {
    return (
      <div className="page-detail page-atelier-shell">
        <EmptyState
          title="Especie no encontrada"
          description={`No hay ficha para «${slug}».`}
          actionLabel="Volver a la enciclopedia"
          actionTo="/enciclopedia"
        />
      </div>
    )
  }

  return (
    <div className="page-detail species-product">
      <div className="detail-back">
        <Link to="/enciclopedia">Enciclopedia</Link>
        <span aria-hidden="true"> / </span>
        <span>{scientificName}</span>
      </div>

      <div className="species-product__layout">
        <div className="species-product__gallery">
          <PhotoSpinViewer
            taxon={scientificName}
            height={420}
            riskLabel={riskRaw}
            label={`Fotos reales de ${scientificName}`}
            autoPlay
          />
        </div>

        <div className="species-product__info">
          <div className={`species-product__risk-sticky risk-sticky risk-sticky--${riskMeta.className}`}>
            <RiskChip risk={riskRaw} />
            <span className="risk-sticky__hint">Solo orientación · no consumo</span>
          </div>

          <SpeciesNameBlock
            taxon={scientificName}
            commonNames={commons}
            family={catalog?.family || rich?.family}
            familyEs={catalog?.family_es}
            size="lg"
            className="species-product__names"
          />

          <p className="species-product__desc">{description}</p>

          {foodQ ? (
            <div className={`species-product__food food-badge food-badge--${foodQ.food_class}`}>
              <p className="food-badge__label">
                Calidad documentada: <strong>{foodQ.label}</strong>
              </p>
              <p className="food-badge__source">
                Fuente: {foodQ.sources.join(' · ')} — no es permiso de consumo.
              </p>
              {foodQ.edibility && (
                <p className="food-badge__raw">
                  Nivel curado: <code>{foodQ.edibility}</code>
                </p>
              )}
            </div>
          ) : (
            <div className="species-product__food food-badge food-badge--unknown">
              <p className="food-badge__label">
                Sin calidad alimenticia documentada en nuestras fuentes.
              </p>
              <p className="food-badge__source">
                No inventamos comestibilidad. Solo base curada Iberia + lista tóxicas.
              </p>
            </div>
          )}

          {rich?.keyFeatures && rich.keyFeatures.length > 0 && (
            <div className="species-product__block">
              <h3>Caracteres</h3>
              <ul>
                {rich.keyFeatures.map((f) => (
                  <li key={f}>{sanitizeEducationalText(f, f)}</li>
                ))}
              </ul>
            </div>
          )}

          {habitat && (
            <div className="species-product__block">
              <h3>Hábitat</h3>
              <p>{habitat}</p>
            </div>
          )}

          {toxicity && (
            <div className="species-product__block species-product__alert" role="alert">
              <h3>Toxicidad (educativa)</h3>
              <p>{toxicity}</p>
            </div>
          )}

          {lookalikes.length > 0 && (
            <div className="species-product__block">
              <h3>Lookalikes de riesgo</h3>
              <ul className="lookalike-list">
                {lookalikes.map((l) => {
                  const m = getRiskMeta(l.risk_label)
                  return (
                    <li key={l.name} className="lookalike-item">
                      <span className={`risk-chip ${m.className}`}>{m.label}</span>
                      <em>{l.name}</em>
                      {l.slug && (
                        <Link to={`/enciclopedia/${l.slug}`} className="lookalike-link">
                          Ver
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
