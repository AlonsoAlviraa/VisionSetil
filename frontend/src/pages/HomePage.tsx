import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { mushroomDatabase, getFeaturedMushrooms } from '../data/mushroomDatabase'
import { FeaturedMushroomCard } from '../components/FeaturedMushroomCard'
import { getMushroomImage } from '../api/mushroomImages'
import { SporeParticles } from '../components/SporeParticles'

type SeasonKey = 'winter' | 'spring' | 'summer' | 'autumn'

function getSeasonInfo() {
  const month = new Date().getMonth() + 1
  const seasons: Record<SeasonKey, { label: string; icon: string; color: string }> = {
    winter: { label: 'Invierno', icon: '❄️', color: '#5b9bd5' },
    spring: { label: 'Primavera', icon: '🌿', color: '#7cb342' },
    summer: { label: 'Verano', icon: '☀️', color: '#f5a623' },
    autumn: { label: 'Otoño', icon: '🍂', color: '#d97706' },
  }
  let key: SeasonKey = 'autumn'
  if (month >= 12 || month <= 2) key = 'winter'
  else if (month >= 3 && month <= 5) key = 'spring'
  else if (month >= 6 && month <= 8) key = 'summer'
  return { ...seasons[key], month }
}

export function HomePage() {
  const featured = getFeaturedMushrooms()
  const [heroImage, setHeroImage] = useState<string | null>(null)
  const seasonInfo = getSeasonInfo()

  const inSeason = useMemo(() => {
    const iconToSeason: Record<string, string> = {
      '❄️': 'winter',
      '🌿': 'spring',
      '☀️': 'summer',
      '🍂': 'autumn',
    }
    const seasonKeywords: Record<string, string[]> = {
      winter: ['invierno', 'todas'],
      spring: ['primavera', 'todas'],
      summer: ['verano', 'todas'],
      autumn: ['otono', 'otoño', 'todas'],
    }
    const seasonKey = iconToSeason[seasonInfo.icon] || 'autumn'
    const keywords = seasonKeywords[seasonKey] || seasonKeywords.autumn
    return mushroomDatabase.filter((m) => m.season && keywords.some((kw) => m.season.toLowerCase().includes(kw))).slice(0, 4)
  }, [seasonInfo])

  const deadly = useMemo(() => mushroomDatabase.filter((m) => m.edibility === 'mortifero').slice(0, 3), [])

  useEffect(() => {
    getMushroomImage('Cantharellus cibarius').then((url) => url && setHeroImage(url))
  }, [])

  return (
    <div className="home-page">
      {/* ═══ HERO ═══ */}
      <section className="hero-section">
        {heroImage && (
          <div className="hero-bg-image" style={{ backgroundImage: `url(${heroImage})` }} />
        )}
        <div className="hero-overlay" />
        <SporeParticles count={20} color="rgba(255, 255, 255, 0.3)" />
        <div className="hero-content">
          <h1 className="hero-title">
            Guía de setas<br />
            de <span className="hero-highlight">España</span>
          </h1>
          <p className="hero-description">
            Enciclopedia con {mushroomDatabase.length} especies, identificador visual,
            mapa de zonas y guía de seguridad. Todo lo que necesitas como aficionado a la micología.
          </p>
          <div className="hero-cta">
            <Link to="/identificar" className="btn-hero-primary">🔍 Identificar seta</Link>
            <Link to="/enciclopedia" className="btn-hero-secondary">📚 Enciclopedia</Link>
          </div>
          <div className="hero-stats-bar">
            <div className="hero-stat-item">
              <span className="hero-stat-number">{mushroomDatabase.length}</span>
              <span className="hero-stat-label">Especies</span>
            </div>
            <div className="hero-divider" />
            <div className="hero-stat-item">
              <span className="hero-stat-number">66</span>
              <span className="hero-stat-label">Zonas</span>
            </div>
            <div className="hero-divider" />
            <div className="hero-stat-item">
              <span className="hero-stat-number">{seasonInfo.icon}</span>
              <span className="hero-stat-label">{seasonInfo.label}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="section">
        <div className="section-header-center">
          <h2 className="section-title-lg">Explora</h2>
          <p className="section-subtitle-lg">Herramientas para el aficionado a las setas</p>
        </div>
        <div className="features-grid-v2">
          <Link to="/identificar" className="feature-tile">
            <div className="feature-tile-icon" style={{ background: 'linear-gradient(135deg, #3a5a40, #588157)' }}>🔍</div>
            <h3>Identificador</h3>
            <p>Sube una foto y obtén el resultado en segundos.</p>
            <span className="feature-arrow">→</span>
          </Link>
          <Link to="/enciclopedia" className="feature-tile">
            <div className="feature-tile-icon" style={{ background: 'linear-gradient(135deg, #bc6c25, #dda15e)' }}>📖</div>
            <h3>Enciclopedia</h3>
            <p>{mushroomDatabase.length} especies con fotos, descripción y hábitat.</p>
            <span className="feature-arrow">→</span>
          </Link>
          <Link to="/mapa" className="feature-tile">
            <div className="feature-tile-icon" style={{ background: 'linear-gradient(135deg, #3d5a80, #98c1d9)' }}>🗺️</div>
            <h3>Mapa de zonas</h3>
            <p>66 zonas con datos de fructificación por época del año.</p>
            <span className="feature-arrow">→</span>
          </Link>
          <Link to="/educacion" className="feature-tile">
            <div className="feature-tile-icon" style={{ background: 'linear-gradient(135deg, #5c3d2e, #a4633a)' }}>🎓</div>
            <h3>Aprende</h3>
            <p>Reglas de oro, anatomía y guía de seguridad.</p>
            <span className="feature-arrow">→</span>
          </Link>
        </div>
      </section>

      {/* ═══ FEATURED ═══ */}
      <section className="section">
        <div className="section-header-center">
          <span className="section-badge">⭐ Destacadas</span>
          <h2 className="section-title-lg">Especies que debes conocer</h2>
          <p className="section-subtitle-lg">De los reyes del bosque a las más peligrosas</p>
        </div>
        <div className="featured-mushroom-grid">
          {featured.map((m) => (
            <FeaturedMushroomCard key={m.scientificName} species={m} />
          ))}
        </div>
      </section>

      {/* ═══ IN SEASON ═══ */}
      {inSeason.length > 0 && (
        <section className="section">
          <div className="section-header-center">
            <span className="section-badge" style={{ background: seasonInfo.color + '22', color: seasonInfo.color }}>
              {seasonInfo.icon} Temporada actual
            </span>
            <h2 className="section-title-lg">En temporada este {seasonInfo.label.toLowerCase()}</h2>
            <p className="section-subtitle-lg">Especies que fructifican ahora</p>
          </div>
          <div className="featured-mushroom-grid">
            {inSeason.map((m) => (
              <FeaturedMushroomCard key={m.scientificName} species={m} />
            ))}
          </div>
        </section>
      )}

      {/* ═══ DEADLY ═══ */}
      {deadly.length > 0 && (
        <section className="section">
          <div className="section-header-center">
            <span className="section-badge" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>
              ☠️ Mortales
            </span>
            <h2 className="section-title-lg">Las que pueden matarte</h2>
            <p className="section-subtitle-lg">Aprende a identificarlas para evitarlas</p>
          </div>
          <div className="featured-mushroom-grid">
            {deadly.map((m) => (
              <FeaturedMushroomCard key={m.scientificName} species={m} />
            ))}
          </div>
        </section>
      )}

      {/* ═══ SAFETY ═══ */}
      <section className="section">
        <div className="safety-banner-v2">
          <div className="safety-banner-icon">⚠️</div>
          <div className="safety-banner-content">
            <h3>Seguridad ante todo</h3>
            <p>
              Esta herramienta es orientativa. <strong>Nunca consumas una seta
              sin la validación de un experto micólogo.</strong> Ante la duda, desecha.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="section">
        <div className="cta-card">
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🍄</div>
          <h2>¿Tienes una seta en mano?</h2>
          <p>Súbela y te ayudamos a identificarla.</p>
          <Link to="/identificar" className="btn-hero-primary">🔍 Identificar ahora</Link>
        </div>
      </section>
    </div>
  )
}