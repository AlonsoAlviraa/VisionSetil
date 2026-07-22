/** Encyclopedia — family browse, ranked search, photo grid (async catalog code-split). */
import { lazy, Suspense, useMemo, useState } from 'react'
import { countByRisk } from '../data/speciesCatalog'
import { useSpeciesCatalog } from '../hooks/useSpeciesCatalog'
import { listFamilies, searchCatalogRanked } from '../lib/catalogSearch'
import { getRiskMeta, type RiskLabel } from '../lib/riskLabels'
import { getFoodQuality, type FoodClass, foodQualityStats } from '../lib/foodQuality'
import { SpeciesPhotoCard } from '../components/SpeciesPhotoCard'
import { MUSHROOM_HERO_SHOTS } from '../data/mushroomPhotos'
import { ENCYCLOPEDIA_FIRST_PAGE_SIZE } from '../data/photoTiers'
import { EmptyState } from '../components/EmptyState'
import { IconMushroom } from '../components/icons'

const PhotoSpinViewer = lazy(() =>
  import('../components/PhotoSpinViewer').then((m) => ({ default: m.PhotoSpinViewer })),
)

const RISK_FILTERS: Array<{ id: 'all' | RiskLabel; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'deadly', label: 'Mortal' },
  { id: 'poisonous', label: 'Tóxica' },
  { id: 'toxic', label: 'Tóxica' },
  { id: 'unknown_or_risky', label: 'Sin ficha de riesgo' },
  { id: 'dangerous_or_unknown', label: 'Precaución' },
]

const FOOD_FILTERS: Array<{ id: 'all' | FoodClass | 'documented'; label: string }> = [
  { id: 'all', label: 'Cualquier calidad' },
  { id: 'documented', label: 'Solo documentadas' },
  { id: 'comestible', label: 'Comestible' },
  { id: 'no_comestible', label: 'No comestible' },
  { id: 'toxica', label: 'Tóxica' },
  { id: 'mortal', label: 'Mortal' },
]

const PAGE_SIZE = ENCYCLOPEDIA_FIRST_PAGE_SIZE
const FAMILY_CHIPS_DEFAULT = 7

export function EncyclopediaPage() {
  const { catalog: speciesCatalog, meta: speciesCatalogMeta, loading: catalogLoading } =
    useSpeciesCatalog()
  const [query, setQuery] = useState('')
  const [risk, setRisk] = useState<'all' | RiskLabel>('all')
  const [food, setFood] = useState<'all' | FoodClass | 'documented'>('all')
  const [family, setFamily] = useState<string>('all')
  const [page, setPage] = useState(0)
  const [studioOpen, setStudioOpen] = useState(false)
  const [moreFamilies, setMoreFamilies] = useState(false)
  const counts = useMemo(() => countByRisk(), [speciesCatalog])
  const foodStats = useMemo(() => foodQualityStats(), [])

  const families = useMemo(
    () => listFamilies(speciesCatalog, risk),
    [speciesCatalog, risk],
  )

  const allResults = useMemo(() => {
    let list = searchCatalogRanked(speciesCatalog, {
      query,
      risk,
      family,
      limit: 800,
      boostHighRisk: true,
    })
    if (food !== 'all') {
      list = list.filter((s) => {
        const q = getFoodQuality(s.taxon)
        if (food === 'documented') return Boolean(q)
        return q?.food_class === food
      })
    }
    return list
  }, [speciesCatalog, query, risk, family, food])

  const results = useMemo(
    () => allResults.slice(0, (page + 1) * PAGE_SIZE),
    [allResults, page],
  )

  const featured = allResults[0]
  const featuredRisk = featured ? getRiskMeta(featured.risk_label) : null
  const hasMore = results.length < allResults.length

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

  return (
    <div className="page-encyclopedia encyclopedia-shell">
      <div className="atelier-banner atelier-banner--compact">
        <div
          className="atelier-banner__media"
          style={{ backgroundImage: `url(${MUSHROOM_HERO_SHOTS[0]})` }}
        />
        <div className="atelier-banner__veil" />
        <div className="atelier-banner__copy">
          <h1>Enciclopedia de setas</h1>
          <p>
            {catalogLoading ? 'Cargando catálogo…' : `${speciesCatalogMeta.count} taxones`} ·{' '}
            {foodStats.total_documented} con calidad documentada. Solo orientación.
          </p>
        </div>
      </div>

      {catalogLoading && (
        <div className="skeleton-atelier" style={{ minHeight: 180, marginBottom: '1rem' }}>
          <div className="skeleton-atelier__shimmer" />
        </div>
      )}

      <div className="ency-studio-toggle-row">
        <button
          type="button"
          className="result-layer__toggle"
          aria-expanded={studioOpen}
          onClick={() => setStudioOpen((v) => !v)}
        >
          <span>
            {featured
              ? `Destacada: ${featured.common_names[0] || featured.taxon}`
              : 'Vista 360 de destacada'}
          </span>
          <span aria-hidden="true">{studioOpen ? '−' : '+'}</span>
        </button>
      </div>

      {studioOpen && (
        <div className="ency-studio">
          <div className="ency-studio__spin">
            <Suspense
              fallback={
                <div className="skeleton-atelier skeleton-atelier--spin" aria-hidden>
                  <div className="skeleton-atelier__shimmer" />
                </div>
              }
            >
              <PhotoSpinViewer
                taxon={featured?.taxon || 'Amanita phalloides'}
                height={280}
                riskLabel={featured?.risk_label || 'deadly'}
                label={
                  featured
                    ? `Fotos reales de ${featured.taxon}`
                    : 'Fotos reales de seta'
                }
                autoPlay
              />
            </Suspense>
          </div>
          <div className="ency-studio__copy">
            {featured ? (
              <>
                <h2 className="ency-studio__taxon">{featured.taxon}</h2>
                <p className="ency-studio__common">
                  {featured.common_names.slice(0, 3).join(' · ') || 'Sin nombre común local'}
                </p>
                {featured.family && (
                  <button
                    type="button"
                    className="family-chip"
                    title={featured.family}
                    onClick={() => onFamily(featured.family!)}
                  >
                    {featured.family_es || featured.family}
                  </button>
                )}{' '}
                {featuredRisk && (
                  <span className={`risk-chip ${featuredRisk.className}`}>
                    {featuredRisk.label}
                  </span>
                )}
              </>
            ) : (
              <p>Prueba otra búsqueda o familia.</p>
            )}
          </div>
        </div>
      )}

      <div className="encyclopedia-toolbar ency-toolbar">
        <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
          <input
            type="search"
            placeholder="Níscalo, oronja, Amanita…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Buscar especies"
          />
        </div>
        <label className="ency-risk-select">
          Familia
          <select
            value={family}
            onChange={(e) => onFamily(e.target.value)}
            aria-label="Filtrar por familia"
          >
            <option value="all">Todas las familias</option>
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
          Riesgo
          <select
            value={risk}
            onChange={(e) => onRisk(e.target.value as 'all' | RiskLabel)}
            aria-label="Filtrar por riesgo"
          >
            {RISK_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
                {f.id !== 'all' && counts[f.id] != null ? ` (${counts[f.id]})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="ency-risk-select">
          Calidad
          <select
            value={food}
            onChange={(e) => onFood(e.target.value as 'all' | FoodClass | 'documented')}
            aria-label="Filtrar por calidad alimenticia documentada"
          >
            {FOOD_FILTERS.map((f) => (
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

      <div className="family-chip-row" role="list">
        <button
          type="button"
          className={`family-chip ${family === 'all' ? 'family-chip--active' : ''}`}
          onClick={() => onFamily('all')}
        >
          Todas
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
            {moreFamilies ? 'Menos' : 'Más familias'}
          </button>
        )}
      </div>

      <p className="results-count">
        {allResults.length} {allResults.length === 1 ? 'especie' : 'especies'}
        {family !== 'all'
          ? ` · ${families.find((x) => x.family === family)?.family_es || family}`
          : ''}
        {results.length < allResults.length ? ` · mostrando ${results.length}` : ''}
      </p>

      {results.length > 0 ? (
        <>
          <div className="species-photo-grid">
            {results.map((s) => (
              <SpeciesPhotoCard key={s.slug} species={s} />
            ))}
          </div>
          {hasMore && (
            <div className="ency-more">
              <button
                type="button"
                className="btn-atelier btn-atelier--primary"
                onClick={() => setPage((p) => p + 1)}
              >
                Cargar más ({allResults.length - results.length} restantes)
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title="Sin coincidencias"
          description="Prueba otra familia, nombre científico o nombre común en español."
          icon={<IconMushroom size={28} />}
          actionLabel="Limpiar filtros"
          onAction={() => {
            onQuery('')
            onFamily('all')
            onRisk('all')
          }}
        />
      )}
    </div>
  )
}
