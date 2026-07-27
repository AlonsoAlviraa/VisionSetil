/**
 * Product home — visual-first, less copy, connected CTAs.
 */
import { Link } from 'react-router-dom'
import { DeviceFrame } from '../components/marketing/DeviceFrame'
import { SetadleBoardMock } from '../components/marketing/SetadleBoardMock'
import { LearnGallery } from '../components/marketing/LearnGallery'
import { SpeciesImage } from '../components/SpeciesImage'
import { scientificNameToSlug } from '../lib/slug'

const HOME_CATALOG_COUNT = 520

const DEADLY = [
  { taxon: 'Amanita phalloides', name: 'Oronja verde' },
  { taxon: 'Amanita virosa', name: 'Ángel destructor' },
  { taxon: 'Galerina marginata', name: 'Galerina' },
  { taxon: 'Cortinarius rubellus', name: 'Cortinario' },
  { taxon: 'Lepiota brunneoincarnata', name: 'Lepiota' },
] as const

const ICON_STRIP = [
  { taxon: 'Amanita muscaria', name: 'Mosca' },
  { taxon: 'Boletus edulis', name: 'Hongo' },
  { taxon: 'Cantharellus cibarius', name: 'Rebozuelo' },
  { taxon: 'Lactarius deliciosus', name: 'Níscalo' },
  { taxon: 'Macrolepiota procera', name: 'Parasol' },
  { taxon: 'Amanita caesarea', name: 'Oronja' },
] as const

export function HomePage() {
  return (
    <div className="home-page home-mkt home-mkt--tight">
      {/* Hero — short */}
      <section className="mkt-hero mkt-mesh mkt-hero--compact" aria-label="Presentación">
        <div className="mkt-hero__copy">
          <p className="mkt-kicker">VisionSetil</p>
          <h1 className="mkt-h1">
            Setas con
            <br />
            <em>criterio.</em>
          </h1>
          <div className="mkt-cta-row">
            <Link to="/identificar" className="mkt-btn mkt-btn--primary">
              Identificar
            </Link>
            <Link to="/setadle" className="mkt-btn mkt-btn--amber">
              Setadle
            </Link>
            <Link to="/enciclopedia" className="mkt-btn mkt-btn--ghost">
              Enciclopedia
            </Link>
          </div>
          <div className="mkt-hero__stats">
            <div className="mkt-hero__stat">
              <strong data-testid="home-species-count">{HOME_CATALOG_COUNT}</strong>
              <span>Taxones</span>
            </div>
            <div className="mkt-hero__stat">
              <strong>5</strong>
              <span>Juegos</span>
            </div>
          </div>
        </div>
        <div className="mkt-hero__visual">
          <DeviceFrame label="Setadle">
            <SetadleBoardMock compact caption="Diario · colores" />
          </DeviceFrame>
        </div>
      </section>

      {/* Photos only — no marketing walls of text */}
      <div className="mkt-icon-strip" aria-label="Setas icónicas">
        {ICON_STRIP.map((s) => {
          const slug = scientificNameToSlug(s.taxon)
          return (
            <Link
              key={s.taxon}
              to={`/enciclopedia/${slug}`}
              className="mkt-icon-strip__item"
              title={s.taxon}
            >
              <span className="mkt-icon-strip__photo">
                <SpeciesImage
                  scientificName={s.taxon}
                  slug={slug}
                  variant="thumb"
                  alt={s.name}
                  aspectRatio="1"
                  priority={s.taxon === 'Amanita muscaria'}
                  preferCatalog={false}
                />
              </span>
              <span className="mkt-icon-strip__name">{s.name}</span>
            </Link>
          )
        })}
      </div>

      {/* Gallery / mini-video flashcards */}
      <section className="mkt-section mkt-section--tight" aria-label="Galería">
        <LearnGallery />
      </section>

      {/* Setadle — short + visual */}
      <section className="mkt-section mkt-section--tight" aria-label="Setadle">
        <div className="mkt-feature mkt-feature--dark mkt-feature--compact">
          <div>
            <h2 className="mkt-h2">Setadle</h2>
            <p className="mkt-lead">Juego diario. Cinco modos.</p>
            <div className="mkt-cta-row">
              <Link to="/setadle" className="mkt-btn mkt-btn--amber">
                Jugar
              </Link>
            </div>
          </div>
          <div className="mkt-feature__visual">
            <SetadleBoardMock compact caption="Exacto · cerca · no" />
          </div>
        </div>
      </section>

      {/* Deadly row — photos only */}
      <section className="mkt-section mkt-section--tight" aria-label="Mortales">
        <div className="mkt-deadly-photos" role="list">
          {DEADLY.map((s) => {
            const slug = scientificNameToSlug(s.taxon)
            return (
              <Link
                key={s.taxon}
                to={`/enciclopedia/${slug}`}
                className="mkt-deadly-card"
                role="listitem"
              >
                <span className="mkt-deadly-card__photo">
                  <SpeciesImage
                    scientificName={s.taxon}
                    slug={slug}
                    variant="card"
                    riskLevel="deadly"
                    alt={s.name}
                    aspectRatio="4/5"
                    priority={s.taxon === 'Amanita phalloides'}
                    preferCatalog={false}
                  />
                </span>
                <span className="mkt-deadly-card__meta">
                  <span className="mkt-deadly-card__badge">Mortal</span>
                  <strong>{s.name}</strong>
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* One-line safety, no essays */}
      <p className="mkt-safety-line">
        Orientación de campo · no consumo · ante la duda, micólogo humano
      </p>
    </div>
  )
}
