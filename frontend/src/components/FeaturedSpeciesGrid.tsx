/**
 * FeaturedSpeciesGrid — photo-first showcase of the most-sought taxa (v1.11+).
 *
 * Distills the iNaturalist / First-Nature "photo-first browse" pattern: a dense
 * grid of real catalog photos for popular species, each linking to its sheet.
 * Orientation only — risk chips never imply safe consumption.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSpeciesCatalog } from '../hooks/useSpeciesCatalog'
import { HIGH_SEARCH_TAXA } from '../lib/encyclopediaPopularity'
import { SpeciesPhotoCard } from './SpeciesPhotoCard'
import { Icon, LinkButton } from './ui'
import type { CatalogSpecies } from '../data/speciesCatalog'

interface FeaturedSpeciesGridProps {
  /** How many cards to show (default 8). */
  limit?: number
}

export function FeaturedSpeciesGrid({ limit = 8 }: FeaturedSpeciesGridProps) {
  const { t } = useTranslation()
  const { catalog, loading, error } = useSpeciesCatalog()

  const featured = useMemo(() => {
    const byTaxon = new Map<string, CatalogSpecies>()
    for (const s of catalog) {
      if (s.taxon && !byTaxon.has(s.taxon)) byTaxon.set(s.taxon, s)
    }
    // Preserve popularity order from HIGH_SEARCH_TAXA; skip missing taxa.
    return HIGH_SEARCH_TAXA
      .map((taxon) => byTaxon.get(taxon))
      .filter((s): s is CatalogSpecies => Boolean(s))
      .slice(0, limit)
  }, [catalog, limit])

  if (error && featured.length === 0) {
    return (
      <section
        className="featured-species-grid"
        data-testid="featured-species-grid-error"
        aria-label={t('home.featuredTitle', { defaultValue: 'Especies del momento' })}
      >
        <p className="featured-species-grid__error">
          {t('home.catalogLoadError', { defaultValue: 'No se pudo cargar el catálogo.' })}
        </p>
      </section>
    )
  }

  if (loading && featured.length === 0) {
    return (
      <section
        className="featured-species-grid featured-species-grid--loading"
        data-testid="featured-species-grid-loading"
        aria-busy="true"
        aria-label={t('home.featuredTitle', { defaultValue: 'Especies del momento' })}
      >
        <header className="featured-species-grid__head">
          <p className="featured-species-grid__kicker">
            <Icon name="trending_up" size="sm" aria-hidden="true" />
            {t('home.featuredKicker', { defaultValue: 'Catálogo ibérico' })}
          </p>
          <h2 className="featured-species-grid__title cn-text-cream">
            {t('home.featuredTitle', { defaultValue: 'Especies del momento' })}
          </h2>
        </header>
        <div className="species-photo-grid featured-species-grid__skeleton" aria-hidden="true">
          {Array.from({ length: Math.min(limit, 4) }).map((_, i) => (
            <div key={i} className="featured-species-grid__skel-card" />
          ))}
        </div>
      </section>
    )
  }

  if (featured.length === 0) return null

  return (
    <section
      className="featured-species-grid"
      data-testid="featured-species-grid"
      aria-labelledby="featured-species-heading"
    >
      <header className="featured-species-grid__head">
        <div className="featured-species-grid__head-text">
          <p className="featured-species-grid__kicker">
            <Icon name="trending_up" size="sm" aria-hidden="true" />
            {t('home.featuredKicker', { defaultValue: 'Catálogo ibérico' })}
          </p>
          <h2 id="featured-species-heading" className="featured-species-grid__title cn-text-cream">
            {t('home.featuredTitle', { defaultValue: 'Especies del momento' })}
          </h2>
          <p className="featured-species-grid__lead">
            {t('home.featuredLead', {
              defaultValue:
                'Las más buscadas para estudiar. Fichas educativas — no es ranking de recolección ni permiso de consumo.',
            })}
          </p>
        </div>
        <LinkButton
          to="/enciclopedia"
          skin="cn"
          variant="ghost"
          size="sm"
          className="featured-species-grid__cta"
          data-testid="featured-species-cta-ency"
        >
          {t('home.featuredCta', { defaultValue: 'Ver enciclopedia' })}
          <Icon name="chevron_right" size="sm" aria-hidden="true" />
        </LinkButton>
      </header>
      <div className="species-photo-grid">
        {featured.map((s, idx) => (
          /* display quality: sharp on retina; first card eager for LCP */
          <SpeciesPhotoCard
            key={s.slug}
            species={s}
            priority={idx === 0}
            surface="featured_home"
            quality="display"
          />
        ))}
      </div>
      <p className="featured-species-grid__note muted" role="note">
        {t('home.featuredNote', {
          defaultValue: 'Solo orientación · riesgo visible en cada ficha · nunca consumas por la app',
        })}
      </p>
    </section>
  )
}

export default FeaturedSpeciesGrid
