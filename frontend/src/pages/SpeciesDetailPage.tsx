/** Species detail: unified catalog + dual-route slug/scientific (PR-08). */
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
// Link used for back nav; RouterLink alias not needed
import { useTranslation } from 'react-i18next'
import { SpeciesGallery } from '../components/SpeciesGallery'
import { LookalikeCompare } from '../components/LookalikeCompare'
import { EmptyState } from '../components/ui'
import { useSpeciesCatalog, catalogToMushroomSpecies } from '../hooks/useSpeciesCatalog'
import { EDIBILITY_COLORS_D16 } from '../lib/edibility'
import { scientificNameToSlug, looksLikeScientificName } from '../lib/slug'
import { getWikiSummary } from '../api/wikipedia'
import type { WikiSummary } from '../api/wikipedia'
import { isFavorite, toggleFavorite } from '../lib/favorites'
import { featureFlags } from '../lib/featureFlags'


export function SpeciesDetailPage() {
  const { slug: param } = useParams<{ slug: string }>()
  const { t, i18n } = useTranslation()
  const locale = (i18n.language || 'es').slice(0, 2)
  const { items, loading: catLoading, getBySlug, getByScientificName } = useSpeciesCatalog(locale)
  const [wiki, setWiki] = useState<WikiSummary | null>(null)
  const [fav, setFav] = useState(false)

  const decoded = param ? decodeURIComponent(param) : ''

  const match = useMemo(() => {
    if (!decoded) return null
    const bySlug = getBySlug(decoded.toLowerCase())
    if (bySlug) return bySlug
    const slugified = scientificNameToSlug(decoded)
    const bySlug2 = getBySlug(slugified)
    if (bySlug2) return bySlug2
    return getByScientificName(decoded) || null
  }, [decoded, getBySlug, getByScientificName, items])

  useEffect(() => {
    window.scrollTo(0, 0)
    setWiki(null)
    if (match?.scientific_name) {
      void getWikiSummary(match.scientific_name).then(setWiki)
      setFav(isFavorite(match.slug))
    }
  }, [match?.scientific_name, match?.slug])

  const shouldRedirect =
    !catLoading &&
    Boolean(match) &&
    Boolean(param) &&
    looksLikeScientificName(param || '') &&
    match !== null &&
    match.slug !== decoded.toLowerCase()

  if (shouldRedirect && match) {
    return <Navigate to={`/enciclopedia/${match.slug}`} replace />
  }

  if (catLoading) {
    return (
      <div className="page-detail">
        <p>…</p>
      </div>
    )
  }

  if (!match) {
    return (
      <div className="page-detail">
        <EmptyState
          title={t('encyclopedia.notFound')}
          description={decoded}
          action={
            <Link to="/enciclopedia" className="btn btn-primary">
              ← {t('encyclopedia.backToEncyclopedia')}
            </Link>
          }
        />
      </div>
    )
  }

  const species = catalogToMushroomSpecies(match)
  const isDangerous = species.edibility === 'toxico' || species.edibility === 'mortifero'
  const color =
    EDIBILITY_COLORS_D16[species.edibility as keyof typeof EDIBILITY_COLORS_D16] ||
    EDIBILITY_COLORS_D16.desconocido
  const label = t(`edibility.${species.edibility}`, { defaultValue: species.edibility })
  const alt = `${species.commonNames[0] || species.scientificName} (${species.scientificName})`

  return (
    <div className="page-detail">
      <div className="detail-back">
        <Link to="/enciclopedia">← {t('encyclopedia.backToEncyclopedia')}</Link>
      </div>

      <p data-testid="encyclopedia-disclaimer" style={{ fontSize: '0.85rem', opacity: 0.9 }}>
        {t('safety.encyclopediaDisclaimer')}
      </p>

      <div className="detail-header">
        <div className="detail-header-image" style={{ minHeight: 240 }}>
          <SpeciesGallery
            scientificName={species.scientificName}
            slug={match.slug}
            alt={alt}
            riskLevel={
              match.risk_level === 'deadly'
                ? 'deadly'
                : match.risk_level === 'high'
                  ? 'toxic'
                  : 'default'
            }
          />
        </div>
        <div className="detail-header-info">
          <span className="detail-icon">{species.icon}</span>
          <h1>{species.commonNames[0] || species.scientificName}</h1>
          <p className="detail-scientific">{species.scientificName}</p>
          <p className="detail-tagline">{species.tagline}</p>
          <div className="detail-meta-row">
            <span className="detail-badge" style={{ backgroundColor: color }}>
              {label}
            </span>
            <span className="detail-chip">🌳 {species.family}</span>
            <span className="detail-chip">📅 {species.season}</span>
            {featureFlags.FAVORITES ? (
              <button
                type="button"
                className="fav-toggle"
                aria-pressed={fav}
                onClick={() => setFav(toggleFavorite(match.slug))}
              >
                {fav ? '★' : '☆'} {t('actions.favorite')}
              </button>
            ) : null}
          </div>
          <div style={{ marginTop: '1rem' }}>
            <Link to="/identificar" className="btn-hero-primary">
              🔍 {t('home.ctaIdentify')}
            </Link>
          </div>
        </div>
      </div>

      {isDangerous && (
        <div className="danger-banner">
          <span className="danger-banner-icon">☠️</span>
          <div>
            <strong>
              {species.edibility === 'mortifero'
                ? t('detail.deadlySpecies', { defaultValue: 'ESPECIE MORTAL' })
                : t('detail.toxicSpecies', { defaultValue: 'Especie tóxica' })}
            </strong>
            <p>
              {species.toxicity ??
                t('detail.dangerDefault', {
                  defaultValue: 'Esta seta es peligrosa. No consumir bajo ningún concepto.',
                })}
            </p>
          </div>
        </div>
      )}

      <div className="detail-section">
        <h2>📖 {t('detail.description', { defaultValue: 'Descripción' })}</h2>
        <p className="detail-description">{species.description}</p>
        {wiki?.extract && <p className="detail-wiki-extract">{wiki.extract}</p>}
      </div>

      <div className="detail-section">
        <h2>🔬 {t('detail.morphology', { defaultValue: 'Morfología' })}</h2>
        <ul>
          <li>
            <strong>{t('detail.cap', { defaultValue: 'Sombrero' })}:</strong> {species.cap || '—'}
          </li>
          <li>
            <strong>{t('detail.stem', { defaultValue: 'Pie' })}:</strong> {species.stem || '—'}
          </li>
          <li>
            <strong>{t('detail.hymenium', { defaultValue: 'Himenio' })}:</strong>{' '}
            {species.hymenium || '—'}
          </li>
        </ul>
      </div>

      {species.keyFeatures?.length ? (
        <div className="detail-section">
          <h2>🔑 {t('detail.keyFeatures', { defaultValue: 'Características clave' })}</h2>
          <ul>
            {species.keyFeatures.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {match.lookalikes && match.lookalikes.length > 0 ? (
        <div className="detail-section">
          <LookalikeCompare
            current={match}
            lookalikes={match.lookalikes}
            resolve={(name) =>
              getByScientificName(name) || getBySlug(scientificNameToSlug(name)) || null
            }
          />
        </div>
      ) : null}
    </div>
  )
}
