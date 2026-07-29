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
import {
  commonsForLocale,
  getSpeciesBySlug,
  loadSpeciesCatalog,
} from '../data/speciesCatalog'
import { enrichCommonNamesEn } from '../data/commonNamesEn'
import { getRiskMeta, isSevereRisk, toRiskLabel } from '../lib/riskLabels'
import { getMushroomByScientificName } from '../data/mushroomDatabase'
import { scientificNameToSlug } from '../lib/slug'
import { SpeciesGallery } from '../components/SpeciesGallery'
import { OpenStudyLinks } from '../components/OpenStudyLinks'
import { SpeciesNameBlock } from '../components/SpeciesNameBlock'
import { RiskChip } from '../components/RiskChip'
import { LookalikeCompare } from '../components/LookalikeCompare'
import { sanitizeEducationalText } from '../lib/educationCopy'
import { EmptyState } from '../components/EmptyState'
import { getFoodQuality } from '../lib/foodQuality'
import {
  getSpeciesRecipes,
  hasEducationalRecipes,
  RECIPES_DEFAULT_DISCLAIMER,
} from '../lib/speciesRecipes'
import { rankLookalikes } from '../lib/lookalikeRisk'
import { resolveSpeciesMeta } from '../lib/speciesMeta'
import { PhenologyBar } from '../components/PhenologyBar'
import { recordStudyActivity } from '../lib/studyBadges'
import {
  deadlyCoach,
  deadlyPriorityViews,
  diagnosticPolicy,
} from '../lib/diagnosticViews'
import {
  INDEX_FUNGORUM_ATTR_SHORT,
  INDEX_FUNGORUM_HOME,
  indexFungorumPolicyEs,
  indexFungorumPolicyEn,
  resolveIndexFungorumName,
  type IndexFungorumResolve,
} from '../lib/indexFungorum'

type DetailTab = 'morphology' | 'habitat' | 'lookalikes'

const TAB_ORDER: DetailTab[] = ['morphology', 'habitat', 'lookalikes']

const RISK_T_KEY: Record<string, string> = {
  deadly: 'risk.deadly',
  poisonous: 'risk.poisonous',
  toxic: 'risk.toxic',
  unknown_or_risky: 'risk.orientation',
  dangerous_or_unknown: 'risk.dangerous_or_unknown',
  not_for_consumption_guidance: 'risk.not_for_consumption',
}

/** Map Spanish season tokens to EN when locale is English (educational buckets). */
function localizeSeasonLabel(
  season: string,
  t: (key: string, opts?: { defaultValue?: string }) => string,
  locale: string,
): string {
  if (!locale.toLowerCase().startsWith('en')) return season
  const map: Array<[RegExp, string]> = [
    [/primavera/gi, t('seasons.spring', { defaultValue: 'Spring' })],
    [/verano/gi, t('seasons.summer', { defaultValue: 'Summer' })],
    [/otoño|otono/gi, t('seasons.autumn', { defaultValue: 'Autumn' })],
    [/invierno/gi, t('seasons.winter', { defaultValue: 'Winter' })],
  ]
  let out = season
  for (const [re, rep] of map) {
    out = out.replace(re, rep)
  }
  return out
}

export function SpeciesDetailPage() {
  const { t, i18n } = useTranslation()
  const appLocale = i18n.resolvedLanguage || i18n.language || 'es'
  const { slug } = useParams<{ slug: string }>()
  const [ready, setReady] = useState(false)
  const [ifNomen, setIfNomen] = useState<IndexFungorumResolve | null>(null)
  const [tab, setTab] = useState<DetailTab>('morphology')
  const tablistRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadSpeciesCatalog().then(() => setReady(true))
  }, [])

  // Reset tab when navigating between species
  useEffect(() => {
    setTab('morphology')
  }, [slug])

  // Seek-style study progress: encyclopedia views (local only; real fichas)
  useEffect(() => {
    if (!slug || !ready) return
    if (!getSpeciesBySlug(slug)) return
    recordStudyActivity('encyclopedia')
  }, [slug, ready])

  const catalog = ready && slug ? getSpeciesBySlug(slug) : undefined
  const scientificName =
    catalog?.taxon ||
    (slug
      ? (() => {
          try {
            const decoded = decodeURIComponent(slug)
            // Prefer spaced scientific if param was encoded that way; else kebab → words
            if (decoded.includes(' ')) return decoded
            return decoded.replace(/-/g, ' ')
          } catch {
            return slug.replace(/-/g, ' ')
          }
        })()
      : '')
  const gallerySlug =
    catalog?.slug || (scientificName ? scientificNameToSlug(scientificName) : slug || '')

  // Index Fungorum nomenclature (backend proxy) — names only; never overwrites SSOT
  useEffect(() => {
    if (!ready || !scientificName || scientificName.length < 3) {
      setIfNomen(null)
      return
    }
    const ac = new AbortController()
    setIfNomen(null)
    void resolveIndexFungorumName(scientificName, ac.signal).then((data) => {
      if (!ac.signal.aborted) setIfNomen(data)
    })
    return () => ac.abort()
  }, [ready, scientificName])

  const rich = scientificName ? getMushroomByScientificName(scientificName) : undefined
  const riskRaw = catalog?.risk_label || rich?.edibility || 'dangerous_or_unknown'
  const riskMeta = getRiskMeta(riskRaw)
  const riskCanon = toRiskLabel(riskRaw)
  const highRisk = isSevereRisk(riskRaw) || riskCanon === 'deadly'
  const priorityViews = useMemo(() => deadlyPriorityViews().slice(0, 3), [])
  const coachLocale = appLocale.toLowerCase().startsWith('en') ? 'en' : 'es'
  const multiviewCoach = useMemo(() => deadlyCoach(coachLocale), [coachLocale])

  // EN: never pass Spanish commons as SpeciesNameBlock override
  const commons = catalog
    ? commonsForLocale(catalog, appLocale, rich?.commonNames)
    : appLocale.startsWith('en')
      ? enrichCommonNamesEn(scientificName, [])
      : rich?.commonNames || []

  // Prefer curated SSOT catalog.lookalikes; then legacy rich DB; never invent from free text regex alone.
  const lookalikes = useMemo(() => {
    const fromCatalog = catalog?.lookalikes || []
    const fromRich = rich?.lookAlikes || []
    // Merge SSOT first (dedupe inside rankLookalikes via canonical names)
    const names = [...fromCatalog, ...fromRich]
    if (names.length > 0) return rankLookalikes(names)
    return rankLookalikes([])
  }, [catalog?.lookalikes, rich?.lookAlikes])

  const description = sanitizeEducationalText(
    catalog?.description || rich?.description || '',
  )
  const habitat = rich?.habitat ? sanitizeEducationalText(rich.habitat, '') : ''
  const toxicity = rich?.toxicity ? sanitizeEducationalText(rich.toxicity, '') : ''
  const foodQ = scientificName ? getFoodQuality(scientificName) : null
  const recipeKey = gallerySlug || scientificName
  const showRecipes = hasEducationalRecipes(recipeKey)
  const recipeBundle = showRecipes ? getSpeciesRecipes(recipeKey) : null
  const meta = scientificName
    ? resolveSpeciesMeta({
        taxon: scientificName,
        family: catalog?.family || rich?.family,
        risk_label: riskRaw,
        food_class: catalog?.food_class ?? foodQ?.food_class,
        documented_edibility: catalog?.documented_edibility,
        description: description || catalog?.description,
        common_names: commons,
        season: catalog?.season || rich?.season,
        iberian_relevance: catalog?.iberian_relevance,
      })
    : null

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
        common_names_en: ranked.common_names_en,
        family: ranked.family,
      }
    },
    [lookalikes],
  )

  if (!ready) {
    return (
      <div className="cn-page page-detail page-atelier-shell species-detail">
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
      <div className="cn-page page-detail page-atelier-shell species-detail">
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
    <div className="cn-page page-detail species-product species-detail" data-skin="campo-nocturno">
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
            family={meta?.family || catalog?.family || rich?.family}
            familyEs={catalog?.family_es}
            size="lg"
            className="species-product__names"
          />
        </div>
      </section>

      <OpenStudyLinks taxon={scientificName} />

      {meta ? (
        <dl className="species-meta-grid" aria-label={t('detail.metaGrid', { defaultValue: 'Ficha rápida' })}>
          <div className="species-meta-grid__item">
            <dt>{t('detail.meta.family', { defaultValue: 'Familia' })}</dt>
            <dd>{meta.family}</dd>
          </div>
          <div className="species-meta-grid__item">
            <dt>{t('detail.meta.genus', { defaultValue: 'Género' })}</dt>
            <dd>{meta.genus}</dd>
          </div>
          <div className="species-meta-grid__item">
            <dt>{t('detail.meta.risk', { defaultValue: 'Riesgo' })}</dt>
            <dd>
              {t(RISK_T_KEY[toRiskLabel(riskRaw)] || 'risk.dangerous_or_unknown', {
                defaultValue: riskMeta.short || riskMeta.label,
              })}
            </dd>
          </div>
          <div className="species-meta-grid__item">
            <dt>{t('detail.meta.educClass', { defaultValue: 'Clase educ.' })}</dt>
            <dd>
              {t(`detail.educ.${meta.educ}`, { defaultValue: meta.educLabel })}
            </dd>
          </div>
          <div className="species-meta-grid__item">
            <dt>{t('detail.meta.iberia', { defaultValue: 'Iberia' })}</dt>
            <dd>
              {t(`detail.iberian.${meta.iberian}`, { defaultValue: meta.iberian })}
            </dd>
          </div>
          <div className="species-meta-grid__item">
            <dt>{t('detail.meta.season', { defaultValue: 'Temporada' })}</dt>
            <dd>{localizeSeasonLabel(meta.season, t, appLocale)}</dd>
          </div>
        </dl>
      ) : null}

      {/* Index Fungorum nomenclature panel (Kew) */}
      {ifNomen?.ok && ifNomen.best ? (
        <section
          className="species-if-nomen atelier-panel"
          data-testid="species-if-nomen"
          aria-label={t('detail.ifNomenAria', {
            defaultValue: 'Nomenclatura Index Fungorum',
          })}
        >
          <p className="species-if-nomen__title">
            {t('detail.ifNomenTitle', {
              defaultValue: 'Nomenclatura · Index Fungorum',
            })}
          </p>
          <p className="species-if-nomen__row">
            <strong>
              {t('detail.ifCurrent', { defaultValue: 'Nombre actual (IF)' })}:
            </strong>{' '}
            <em>{ifNomen.current_name || ifNomen.best.name}</em>
            {ifNomen.best.authors ? ` ${ifNomen.best.authors}` : ''}
            {ifNomen.best.name_status ? (
              <span className="species-if-nomen__status">
                {' '}
                · {ifNomen.best.name_status}
              </span>
            ) : null}
          </p>
          {ifNomen.if_differs_from_query ? (
            <p className="species-if-nomen__diff" data-testid="species-if-differs">
              {t('detail.ifDiffers', {
                defaultValue:
                  'IF usa un nombre actual distinto al de esta ficha SSOT. VisionSetil no sobrescribe el catálogo de producto automáticamente.',
              })}
            </p>
          ) : null}
          {ifNomen.best.record_url ? (
            <p className="species-if-nomen__link">
              <a
                href={ifNomen.best.record_url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="species-if-record-link"
              >
                {t('detail.ifOpenRecord', {
                  defaultValue: 'Abrir ficha en Index Fungorum',
                })}
              </a>
              {ifNomen.best.record_number
                ? ` · IF#${ifNomen.best.record_number}`
                : ''}
            </p>
          ) : null}
          {(ifNomen.synonyms || []).length > 0 ? (
            <p className="species-if-nomen__syn" data-testid="species-if-synonyms">
              <strong>
                {t('detail.ifSynonyms', { defaultValue: 'Sinónimos / nombres ligados' })}
                :
              </strong>{' '}
              {ifNomen.synonyms
                .slice(0, 8)
                .map((s) => s.name)
                .join(' · ')}
              {ifNomen.synonyms.length > 8 ? '…' : ''}
            </p>
          ) : null}
          <p className="species-if-nomen__policy" role="note">
            {appLocale.toLowerCase().startsWith('en')
              ? indexFungorumPolicyEn()
              : indexFungorumPolicyEs()}{' '}
            <a href={INDEX_FUNGORUM_HOME} target="_blank" rel="noopener noreferrer">
              {INDEX_FUNGORUM_ATTR_SHORT}
            </a>
          </p>
        </section>
      ) : null}

      <section
        className={`mkt-multiview-strip species-detail-multiview${
          highRisk ? ' species-detail-multiview--high-risk' : ''
        }`}
        data-testid="species-detail-multiview"
        data-risk={riskCanon}
        data-policy={diagnosticPolicy()}
        aria-label={t('detail.multiviewAria', {
          defaultValue: 'Vistas diagnósticas multi-foto',
        })}
      >
        <p className="mkt-multiview-strip__text" data-testid="species-detail-multiview-coach">
          <strong>
            {highRisk
              ? t('detail.multiviewTitleHigh', {
                  defaultValue: 'Taxón de alto riesgo: 3 vistas que discriminan',
                })
              : t('detail.multiviewTitle', {
                  defaultValue: 'Para estudiar / identificar: 3 vistas que importan',
                })}
          </strong>{' '}
          {multiviewCoach}{' '}
          {t('detail.multiviewNeverConsume', {
            defaultValue: 'Solo orientación — nunca consumo. La ficha no autoriza recolección.',
          })}
        </p>
        <div
          className="mkt-multiview-strip__views lookalike-item__diag-views"
          data-testid="species-detail-multiview-priority"
        >
          {priorityViews.map((view) => (
            <span
              key={view}
              className="lookalike-item__diag-badge lookalike-item__diag-badge--static"
              data-slot={view}
            >
              {t(`identify.views.${view}`, { defaultValue: view })}
            </span>
          ))}
        </div>
        <div className="mkt-multiview-strip__actions">
          <Link
            to="/identificar"
            className="mkt-btn mkt-btn--primary mkt-btn--sm"
            data-testid="species-detail-cta-identify"
          >
            {t('detail.ctaIdentify', { defaultValue: 'Identificar multi-vista' })}
          </Link>
          <Link
            to="/educacion"
            className="mkt-btn mkt-btn--ghost mkt-btn--sm"
            data-testid="species-detail-cta-edu"
          >
            {t('detail.ctaEdu', { defaultValue: 'Por qué multi-vista' })}
          </Link>
          {lookalikes.length > 0 ? (
            <button
              type="button"
              className="mkt-btn mkt-btn--ghost mkt-btn--sm"
              data-testid="species-detail-cta-lookalikes"
              onClick={() => selectTab('lookalikes')}
            >
              {t('detail.ctaLookalikes', {
                defaultValue: 'Ver confusiones (vistas críticas)',
              })}
            </button>
          ) : null}
        </div>
      </section>

      {foodQ ? (
        <div className={`species-product__food food-badge food-badge--${foodQ.food_class}`}>
          <p className="food-badge__label">
            {t('detail.foodQualityLabel', { defaultValue: 'Calidad documentada' })}:{' '}
            <strong>
              {t(`detail.foodClass.${foodQ.food_class}`, {
                defaultValue: foodQ.label,
              })}
            </strong>
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
              defaultValue: 'Clase educ.: sin documentar en fuentes curadas (no inventamos comestibilidad).',
            })}
          </p>
          <p className="food-badge__source">
            {t('detail.foodQualityUnknownHint', {
              defaultValue:
                'Solo base curada Iberia + lista tóxicas. Ante la duda: precaución y micólogo humano.',
            })}
          </p>
        </div>
      )}

      {/* Educational external recipes — encyclopedia only; never Identify ResultCard */}
      {recipeBundle && recipeBundle.recipes.length > 0 ? (
        <section
          className="species-product__recipes recipes-edu"
          data-testid="species-recipes"
          aria-labelledby="species-recipes-heading"
        >
          <h2 id="species-recipes-heading" className="recipes-edu__title">
            {t('detail.recipes.title', {
              defaultValue: 'Recetas (enlaces externos)',
            })}
          </h2>
          <div className="recipes-edu__banner" role="note">
            <p>
              {t('detail.recipes.disclaimer', {
                defaultValue:
                  'Orientación cultural únicamente. Nunca consumas setas silvestres identificadas solo por una app. Se requiere verificación experta. Esta app no autoriza el consumo.',
              })}
            </p>
            <p className="recipes-edu__banner-src">
              {recipeBundle.disclaimer || RECIPES_DEFAULT_DISCLAIMER}
            </p>
          </div>
          <ul className="recipes-edu__list">
            {recipeBundle.recipes.map((r) => (
              <li key={r.url} className="recipes-edu__item">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="recipes-edu__link"
                >
                  {r.title}
                  <span className="recipes-edu__lang" aria-hidden="true">
                    {' '}
                    ({r.lang.toUpperCase()})
                  </span>
                </a>
                <span className="recipes-edu__external">
                  {t('detail.recipes.external', { defaultValue: 'Enlace externo' })}
                </span>
              </li>
            ))}
          </ul>
          <p className="recipes-edu__footer muted">
            {t('detail.recipes.footer', {
              defaultValue:
                'Enlaces culinarios de terceros con fines educativos. No son permiso de recolección ni de consumo.',
            })}
          </p>
        </section>
      ) : null}

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
          <PhenologyBar season={meta?.season || catalog?.season || rich?.season} />

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
