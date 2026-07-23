/** Species detail — full-bleed hero, tabs, clean gallery (Phase D-06). */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getSpeciesBySlug, loadSpeciesCatalog } from '../data/speciesCatalog'
import { getMushroomByScientificName } from '../data/mushroomDatabase'
import { getRiskMeta } from '../lib/riskLabels'
import { scientificNameToSlug } from '../lib/slug'
import { SpeciesGallery } from '../components/SpeciesGallery'
import { SpeciesNameBlock } from '../components/SpeciesNameBlock'
import { RiskChip } from '../components/RiskChip'
import { LookalikeCompare } from '../components/LookalikeCompare'
import { sanitizeEducationalText } from '../lib/educationCopy'
import { EmptyState } from '../components/EmptyState'
import { getFoodQuality } from '../lib/foodQuality'
import { rankLookalikes } from '../lib/lookalikeRisk'

type DetailTab = 'morphology' | 'habitat' | 'lookalikes'

const TAB_ORDER: DetailTab[] = ['morphology', 'habitat', 'lookalikes']

export function SpeciesDetailPage() {
  const { t } = useTranslation()
  const { slug } = useParams<{ slug: string }>()
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<DetailTab>('morphology')
  const tablistRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadSpeciesCatalog().then(() => setReady(true))
  }, [])

  // Reset tab when navigating between species
  useEffect(() => {
    setTab('morphology')
  }, [slug])

  const catalog = ready && slug ? getSpeciesBySlug(slug) : undefined
  const scientificName =
    catalog?.taxon || (slug ? decodeURIComponent(slug).replace(/-/g, ' ') : '')
  const gallerySlug =
    catalog?.slug || (scientificName ? scientificNameToSlug(scientificName) : slug || '')
  const rich = scientificName ? getMushroomByScientificName(scientificName) : undefined
  const riskRaw = catalog?.risk_label || rich?.edibility || 'dangerous_or_unknown'
  const riskMeta = getRiskMeta(riskRaw)

  const commons =
    catalog?.common_names?.length ? catalog.common_names : rich?.commonNames || []

  const lookalikes = useMemo(
    () =>
      rankLookalikes(
        rich?.lookAlikes || catalog?.description?.match(/[A-Z][a-z]+ [a-z]+/g) || [],
      ),
    [rich?.lookAlikes, catalog?.description],
  )

  const description = sanitizeEducationalText(
    catalog?.description || rich?.description || '',
  )
  const habitat = rich?.habitat ? sanitizeEducationalText(rich.habitat, '') : ''
  const toxicity = rich?.toxicity ? sanitizeEducationalText(rich.toxicity, '') : ''
  const foodQ = scientificName ? getFoodQuality(scientificName) : null

  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: 'morphology', label: t('detail.tabs.morphology', { defaultValue: 'Morfología' }) },
    { id: 'habitat', label: t('detail.tabs.habitat', { defaultValue: 'Hábitat' }) },
    {
      id: 'lookalikes',
      label: t('detail.tabs.lookalikes', { defaultValue: 'Lookalikes' }),
      count: lookalikes.length || undefined,
    },
  ]

  const selectTab = useCallback((id: DetailTab) => {
    setTab(id)
  }, [])

  const onTabListKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const idx = TAB_ORDER.indexOf(tab)
      if (idx < 0) return
      let next = idx
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        next = (idx + 1) % TAB_ORDER.length
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        next = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length
      } else if (e.key === 'Home') {
        next = 0
      } else if (e.key === 'End') {
        next = TAB_ORDER.length - 1
      } else {
        return
      }
      e.preventDefault()
      const nextId = TAB_ORDER[next]
      setTab(nextId)
      const btn = tablistRef.current?.querySelector<HTMLButtonElement>(
        `#detail-tab-${nextId}`,
      )
      btn?.focus()
    },
    [tab],
  )

  const resolveLookalike = useCallback(
    (name: string) => {
      const ranked = lookalikes.find(
        (l) => l.name.toLowerCase() === name.toLowerCase(),
      )
      if (!ranked) return null
      return {
        scientific_name: ranked.name,
        taxon: ranked.name,
        slug: ranked.slug || scientificNameToSlug(ranked.name),
        risk_label: ranked.risk_label,
        common_names: ranked.common_names,
        family: ranked.family,
      }
    },
    [lookalikes],
  )

  if (!ready) {
    return (
      <div className="page-detail page-atelier-shell species-detail">
        <div className="species-detail-hero species-detail-hero--skeleton">
          <div className="skeleton-atelier" style={{ minHeight: 280 }}>
            <div className="skeleton-atelier__shimmer" />
          </div>
        </div>
      </div>
    )
  }

  if (!catalog && !rich) {
    return (
      <div className="page-detail page-atelier-shell species-detail">
        <EmptyState
          title={t('encyclopedia.notFound', { defaultValue: 'Especie no encontrada' })}
          description={t('detail.notFoundBody', {
            defaultValue: 'No hay ficha para «{{slug}}».',
            slug: slug || '—',
          })}
          actionLabel={t('encyclopedia.backToEncyclopedia', {
            defaultValue: 'Volver a la enciclopedia',
          })}
          actionTo="/enciclopedia"
        />
      </div>
    )
  }

  return (
    <div className="page-detail species-product species-detail">
      <div className="detail-back">
        <Link to="/enciclopedia">
          {t('nav.encyclopedia', { defaultValue: 'Enciclopedia' })}
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{scientificName}</span>
      </div>

      <section className="species-detail-hero" aria-label={scientificName}>
        <div className="species-detail-hero__media">
          <SpeciesGallery
            slug={gallerySlug}
            scientificName={scientificName}
            alt={t('detail.galleryAlt', {
              defaultValue: 'Fotos de {{name}}',
              name: scientificName,
            })}
            riskLevel={
              riskMeta.className.includes('deadly')
                ? 'deadly'
                : riskMeta.className.includes('toxic') ||
                    riskMeta.className.includes('poison')
                  ? 'toxic'
                  : 'default'
            }
          />
        </div>
        <div className="species-detail-hero__meta">
          <div
            className={`species-product__risk-sticky risk-sticky risk-sticky--${riskMeta.className}`}
          >
            <RiskChip risk={riskRaw} />
            <span className="risk-sticky__hint">
              {t('detail.orientationOnly', {
                defaultValue: 'Solo orientación · no consumo',
              })}
            </span>
          </div>
          <SpeciesNameBlock
            taxon={scientificName}
            commonNames={commons}
            family={catalog?.family || rich?.family}
            familyEs={catalog?.family_es}
            size="lg"
            className="species-product__names"
          />
        </div>
      </section>

      {foodQ ? (
        <div className={`species-product__food food-badge food-badge--${foodQ.food_class}`}>
          <p className="food-badge__label">
            {t('detail.foodQualityLabel', { defaultValue: 'Calidad documentada' })}:{' '}
            <strong>{foodQ.label}</strong>
          </p>
          <p className="food-badge__source">
            {t('detail.foodQualitySource', {
              defaultValue: 'Fuente: {{sources}} — no es permiso de consumo.',
              sources: foodQ.sources.join(' · '),
            })}
          </p>
          {foodQ.edibility && (
            <p className="food-badge__raw">
              {t('detail.curatedLevel', { defaultValue: 'Nivel curado' })}:{' '}
              <code>{foodQ.edibility}</code>
            </p>
          )}
        </div>
      ) : (
        <div className="species-product__food food-badge food-badge--unknown">
          <p className="food-badge__label">
            {t('detail.foodQualityUnknown', {
              defaultValue: 'Sin calidad alimenticia documentada en nuestras fuentes.',
            })}
          </p>
          <p className="food-badge__source">
            {t('detail.foodQualityUnknownHint', {
              defaultValue:
                'No inventamos comestibilidad. Solo base curada Iberia + lista tóxicas.',
            })}
          </p>
        </div>
      )}

      <div
        className="species-detail-tabs"
        role="tablist"
        aria-label={t('detail.tabsLabel', { defaultValue: 'Secciones de la ficha' })}
        ref={tablistRef}
        onKeyDown={onTabListKeyDown}
      >
        {tabs.map((item) => {
          const selected = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`detail-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`detail-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              className={`species-detail-tabs__tab ${selected ? 'is-active' : ''}`}
              onClick={() => selectTab(item.id)}
            >
              {item.label}
              {item.count != null && item.count > 0 ? (
                <span className="species-detail-tabs__count">{item.count}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="species-detail-panels">
        <div
          id="detail-panel-morphology"
          role="tabpanel"
          aria-labelledby="detail-tab-morphology"
          hidden={tab !== 'morphology'}
          tabIndex={tab === 'morphology' ? 0 : -1}
          className="species-detail-panel"
        >
          {description ? (
            <div className="species-product__block">
              <h3>{t('detail.description', { defaultValue: 'Descripción' })}</h3>
              <p className="species-product__desc">{description}</p>
            </div>
          ) : null}

          {rich?.keyFeatures && rich.keyFeatures.length > 0 ? (
            <div className="species-product__block">
              <h3>{t('detail.keyFeatures', { defaultValue: 'Caracteres' })}</h3>
              <ul>
                {rich.keyFeatures.map((f) => (
                  <li key={f}>{sanitizeEducationalText(f, f)}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {toxicity ? (
            <div className="species-product__block species-product__alert" role="alert">
              <h3>
                {t('detail.toxicityTitle', { defaultValue: 'Toxicidad (educativa)' })}
              </h3>
              <p>{toxicity}</p>
            </div>
          ) : null}

          {!description &&
          !(rich?.keyFeatures && rich.keyFeatures.length > 0) &&
          !toxicity ? (
            <EmptyState
              title={t('detail.emptyMorphology', {
                defaultValue: 'Sin caracteres detallados',
              })}
              description={t('detail.emptyMorphologyBody', {
                defaultValue:
                  'Aún no hay morfo curada para esta ficha. Usa la galería y el hábitat como pistas educativas.',
              })}
            />
          ) : null}
        </div>

        <div
          id="detail-panel-habitat"
          role="tabpanel"
          aria-labelledby="detail-tab-habitat"
          hidden={tab !== 'habitat'}
          tabIndex={tab === 'habitat' ? 0 : -1}
          className="species-detail-panel"
        >
          {habitat ? (
            <div className="species-product__block">
              <h3>{t('detail.tabs.habitat', { defaultValue: 'Hábitat' })}</h3>
              <p className="species-product__desc">{habitat}</p>
            </div>
          ) : (
            <EmptyState
              title={t('detail.emptyHabitat', {
                defaultValue: 'Sin hábitat documentado',
              })}
              description={t('detail.emptyHabitatBody', {
                defaultValue:
                  'No hay nota de hábitat curada para esta especie en el catálogo local.',
              })}
            />
          )}
        </div>

        <div
          id="detail-panel-lookalikes"
          role="tabpanel"
          aria-labelledby="detail-tab-lookalikes"
          hidden={tab !== 'lookalikes'}
          tabIndex={tab === 'lookalikes' ? 0 : -1}
          className="species-detail-panel"
        >
          {lookalikes.length > 0 ? (
            <>
              <LookalikeCompare
                current={{
                  scientific_name: scientificName,
                  taxon: scientificName,
                  slug: gallerySlug,
                  family: catalog?.family || rich?.family || null,
                  risk_label: riskRaw,
                  common_names: commons,
                }}
                lookalikes={lookalikes.map((l) => ({
                  scientific_name: l.name,
                }))}
                resolve={resolveLookalike}
              />
              <div className="species-detail-panel__actions">
                <Link to="/lookalikes" className="btn-atelier btn-atelier--ghost">
                  {t('detail.openStudio', {
                    defaultValue: 'Abrir Lookalike Studio',
                  })}
                </Link>
              </div>
            </>
          ) : (
            <EmptyState
              title={t('detail.emptyLookalikes', {
                defaultValue: 'Sin confusiones listadas',
              })}
              description={t('detail.emptyLookalikesBody', {
                defaultValue:
                  'No hay lookalikes curados en la ficha. Prueba el estudio de comparación.',
              })}
              actionLabel={t('detail.openStudio', {
                defaultValue: 'Abrir Lookalike Studio',
              })}
              actionTo="/lookalikes"
            />
          )}
        </div>
      </div>
    </div>
  )
}
