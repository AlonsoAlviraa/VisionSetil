import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { HOME_FEATURES, MEDIA } from '../data/media'
import { SeasonRadar } from '../components/SeasonRadar'
import { SpeciesThumb } from '../components/SpeciesThumb'

const PhotoSpinViewer = lazy(() =>
  import('../components/PhotoSpinViewer').then((m) => ({ default: m.PhotoSpinViewer })),
)

/** SSOT catalog size for first paint — avoid hydrating 520 taxa on Home (audit P1/P4). */
const HOME_CATALOG_COUNT = 520

/** Lightweight deadly taxa for first paint — full catalog loads async (code-split). */
const HOME_DEADLY_SEED: Array<{ taxon: string; slug: string; name: string; risk: string }> = [
  { taxon: 'Amanita phalloides', slug: 'amanita-phalloides', name: 'Oronja verde', risk: 'deadly' },
  { taxon: 'Amanita virosa', slug: 'amanita-virosa', name: 'Ángel destructor', risk: 'deadly' },
  {
    taxon: 'Galerina marginata',
    slug: 'galerina-marginata',
    name: 'Galerina de los márgenes',
    risk: 'deadly',
  },
  {
    taxon: 'Cortinarius rubellus',
    slug: 'cortinarius-rubellus',
    name: 'Cortinario mortal',
    risk: 'deadly',
  },
  {
    taxon: 'Lepiota brunneoincarnata',
    slug: 'lepiota-brunneoincarnata',
    name: 'Lepiota mortal',
    risk: 'deadly',
  },
]

function seasonLabel(): string {
  const m = new Date().getMonth() + 1
  if (m >= 12 || m <= 2) return 'Invierno'
  if (m <= 5) return 'Primavera'
  if (m <= 8) return 'Verano'
  return 'Otoño'
}

/** Phase D-03: single media path via SpeciesThumb → SpeciesImage (no raw useSpeciesImage). */
function DeadlyThumb({
  taxon,
  slug,
  name,
  risk,
}: {
  taxon: string
  slug: string
  name: string
  risk: string
}) {
  return (
    <Link to={`/enciclopedia/${slug}`} className="home-deadly-chip" title={`${name} — ${taxon}`}>
      <SpeciesThumb
        taxon={taxon}
        slug={slug}
        riskLabel={risk}
        alt={`${name} (${taxon})`}
        size={56}
        variant="thumb"
        priority={slug === 'amanita-phalloides'}
        className="home-deadly-chip__thumb"
      />
      <span>
        <small>{name}</small>
        <em>{taxon}</em>
      </span>
    </Link>
  )
}

export function HomePage() {
  // Seed only — full catalog loads on encyclopedia/identify when needed.
  const [deadlyPreview] = useState(HOME_DEADLY_SEED)
  const displayCount = HOME_CATALOG_COUNT

  return (
    <div className="home-page home-atelier">
      <section className="atelier-hero" aria-label="Presentación">
        <div
          className="atelier-hero__media"
          style={{ backgroundImage: `url(${MEDIA.heroForest})` }}
          role="img"
          aria-label="Setas en su hábitat natural"
        />
        <div className="atelier-hero__veil" />
        <div className="atelier-hero__content">
          <span className="atelier-kicker">Micología de campo</span>
          <h1>
            Setas reales.
            <br />
            <em>Riesgo claro.</em>
          </h1>
          <p className="atelier-hero__lead">
            Fotos de campo, catálogo y una IA que se calla si duda. Te orientamos — el micólogo
            decide.
          </p>
          <div className="atelier-cta-row">
            <Link to="/identificar" className="btn-atelier btn-atelier--primary">
              Identificar seta
            </Link>
            <Link to="/enciclopedia" className="btn-atelier btn-atelier--ghost">
              Enciclopedia
            </Link>
            <Link to="/reto" className="btn-atelier btn-atelier--ghost">
              Reto del día
            </Link>
          </div>
          <div className="atelier-stats">
            <div className="atelier-stat">
              <strong data-testid="home-species-count">{displayCount}</strong>
              <span>Taxones</span>
            </div>
            <div className="atelier-stat">
              <strong>{deadlyPreview.length}+</strong>
              <span>Mortales</span>
            </div>
            <div className="atelier-stat">
              <strong>{seasonLabel()}</strong>
              <span>Temporada</span>
            </div>
          </div>
          <p className="atelier-hero__fine">
            Calidad alimenticia solo con fuentes curadas · el reto no inventa comestibles.
          </p>
        </div>
      </section>

      <section className="atelier-section home-spin-section">
        <div className="home-spin-grid">
          <div>
            <p className="atelier-kicker home-kicker">Fotografía de campo</p>
            <h2 className="home-spin-title">Fotos reales en 360°</h2>
            <p className="home-spin-lead">
              Arrastra entre fotos de la misma especie. Sin dibujos inventados.
            </p>
            <Link to="/enciclopedia" className="btn-atelier btn-atelier--ink">
              Abrir fichas
            </Link>
          </div>
          <Suspense
            fallback={
              <div className="skeleton-atelier skeleton-atelier--spin" aria-hidden>
                <div className="skeleton-atelier__shimmer" />
              </div>
            }
          >
            <PhotoSpinViewer
              taxon="Amanita phalloides"
              maxFrames={6}
              autoPlay={false}
              preferSameOrigin
              height={400}
              riskLabel="deadly"
              label="Oronja verde — fotos reales"
            />
          </Suspense>
        </div>
      </section>

      <section className="atelier-section">
        <div className="atelier-section__head">
          <div>
            <h2>Tres caminos</h2>
            <p>Identifica, consulta el catálogo o entrena con el reto.</p>
          </div>
        </div>
        <div className="atelier-grid atelier-grid--3">
          {HOME_FEATURES.slice(0, 3).map((f) => (
            <Link key={f.to} to={f.to} className="atelier-card">
              <div className="atelier-card__img" style={{ backgroundImage: `url(${f.image})` }} />
              <div className="atelier-card__veil" />
              <div className="atelier-card__body">
                <h3>{f.title}</h3>
                <p>{f.description}</p>
                <span className="atelier-card__cta">{f.cta}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="atelier-section">
        <div className="atelier-section__head">
          <div>
            <h2>Alertas mortales</h2>
            <p>Las que conviene conocer de memoria.</p>
          </div>
        </div>
        <div className="home-deadly-row" role="list">
          {deadlyPreview.map((s) => (
            <DeadlyThumb
              key={s.slug}
              taxon={s.taxon}
              slug={s.slug}
              name={s.name}
              risk={s.risk}
            />
          ))}
        </div>
      </section>

      <section className="atelier-section home-season-section" data-testid="home-season">
        <div className="home-season-head">
          <p className="atelier-kicker">Esta temporada</p>
          <h2 className="home-season-title">Vista educativa de lo que suele fructificar</h2>
          <p className="home-season-sub">
            Radar de orientación — no es guía de recolección ni permiso de consumo.
          </p>
        </div>
        <div className="home-season-body home-season-body--always">
          <SeasonRadar />
        </div>
      </section>
    </div>
  )
}
