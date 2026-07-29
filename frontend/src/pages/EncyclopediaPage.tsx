/** Encyclopedia — family browse, ranked search, flat 2D photo grid only. */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { countByRisk, displayCommonName } from '../data/speciesCatalog'
import { useSpeciesCatalog } from '../hooks/useSpeciesCatalog'
import { listFamilies, searchCatalogRanked } from '../lib/catalogSearch'
import { getRiskMeta, type RiskLabel } from '../lib/riskLabels'
import { getFoodQuality, type FoodClass, foodQualityStats } from '../lib/foodQuality'
import { encyclopediaFoodFilterNote } from '../lib/safetyCopy'
import { SpeciesPhotoCard } from '../components/SpeciesPhotoCard'
import { ENCYCLOPEDIA_FIRST_PAGE_SIZE } from '../data/photoTiers'
import { buildEmptyEncyclopediaBrowseList } from '../lib/encyclopediaPopularity'
import { EmptyState } from '../components/EmptyState'
import { IconMushroom } from '../components/icons'
import { Skeleton } from '../components/ui/Skeleton'
import { scientificNameToSlug } from '../lib/slug'
import { deadlyPriorityViews } from '../lib/diagnosticViews'
import {
  countByStudyTrait,
  filterByStudyTrait,
  STUDY_TRAIT_OPTIONS,
  STUDY_TRAIT_POLICY_ES,
  type StudyTraitId,
} from '../lib/studyTraits'
import {
  ifSearchHintFromResolve,
  looksLikeScientificQuery,
  resolveIndexFungorumName,
  type IfSearchHint,
} from '../lib/indexFungorum'

const PAGE_SIZE = ENCYCLOPEDIA_FIRST_PAGE_SIZE
const FAMILY_CHIPS_DEFAULT = 7

export function EncyclopediaPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const priorityViews = useMemo(() => deadlyPriorityViews().slice(0, 3), [])
  const { catalog: speciesCatalog, meta: speciesCatalogMeta, loading: catalogLoading } =
    useSpeciesCatalog()
  const [query, setQuery] = useState('')
  /** E-09: debounced query for ranked search (150ms) — fewer main-thread spikes. */
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [risk, setRisk] = useState<'all' | RiskLabel>('all')
  const [food, setFood] = useState<'all' | FoodClass | 'documented'>('all')
  const [family, setFamily] = useState<string>('all')
  /** Educational morphology shortlist (gills/pores/…) — never forage. */
  const [trait, setTrait] = useState<StudyTraitId | 'all'>('all')
  const [page, setPage] = useState(0)
  const [moreFamilies, setMoreFamilies] = useState(false)
  /** P17: live Index Fungorum hints for scientific queries (names only). */
  const [ifHint, setIfHint] = useState<IfSearchHint | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 150)
    return () => window.clearTimeout(timer)
  }, [query])

  // Debounced IF resolve — scientific-looking queries only; fail-soft offline
  useEffect(() => {
    const q = debouncedQuery.trim()
    if (!q || !looksLikeScientificQuery(q)) {
      setIfHint(null)
      return
    }
    const ac = new AbortController()
    let cancelled = false
    const t = window.setTimeout(() => {
      void resolveIndexFungorumName(q, ac.signal).then((res) => {
        if (cancelled) return
        const hint = ifSearchHintFromResolve(res)
        setIfHint(hint.hints.length > 0 ? hint : null)
      })
    }, 280)
    return () => {
      cancelled = true
      ac.abort()
      window.clearTimeout(t)
    }
  }, [debouncedQuery])

  const counts = useMemo(() => countByRisk(), [speciesCatalog])
  const foodStats = useMemo(() => foodQualityStats(), [])
  const traitCounts = useMemo(() => countByStudyTrait(speciesCatalog), [speciesCatalog])

  const riskFilters = useMemo(
    () =>
      [
        { id: 'all' as const, label: t('encyclopedia.riskAll', { defaultValue: 'Todos' }) },
        {
          id: 'deadly' as const,
          label: t('encyclopedia.riskDeadly', { defaultValue: 'Mortal' }),
        },
        {
          id: 'poisonous' as const,
          label: t('encyclopedia.riskToxic', { defaultValue: 'Tóxica' }),
        },
        {
          id: 'toxic' as const,
          label: t('encyclopedia.riskToxic', { defaultValue: 'Tóxica' }),
        },
        {
          id: 'unknown_or_risky' as const,
          label: t('encyclopedia.riskUnknown', { defaultValue: 'Sin ficha de riesgo' }),
        },
        {
          id: 'dangerous_or_unknown' as const,
          label: t('encyclopedia.riskCaution', { defaultValue: 'Precaución' }),
        },
      ] satisfies Array<{ id: 'all' | RiskLabel; label: string }>,
    [t],
  )

  const foodFilters = useMemo(
    () =>
      [
        {
          id: 'all' as const,
          label: t('encyclopedia.foodAny', { defaultValue: 'Cualquier ficha' }),
        },
        {
          id: 'documented' as const,
          label: t('encyclopedia.foodDocumented', { defaultValue: 'Solo documentadas' }),
        },
        {
          id: 'comestible' as const,
          label: t('encyclopedia.foodEdibleDoc', {
            defaultValue: 'Documentadas (orientación)',
          }),
        },
        {
          id: 'no_comestible' as const,
          label: t('encyclopedia.foodNotSuitable', { defaultValue: 'No aptas (ficha)' }),
        },
        {
          id: 'toxica' as const,
          label: t('encyclopedia.foodToxic', { defaultValue: 'Tóxica' }),
        },
        {
          id: 'mortal' as const,
          label: t('encyclopedia.foodDeadly', { defaultValue: 'Mortal' }),
        },
      ] satisfies Array<{ id: 'all' | FoodClass | 'documented'; label: string }>,
    [t],
  )

  const families = useMemo(
    () => listFamilies(speciesCatalog, risk),
    [speciesCatalog, risk],
  )

  const allResults = useMemo(() => {
    const q = debouncedQuery.trim()
    const foodKeep =
      food === 'all'
        ? undefined
        : (taxon: string) => {
            const fq = getFoodQuality(taxon)
            if (food === 'documented') return Boolean(fq)
            return fq?.food_class === food
          }

    // Empty browse: FULL filtered catalog + popularity sort (no limit-200 / risk-boost cutoff).
    if (!q) {
      let list = buildEmptyEncyclopediaBrowseList(speciesCatalog, {
        risk,
        family,
        foodKeep,
      })
      list = filterByStudyTrait(list, trait)
      return list
    }

    // Non-empty query: relevance ranking + optional IF nomenclature hints (P17).
    let list = searchCatalogRanked(speciesCatalog, {
      query: debouncedQuery,
      risk,
      family,
      limit: 200,
      boostHighRisk: true,
      nomenclatureHints: ifHint?.hints,
    })
    if (foodKeep) list = list.filter((s) => foodKeep(s.taxon))
    list = filterByStudyTrait(list, trait)
    return list
  }, [speciesCatalog, debouncedQuery, risk, family, food, trait, ifHint])

  const results = useMemo(
    () => allResults.slice(0, (page + 1) * PAGE_SIZE),
    [allResults, page],
  )

  const featured = allResults[0]
  const featuredRisk = featured ? getRiskMeta(featured.risk_label) : null
  const hasMore = results.length < allResults.length
  const featuredCommon = featured
    ? displayCommonName(featured, locale)
    : ''

  const visibleFamilies = moreFamilies
    ? families.filter((f) => f.family !== 'Sin familia')
    : families.filter((f) => f.family !== 'Sin familia').slice(0, FAMILY_CHIPS_DEFAULT)

  const onQuery = (v: string) => {
    setQuery(v)
    setPage(0)
  }
  const onRisk = (v: 'all' | RiskLabel) => {
    setRisk(v)
    setPage(0)
  }
  const onFamily = (v: string) => {
    setFamily(v)
    setPage(0)
  }
  const onFood = (v: 'all' | FoodClass | 'documented') => {
    setFood(v)
    setPage(0)
  }
  const onTrait = (v: StudyTraitId | 'all') => {
    setTrait(v)
    setPage(0)
  }

  const foodNote = encyclopediaFoodFilterNote(locale)

  return (
    <div className="cn-page page-encyclopedia encyclopedia-shell page-encyclopedia--cn" data-skin="campo-nocturno">
      <p className="cn-warn-strip" role="note">
        {t('encyclopedia.orientation', {
          defaultValue: 'Solo orientación · nunca consumo',
        })}
      </p>
      <header className="mkt-page-head mkt-mesh">
        <p className="mkt-kicker">
          {t('encyclopedia.kicker', { defaultValue: 'Catálogo · riesgo claro' })}
        </p>
        <h1>
          {t('encyclopedia.titlePage', { defaultValue: 'Enciclopedia Iberia' })}
        </h1>
        <p>
          {catalogLoading ? (
            t('encyclopedia.loading', { defaultValue: 'Cargando catálogo…' })
          ) : (
            <span data-testid="encyclopedia-count">
              {t('encyclopedia.taxaCount', {
                defaultValue: '{{count}} taxones',
                count: speciesCatalogMeta.count,
              })}
            </span>
          )}{' '}
          {t('encyclopedia.documentedSuffix', {
            defaultValue: '· {{n}} con calidad documentada. Solo orientación de campo.',
            n: foodStats.total_documented,
          })}
        </p>
      </header>

      <section
        className="mkt-multiview-strip encyclopedia-multiview-tip"
        data-testid="encyclopedia-multiview-tip"
        aria-label={t('encyclopedia.multiviewAria', {
          defaultValue: 'Multi-vista en fichas',
        })}
      >
        <p className="mkt-multiview-strip__text">
          <strong>
            {t('encyclopedia.multiviewTitle', {
              defaultValue: 'Al estudiar fichas: 3 vistas que discriminan',
            })}
          </strong>{' '}
          {t('encyclopedia.multiviewBody', {
            defaultValue:
              'En confusiones mortales prioriza láminas, perfil/pie y base (volva/anillo). La galería de la ficha orienta; no autoriza consumo ni recolección.',
          })}
        </p>
        <div
          className="mkt-multiview-strip__views lookalike-item__diag-views"
          data-testid="encyclopedia-multiview-priority"
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
            data-testid="encyclopedia-cta-identify"
          >
            {t('encyclopedia.ctaIdentify', { defaultValue: 'Identificar multi-vista' })}
          </Link>
          <Link
            to="/educacion"
            className="mkt-btn mkt-btn--ghost mkt-btn--sm"
            data-testid="encyclopedia-cta-edu"
          >
            {t('encyclopedia.ctaEdu', { defaultValue: 'Educación multi-vista' })}
          </Link>
        </div>
      </section>

      {catalogLoading && (
        <div
          className="species-photo-grid ency-skeleton-grid"
          aria-busy="true"
          aria-label={t('encyclopedia.loadingAria', { defaultValue: 'Cargando especies' })}
          data-testid="ency-skeleton-grid"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="ency-skeleton-card">
              <Skeleton variant="card" height="11rem" borderRadius="16px" aria-hidden />
              <Skeleton variant="title" width="70%" height="0.9rem" aria-hidden />
              <Skeleton variant="line" width="45%" height="0.7rem" aria-hidden />
            </div>
          ))}
        </div>
      )}

      {/* Featured: flat field-photo card only (no procedural spin viewer) */}
      {featured && !catalogLoading && (
        <section
          className="ency-featured-flat"
          data-testid="ency-featured-flat"
          aria-label={t('encyclopedia.featuredAria', {
            defaultValue: 'Especie destacada (fotos 2D)',
          })}
        >
          <p className="ency-featured-flat__kicker">
            {t('encyclopedia.featured', {
              defaultValue: 'Destacada: {{name}}',
              name: featuredCommon || featured.taxon,
            })}
          </p>
          <div className="ency-featured-flat__grid">
            <SpeciesPhotoCard species={featured} priority />
          </div>
          <p className="ency-featured-flat__meta">
            <em>{featured.taxon}</em>
            {featuredRisk ? (
              <>
                {' · '}
                <span className={`risk-chip ${featuredRisk.className}`}>
                  {featuredRisk.label}
                </span>
              </>
            ) : null}
            {' · '}
            <Link
              to={`/enciclopedia/${featured.slug || scientificNameToSlug(featured.taxon)}`}
              className="ency-featured-flat__link"
            >
              {t('encyclopedia.openFiche', { defaultValue: 'Abrir ficha' })}
            </Link>
          </p>
        </section>
      )}

      {ifHint && debouncedQuery.trim() && (
        <div
          className="ency-if-search-hint"
          data-testid="ency-if-search-hint"
          role="status"
        >
          <p className="ency-if-search-hint__title">
            {ifHint.differs && ifHint.currentName
              ? t('encyclopedia.ifSearchDiffers', {
                  defaultValue:
                    'Index Fungorum nombre actual: {{name}} · ranking potenciado (solo nomenclatura)',
                  name: ifHint.currentName,
                })
              : t('encyclopedia.ifSearchHint', {
                  defaultValue:
                    'Pistas nomenclaturales Index Fungorum (Kew) · no sobrescribe el catálogo SSOT',
                })}
          </p>
          <p className="ency-if-search-hint__policy">
            {t('encyclopedia.ifSearchPolicy', {
              defaultValue:
                'Solo nombres científicos · nunca permiso de consumo ni identificación de campo',
            })}
          </p>
        </div>
      )}

      <div
        className="encyclopedia-toolbar ency-toolbar ency-toolbar--sticky"
        data-testid="ency-toolbar"
      >
        <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
          <input
            type="search"
            placeholder={t('encyclopedia.searchPlaceholderShort', {
              defaultValue: 'Níscalo, oronja, Amanita…',
            })}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label={t('encyclopedia.searchAria', { defaultValue: 'Buscar especies' })}
          />
        </div>
        <label className="ency-risk-select">
          {t('encyclopedia.familyLabel', { defaultValue: 'Familia' })}
          <select
            value={family}
            onChange={(e) => onFamily(e.target.value)}
            aria-label={t('encyclopedia.familyFilter', { defaultValue: 'Familia:' })}
          >
            <option value="all">
              {t('encyclopedia.familyAll', { defaultValue: 'Todas las familias' })}
            </option>
            {families.map((f) => (
              <option key={f.family} value={f.family}>
                {f.family_es}
                {f.family !== 'Sin familia' && f.family_es !== f.family
                  ? ` (${f.family})`
                  : ''}{' '}
                · {f.count}
              </option>
            ))}
          </select>
        </label>
        <label className="ency-risk-select">
          {t('encyclopedia.riskLabel', { defaultValue: 'Riesgo' })}
          <select
            value={risk}
            onChange={(e) => onRisk(e.target.value as 'all' | RiskLabel)}
            aria-label={t('encyclopedia.riskFilter', { defaultValue: 'Riesgo:' })}
          >
            {riskFilters.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
                {f.id !== 'all' && counts[f.id] != null ? ` (${counts[f.id]})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="ency-risk-select">
          {t('encyclopedia.foodLabel', { defaultValue: 'Ficha documental' })}
          <select
            value={food}
            onChange={(e) => onFood(e.target.value as 'all' | FoodClass | 'documented')}
            aria-label={t('encyclopedia.foodAria', {
              defaultValue: 'Filtrar por ficha documental (orientación, no consumo)',
            })}
            title={foodNote}
          >
            {foodFilters.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
                {f.id === 'comestible' ? ` (${foodStats.by_class.comestible})` : ''}
                {f.id === 'mortal' ? ` (${foodStats.by_class.mortal})` : ''}
                {f.id === 'toxica' ? ` (${foodStats.by_class.toxica})` : ''}
                {f.id === 'no_comestible' ? ` (${foodStats.by_class.no_comestible})` : ''}
                {f.id === 'documented' ? ` (${foodStats.total_documented})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Educational morphology shortlists (competitive: trait study filters) */}
      <section
        className="ency-trait-filters"
        data-testid="ency-trait-filters"
        aria-label={t('encyclopedia.traitAria', {
          defaultValue: 'Filtros de estudio por himenio',
        })}
      >
        <div className="ency-trait-filters__head">
          <p className="ency-trait-filters__title">
            {t('encyclopedia.traitTitle', {
              defaultValue: 'Estudio por forma del himenio',
            })}
          </p>
          <p className="ency-trait-filters__policy" data-testid="ency-trait-policy" role="note">
            {t('encyclopedia.traitPolicy', { defaultValue: STUDY_TRAIT_POLICY_ES })}
          </p>
        </div>
        <div className="ency-trait-chip-row" role="list">
          <button
            type="button"
            role="listitem"
            className={`ency-trait-chip ${trait === 'all' ? 'ency-trait-chip--active' : ''}`}
            data-testid="ency-trait-all"
            onClick={() => onTrait('all')}
          >
            {t('encyclopedia.traitAll', { defaultValue: 'Todos' })}
            <span className="ency-trait-chip__n">{traitCounts.all}</span>
          </button>
          {STUDY_TRAIT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="listitem"
              title={t(opt.blurbKey, { defaultValue: opt.blurbFallback })}
              className={`ency-trait-chip ency-trait-chip--${opt.id} ${
                trait === opt.id ? 'ency-trait-chip--active' : ''
              }`}
              data-testid={`ency-trait-${opt.id}`}
              data-trait={opt.id}
              onClick={() => onTrait(opt.id)}
            >
              {t(opt.labelKey, { defaultValue: opt.labelFallback })}
              <span className="ency-trait-chip__n">{traitCounts[opt.id]}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="family-chip-row" role="list">
        <button
          type="button"
          className={`family-chip ${family === 'all' ? 'family-chip--active' : ''}`}
          onClick={() => onFamily('all')}
        >
          {t('encyclopedia.familyAllChip', { defaultValue: 'Todas' })}
        </button>
        {visibleFamilies.map((f) => (
          <button
            key={f.family}
            type="button"
            role="listitem"
            title={f.family}
            className={`family-chip ${family === f.family ? 'family-chip--active' : ''}`}
            onClick={() => onFamily(f.family)}
          >
            {f.family_es}
            <span className="family-chip__n">{f.count}</span>
          </button>
        ))}
        {families.filter((f) => f.family !== 'Sin familia').length > FAMILY_CHIPS_DEFAULT && (
          <button
            type="button"
            className="family-chip family-chip--more"
            onClick={() => setMoreFamilies((v) => !v)}
          >
            {moreFamilies
              ? t('encyclopedia.fewerFamilies', { defaultValue: 'Menos' })
              : t('encyclopedia.moreFamilies', { defaultValue: 'Más familias' })}
          </button>
        )}
      </div>

      <p className="results-count">
        {allResults.length}{' '}
        {allResults.length === 1
          ? t('encyclopedia.speciesOne', { defaultValue: 'especie' })
          : t('encyclopedia.speciesMany', { defaultValue: 'especies' })}
        {family !== 'all'
          ? ` · ${families.find((x) => x.family === family)?.family_es || family}`
          : ''}
        {trait !== 'all'
          ? ` · ${t(
              STUDY_TRAIT_OPTIONS.find((o) => o.id === trait)?.labelKey || 'encyclopedia.traitAll',
              {
                defaultValue:
                  STUDY_TRAIT_OPTIONS.find((o) => o.id === trait)?.labelFallback || trait,
              },
            )}`
          : ''}
        {results.length < allResults.length
          ? ` · ${t('encyclopedia.showingN', {
              defaultValue: 'mostrando {{n}}',
              n: results.length,
            })}`
          : ''}
      </p>

      {results.length > 0 ? (
        <>
          <div className="species-photo-grid">
            {results.map((s) => (
              <SpeciesPhotoCard
                key={s.slug}
                species={s}
                priority={results.indexOf(s) < 4}
              />
            ))}
          </div>
          {hasMore && (
            <div className="ency-more">
              <button
                type="button"
                className="btn-atelier btn-atelier--primary"
                onClick={() => setPage((p) => p + 1)}
              >
                {t('encyclopedia.loadMoreRest', {
                  defaultValue: 'Cargar más ({{n}} restantes)',
                  n: allResults.length - results.length,
                })}
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title={t('encyclopedia.emptyTitle', { defaultValue: 'Sin coincidencias' })}
          description={t('encyclopedia.emptyBody', {
            defaultValue: 'Prueba otra familia, nombre científico o nombre común.',
          })}
          icon={<IconMushroom size={28} />}
          actionLabel={t('encyclopedia.clearFilters', { defaultValue: 'Limpiar filtros' })}
          onAction={() => {
            onQuery('')
            onFamily('all')
            onRisk('all')
            onFood('all')
            onTrait('all')
          }}
        />
      )}
    </div>
  )
}
