/** Encyclopedia page: searchable grid from unified catalog (PR-08 + UX pro). */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MushroomCard } from '../components/MushroomCard'
import { EmptyState, Skeleton } from '../components/ui'
import { useSpeciesCatalog, catalogToMushroomSpecies } from '../hooks/useSpeciesCatalog'
import { ALL_CATEGORIES } from '../data/mushroomDatabase'
import type { EdibilityLevel } from '../data/mushroomDatabase'
import { loadFavorites } from '../lib/favorites'
import { featureFlags } from '../lib/featureFlags'

const PAGE_SIZE = 24

export function EncyclopediaPage() {
  const { t, i18n } = useTranslation()
  const locale = (i18n.language || 'es').slice(0, 2)
  const [searchParams, setSearchParams] = useSearchParams()
  const { items, loading, search } = useSpeciesCatalog(locale)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(searchParams.get('cat') || 'todas')
  const [edibility, setEdibility] = useState<EdibilityLevel | 'todas'>('todas')
  const [seasonFilter, setSeasonFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState<'todas' | 'deadly' | 'high'>('todas')
  const [favOnly, setFavOnly] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)

  useEffect(() => {
    const cat = searchParams.get('cat')
    if (cat) setCategory(cat)
  }, [searchParams])

  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [query, category, edibility, seasonFilter, riskFilter, favOnly])

  const families = useMemo(() => {
    const set = new Set<string>()
    items.forEach((m) => {
      if (m.family) set.add(m.family)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [items])

  const [family, setFamily] = useState('todas')

  const results = useMemo(() => {
    let list = query.trim() ? search(query) : [...items]
    if (category !== 'todas') {
      list = list.filter((m) => m.categories.includes(category))
    }
    if (edibility !== 'todas') {
      list = list.filter((m) => m.edibility_code === edibility)
    }
    if (seasonFilter) {
      const kw = seasonFilter.toLowerCase()
      list = list.filter((m) => (m.season || '').toLowerCase().includes(kw))
    }
    if (riskFilter === 'deadly') {
      list = list.filter((m) => m.risk_level === 'deadly' || m.edibility_code === 'mortifero')
    } else if (riskFilter === 'high') {
      list = list.filter(
        (m) =>
          m.risk_level === 'high' ||
          m.risk_level === 'deadly' ||
          m.edibility_code === 'toxico' ||
          m.edibility_code === 'mortifero',
      )
    }
    if (family !== 'todas') {
      list = list.filter((m) => m.family === family)
    }
    if (favOnly && featureFlags.FAVORITES) {
      const favs = new Set(loadFavorites())
      list = list.filter((m) => favs.has(m.slug))
    }
    return list
  }, [items, query, category, edibility, seasonFilter, riskFilter, family, favOnly, search])

  const page = results.slice(0, visible)

  const setCategoryAndUrl = (id: string) => {
    setCategory(id)
    if (id === 'todas') {
      searchParams.delete('cat')
      setSearchParams(searchParams, { replace: true })
    } else {
      setSearchParams({ cat: id }, { replace: true })
    }
  }

  return (
    <div className="page-encyclopedia">
      <div className="page-header">
        <h1 className="page-title">🍄 {t('encyclopedia.title')}</h1>
        <p className="page-subtitle">
          {t('encyclopedia.subtitle')} ·{' '}
          <strong data-testid="encyclopedia-count">{items.length}</strong> {t('home.species').toLowerCase()}
        </p>
        <p className="page-subtitle" data-testid="encyclopedia-disclaimer" style={{ fontSize: '0.85rem', opacity: 0.9 }}>
          {t('safety.encyclopediaDisclaimer')}
        </p>
      </div>

      <div className="encyclopedia-toolbar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder={t('encyclopedia.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery('')} aria-label={t('actions.clear')}>
              ✕
            </button>
          )}
        </div>

        <div className="filter-chips">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`filter-chip ${category === cat.id ? 'filter-chip--active' : ''}`}
              onClick={() => setCategoryAndUrl(cat.id)}
            >
              <span>{cat.icon}</span>
              {t(`categories.${cat.id}`, { defaultValue: cat.label })}
            </button>
          ))}
        </div>

        <div className="filter-row encyclopedia-filter-row">
          <label>{t('encyclopedia.edibilityFilter')}</label>
          <select
            value={edibility}
            onChange={(e) => setEdibility(e.target.value as EdibilityLevel | 'todas')}
          >
            <option value="todas">{t('encyclopedia.all')}</option>
            <option value="excelente">{t('edibility.excelente')}</option>
            <option value="buen_comestible">{t('edibility.buen_comestible')}</option>
            <option value="comestible_con_cautela">{t('edibility.comestible_con_cautela')}</option>
            <option value="no_recomendado">{t('edibility.no_recomendado')}</option>
            <option value="toxico">{t('edibility.toxico')}</option>
            <option value="mortifero">⚠️ {t('edibility.mortifero')}</option>
          </select>
          <label>{t('encyclopedia.riskFilter')}</label>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}>
            <option value="todas">{t('encyclopedia.all')}</option>
            <option value="high">{t('encyclopedia.riskHigh')}</option>
            <option value="deadly">{t('encyclopedia.riskDeadly')}</option>
          </select>
          <label>{t('encyclopedia.familyFilter')}</label>
          <select value={family} onChange={(e) => setFamily(e.target.value)}>
            <option value="todas">{t('encyclopedia.all')}</option>
            {families.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <label>
            {t('home.inSeason')}:
            <input
              type="text"
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value)}
              placeholder="otoño / primavera…"
              style={{ marginLeft: 6 }}
            />
          </label>
          {featureFlags.FAVORITES ? (
            <label>
              <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />{' '}
              {t('actions.favorite')}
            </label>
          ) : null}
        </div>
        <p className="encyclopedia-result-count" data-testid="encyclopedia-result-count">
          {t('encyclopedia.showing', { shown: page.length, total: results.length })}
        </p>
      </div>

      {loading ? (
        <div className="mushroom-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '1rem' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} height={280} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState title={t('encyclopedia.empty')} description={t('empty.defaultDescription')} />
      ) : (
        <>
          <div className="mushroom-grid" data-testid="encyclopedia-grid">
            {page.map((sp) => (
              <MushroomCard
                key={sp.slug}
                species={catalogToMushroomSpecies(sp)}
                slug={sp.slug}
                riskLevel={sp.risk_level}
              />
            ))}
          </div>
          {visible < results.length ? (
            <div className="encyclopedia-load-more">
              <button
                type="button"
                className="btn-hero-secondary"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
              >
                {t('encyclopedia.loadMore')} ({results.length - visible})
              </button>
            </div>
          ) : null}
        </>
      )}

      <p className="page-subtitle" style={{ marginTop: '2rem', fontSize: '0.8rem' }}>
        {t('encyclopedia.imageCredits')}: VisionSetil media store / fixtures (CC0 procedural where noted).
      </p>
    </div>
  )
}
