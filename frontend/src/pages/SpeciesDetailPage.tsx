/** Species detail page: full info, photo gallery from Wikipedia, taxonomy, safety info. */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getMushroomByScientificName,
  EDIBILITY_COLORS,
  EDIBILITY_LABELS,
} from '../data/mushroomDatabase'
import { getWikiMediaImages, getWikiSummary } from '../api/wikipedia'
import type { WikiImage, WikiSummary } from '../api/wikipedia'
import { getMushroomImages } from '../api/mushroomImages'

export function SpeciesDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const scientificName = slug ? decodeURIComponent(slug) : ''
  const species = getMushroomByScientificName(scientificName)

  const [images, setImages] = useState<WikiImage[]>([])
  const [wiki, setWiki] = useState<WikiSummary | null>(null)
  const [lightbox, setLightbox] = useState<WikiImage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.scrollTo(0, 0)
    setLoading(true)
    setImages([])
    setWiki(null)
    Promise.all([
      getWikiMediaImages(scientificName, 8),
      getWikiSummary(scientificName),
      getMushroomImages(scientificName, 6),
    ]).then(([wikiImgs, summary, apiImgs]) => {
      // Merge all images, deduplicating by URL
      const merged: WikiImage[] = [...wikiImgs]
      for (const img of apiImgs) {
        if (!merged.some((m) => m.url === img.url)) {
          merged.push({ url: img.url, caption: img.caption })
        }
      }
      setImages(merged)
      setWiki(summary)
      setLoading(false)
    })
  }, [scientificName])

  if (!species) {
    return (
      <div className="page-detail">
        <div className="empty-results">
          <span className="empty-results-icon">🍄</span>
          <h3>Especie no encontrada</h3>
          <p>No tenemos información sobre "{scientificName}".</p>
          <Link to="/enciclopedia" className="btn btn-primary">
            ← Volver a la enciclopedia
          </Link>
        </div>
      </div>
    )
  }

  const isDangerous = species.edibility === 'toxico' || species.edibility === 'mortifero'

  return (
    <div className="page-detail">
      <div className="detail-back">
        <Link to="/enciclopedia">← Volver a la enciclopedia</Link>
      </div>

      {/* Header card */}
      <div className="detail-header">
        <div className="detail-header-image">
          {loading ? (
            <div className="detail-image-placeholder">
              <span>{species.icon}</span>
            </div>
          ) : images[0]?.url ? (
            <img src={images[0].url} alt={species.commonNames[0]} />
          ) : (
            <div className="detail-image-placeholder">
              <span>{species.icon}</span>
            </div>
          )}
        </div>
        <div className="detail-header-info">
          <span className="detail-icon">{species.icon}</span>
          <h1>{species.commonNames[0]}</h1>
          <p className="detail-scientific">{species.scientificName}</p>
          <p className="detail-tagline">{species.tagline}</p>
          <div className="detail-meta-row">
            <span
              className="detail-badge"
              style={{ backgroundColor: EDIBILITY_COLORS[species.edibility] }}
            >
              {EDIBILITY_LABELS[species.edibility]}
            </span>
            <span className="detail-chip">🌳 {species.family}</span>
            <span className="detail-chip">📅 {species.season}</span>
          </div>
        </div>
      </div>

      {/* Danger warning */}
      {isDangerous && (
        <div className="danger-banner">
          <span className="danger-banner-icon">☠️</span>
          <div>
            <strong>
              {species.edibility === 'mortifero' ? 'ESPECIE MORTAL' : 'Especie tóxica'}
            </strong>
            <p>
              {species.toxicity ??
                'Esta seta es peligrosa. No consumir bajo ningún concepto.'}
            </p>
          </div>
        </div>
      )}

      {/* Description */}
      <div className="detail-section">
        <h2>📖 Descripción</h2>
        <p className="detail-description">{species.description}</p>
        {wiki?.extract && <p className="detail-wiki-extract">{wiki.extract}</p>}
      </div>

      {/* Photo gallery */}
      <div className="detail-section">
        <h2>📸 Galería de fotos</h2>
        {loading ? (
          <div className="gallery-loading">Cargando fotos…</div>
        ) : images.length > 0 ? (
          <div className="photo-gallery">
            {images.map((img, i) => (
              <div key={i} className="gallery-item" onClick={() => setLightbox(img)}>
                <img src={img.url} alt={img.caption ?? species.commonNames[0]} loading="lazy" />
                {img.license && <span className="gallery-license">📷 {img.license}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="gallery-empty">No hay fotos disponibles en este momento.</p>
        )}
        {wiki?.url && (
          <p className="wiki-source">
            Fuente:{' '}
            <a href={wiki.url} target="_blank" rel="noopener noreferrer">
              Wikipedia
            </a>
          </p>
        )}
      </div>

      {/* Identification features */}
      <div className="detail-section">
        <h2>🔍 Características de identificación</h2>
        <div className="features-list">
          {species.keyFeatures.map((f, i) => (
            <div key={i} className="feature-bullet">
              <span className="feature-bullet-icon">✓</span>
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Anatomy cards */}
      <div className="detail-anatomy">
        <div className="anatomy-card">
          <span className="anatomy-icon">🎩</span>
          <h3>Sombrero</h3>
          <p>{species.cap}</p>
        </div>
        <div className="anatomy-card">
          <span className="anatomy-icon">🦵</span>
          <h3>Pie</h3>
          <p>{species.stem}</p>
        </div>
        <div className="anatomy-card">
          <span className="anatomy-icon">🔻</span>
          <h3>Himenio</h3>
          <p>{species.hymenium}</p>
        </div>
      </div>

      {/* Habitat */}
      <div className="detail-section">
        <h2>🌳 Hábitat y temporada</h2>
        <div className="habitat-info">
          <div className="habitat-item">
            <span className="habitat-label">Dónde encontrarla</span>
            <span className="habitat-value">{species.habitat}</span>
          </div>
          <div className="habitat-item">
            <span className="habitat-label">Cuándo</span>
            <span className="habitat-value">{species.season}</span>
          </div>
        </div>
      </div>

      {/* Look-alikes */}
      {species.lookAlikes && species.lookAlikes.length > 0 && (
        <div className="detail-section">
          <h2>⚠️ Especies similares</h2>
          <p className="lookalikes-intro">
            Cuidado con estas especies que pueden confundirse:
          </p>
          <ul className="lookalikes-list">
            {species.lookAlikes.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Also known as */}
      <div className="detail-section">
        <h2>🏷️ También conocida como</h2>
        <div className="aka-tags">
          {species.commonNames.map((n) => (
            <span key={n} className="aka-tag">
              {n}
            </span>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt={lightbox.caption ?? species.commonNames[0]} />
          {lightbox.caption && <p className="lightbox-caption">{lightbox.caption}</p>}
          <button className="lightbox-close" onClick={() => setLightbox(null)} aria-label="Cerrar">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}