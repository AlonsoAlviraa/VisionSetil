import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FeaturedMushroomCard } from '../components/FeaturedMushroomCard'
import { SpeciesImage } from '../components/SpeciesImage'
import { SporeParticles } from '../components/SporeParticles'
import { useSpeciesCatalog, catalogToMushroomSpecies } from '../hooks/useSpeciesCatalog'
import { speciesImageUrl } from '../lib/speciesImageUrl'

type SeasonKey = 'winter' | 'spring' | 'summer' | 'autumn'

function currentSeasonKey(): SeasonKey {
  const month = new Date().getMonth() + 1
  if (month >= 12 || month <= 2) return 'winter'
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  return 'autumn'
}

function normalizeSeasonText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—-]/g, '-')
}

const SEASON_META: Record<SeasonKey, { icon: string; color: string; keys: string[] }> = {
  winter: { icon: '❄️', color: '#5b9bd5', keys: ['invierno', 'winter', 'negu', 'hivern', 'todas', 'totes'] },
  spring: { icon: '🌿', color: '#7cb342', keys: ['primavera', 'spring', 'udaberri', 'todas', 'totes'] },
  summer: { icon: '☀️', color: '#f5a623', keys: ['verano', 'summer', 'estiu', 'uda', 'todas', 'totes'] },
  autumn: {
    icon: '🍂',
    color: '#d97706',
    keys: ['otono', 'otono', 'autumn', 'tardor', 'udazken', 'otono-invierno', 'todas', 'totes'],
  },
}

export function HomePage() {
  const { t, i18n } = useTranslation()
  const locale = (i18n.language || 'es').slice(0, 2)
  const { items, featured: featuredCat } = useSpeciesCatalog(locale)
  const seasonKey = currentSeasonKey()
  const seasonMeta = SEASON_META[seasonKey]
  const seasonLabel = t(`seasons.${seasonKey}`, {
    defaultValue: seasonKey,
  })

  const featured = useMemo(
    () => featuredCat.slice(0, 12).map(catalogToMushroomSpecies),
    [featuredCat],
  )

  const inSeason = useMemo(() => {
    const keywords = SEASON_META[seasonKey].keys.map(normalizeSeasonText)
    return items
      .filter((m) => {
        const s = normalizeSeasonText(m.season || '')
        return s && keywords.some((kw) => s.includes(kw))
      })
      .slice(0, 8)
      .map(catalogToMushroomSpecies)
  }, [items, seasonKey])

  const deadly = useMemo(
    () =>
      items
        .filter((m) => m.edibility_code === 'mortifero' || m.risk_level === 'deadly')
        .slice(0, 8)
        .map(catalogToMushroomSpecies),
    [items],
  )

  const deadlyTotal = useMemo(
    () =>
      items.filter((m) => m.edibility_code === 'mortifero' || m.risk_level === 'deadly').length,
    [items],
  )

  const heroSlug = useMemo(() => {
    const pool = featuredCat.length
      ? featuredCat
      : items.filter((m) => m.featured).slice(0, 8)
    if (!pool.length) return 'cantharellus-cibarius'
    const pick = pool[Math.floor(Date.now() / 86_400_000) % pool.length]
    return pick.slug || 'cantharellus-cibarius'
  }, [featuredCat, items])

  const collections = useMemo(() => {
    const defs = [
      { id: 'amanitas', labelKey: 'home.collectionAmanitas', icon: '🔴', match: (c: string[]) => c.includes('amanitas') || c.includes('amanita') },
      { id: 'boletus', labelKey: 'home.collectionBoletales', icon: '🟤', match: (c: string[]) => c.includes('boletus') },
      { id: 'lactarius', labelKey: 'home.collectionMilkcaps', icon: '🟠', match: (c: string[]) => c.includes('lactarius') },
      { id: 'cantharellus', labelKey: 'home.collectionChanterelles', icon: '🟡', match: (c: string[]) => c.includes('cantharellus') },
      { id: 'toxicas', labelKey: 'home.collectionToxic', icon: '☠️', match: (c: string[]) => c.includes('toxicas') },
      { id: 'trufas', labelKey: 'home.collectionTruffles', icon: '⬛', match: (c: string[]) => c.includes('trufas') },
    ]
    return defs
      .map((d) => ({
        ...d,
        count: items.filter((m) => d.match(m.categories || [])).length,
        href: `/enciclopedia?cat=${d.id}`,
      }))
      .filter((d) => d.count > 0)
  }, [items])

  const heroUrl = speciesImageUrl(heroSlug, 'detail')

  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="hero-bg-image" style={{ backgroundImage: `url(${heroUrl})` }} />
        <div
          data-testid="home-hero-species-image"
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}
        >
          <SpeciesImage
            scientificName={heroSlug.replace(/-/g, ' ')}
            slug={heroSlug}
            variant="card"
            alt={heroSlug}
            priority
          />
        </div>
        <div className="hero-overlay" />
        <SporeParticles count={20} color="rgba(255, 255, 255, 0.3)" />
        <div className="hero-content">
          <h1 className="hero-title">{t('home.heroTitle')}</h1>
          <p className="hero-description">
            {t('home.heroBody')} ({items.length} {t('home.species').toLowerCase()})
          </p>
          <div className="hero-cta">
            <Link to="/identificar" className="btn-hero-primary vs-btn vs-btn--primary vs-btn--lg">
              🔍 {t('home.ctaIdentify')}
            </Link>
            <Link to="/enciclopedia" className="btn-hero-secondary vs-btn vs-btn--secondary vs-btn--lg">
              📚 {t('home.ctaEncyclopedia')}
            </Link>
          </div>
          <div className="hero-stats-bar" data-testid="home-stats">
            <div className="hero-stat-item">
              <span className="hero-stat-number" data-testid="home-species-count">{items.length}</span>
              <span className="hero-stat-label">{t('home.species')}</span>
            </div>
            <div className="hero-divider" />
            <div className="hero-stat-item">
              <span className="hero-stat-number">{deadlyTotal}</span>
              <span className="hero-stat-label">{t('home.deadlyShort')}</span>
            </div>
            <div className="hero-divider" />
            <div className="hero-stat-item">
              <span className="hero-stat-number">{seasonMeta.icon}</span>
              <span className="hero-stat-label">{seasonLabel}</span>
            </div>
          </div>
        </div>
      </section>

      {collections.length > 0 && (
        <section className="section">
          <div className="section-header-center">
            <span className="section-badge">🗂️ {t('home.collections')}</span>
            <h2 className="section-title-lg">{t('home.collections')}</h2>
          </div>
          <div className="home-collections-row" data-testid="home-collections">
            {collections.map((c) => (
              <Link key={c.id} to={`/enciclopedia?cat=${c.id}`} className="home-collection-chip">
                <span className="home-collection-chip__count">{c.count}</span>
                <span className="home-collection-chip__label">{t(c.labelKey)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-header-center">
          <span className="section-badge">⭐ {t('home.featured')}</span>
          <h2 className="section-title-lg">{t('home.featured')}</h2>
          <p className="section-subtitle-sm">{t('home.featuredHint')}</p>
        </div>
        <div className="featured-carousel" data-testid="home-featured-carousel">
          {featured.map((m) => (
            <div key={m.scientificName} className="featured-carousel__item">
              <FeaturedMushroomCard species={m} />
            </div>
          ))}
        </div>
      </section>

      {inSeason.length > 0 && (
        <section className="section">
          <div className="section-header-center">
            <span
              className="section-badge"
              style={{ background: seasonMeta.color + '22', color: seasonMeta.color }}
            >
              {seasonMeta.icon} {t('home.inSeason')}
            </span>
            <h2 className="section-title-lg">{t('home.inSeason')}</h2>
          </div>
          <div className="featured-mushroom-grid">
            {inSeason.map((m) => (
              <FeaturedMushroomCard key={m.scientificName} species={m} />
            ))}
          </div>
        </section>
      )}

      {deadly.length > 0 && (
        <section className="section">
          <div className="section-header-center">
            <span className="section-badge" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>
              ☠️ {t('home.deadly')}
            </span>
            <h2 className="section-title-lg">{t('home.deadly')}</h2>
          </div>
          <div className="featured-mushroom-grid">
            {deadly.map((m) => (
              <FeaturedMushroomCard key={m.scientificName} species={m} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="safety-banner-v2" data-testid="safety-banner">
          <div className="safety-banner-icon">⚠️</div>
          <div className="safety-banner-content">
            <h3>{t('safety.bannerTitle')}</h3>
            <p>{t('safety.bannerBody')}</p>
          </div>
        </div>
      </section>
    </div>
  )
}
