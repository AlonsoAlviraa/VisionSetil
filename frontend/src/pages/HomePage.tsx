/**
 * Product home — conversion landing: value prop, safety trust,
 * identify CTA, waitlist temporada, Offline Pack Pro.
 */
import { Link } from 'react-router-dom'
import { DeviceFrame } from '../components/marketing/DeviceFrame'
import { SetadleBoardMock } from '../components/marketing/SetadleBoardMock'
import { LearnGallery } from '../components/marketing/LearnGallery'
import { SpeciesImage } from '../components/SpeciesImage'
import { WaitlistTemporada } from '../components/WaitlistTemporada'
import { ProPlanBanner } from '../components/ProPlanBanner'
import { scientificNameToSlug } from '../lib/slug'
import { FREE_IDENTIFY_PER_DAY } from '../lib/entitlements'

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
      {/* Hero — value prop + conversion CTAs */}
      <section className="mkt-hero mkt-mesh mkt-hero--compact" aria-label="Presentación">
        <div className="mkt-hero__copy">
          <p className="mkt-kicker">VisionSetil · España · Soria · CyL</p>
          <h1 className="mkt-h1">
            Setas con
            <br />
            <em>criterio.</em>
          </h1>
          <p className="mkt-lead mkt-lead--home">
            Identificación con honestidad de modelo, enciclopedia y mapa de cotos.
            Orientación de campo — nunca permiso de consumo.
          </p>
          <div className="mkt-cta-row">
            <Link to="/identificar" className="mkt-btn mkt-btn--primary" data-testid="home-cta-identify">
              Identificar
            </Link>
            <Link to="/offline" className="mkt-btn mkt-btn--amber" data-testid="home-cta-offline">
              Pack offline Pro
            </Link>
            <Link to="/enciclopedia" className="mkt-btn mkt-btn--ghost">
              Enciclopedia
            </Link>
            <Link to="/mapa" className="mkt-btn mkt-btn--ghost">
              Cotos y mapa
            </Link>
          </div>
          <div className="mkt-hero__stats">
            <div className="mkt-hero__stat">
              <strong data-testid="home-species-count">{HOME_CATALOG_COUNT}</strong>
              <span>Taxones</span>
            </div>
            <div className="mkt-hero__stat">
              <strong>{FREE_IDENTIFY_PER_DAY}</strong>
              <span>ID Free/día</span>
            </div>
            <div className="mkt-hero__stat">
              <strong>Pro</strong>
              <span>Offline campo</span>
            </div>
          </div>
        </div>
        <div className="mkt-hero__visual">
          <DeviceFrame label="Setadle">
            <SetadleBoardMock compact caption="Diario · colores" />
          </DeviceFrame>
        </div>
      </section>

      {/* Trust strip */}
      <section className="mkt-trust" aria-label="Confianza y seguridad">
        <ul className="mkt-trust__list">
          <li>
            <strong>Open-set</strong>
            <span>Rechaza lo desconocido en vez de inventar</span>
          </li>
          <li>
            <strong>Mortales visibles</strong>
            <span>Banderas de riesgo en fichas y resultados</span>
          </li>
          <li>
            <strong>Cotos oficiales</strong>
            <span>Enlaces a MicologíaCyL / MicoAragón</span>
          </li>
          <li>
            <strong>Sin permiso de consumo</strong>
            <span>Solo orientación; micólogo humano ante la duda</span>
          </li>
        </ul>
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

      {/* Freemium packaging */}
      <section className="mkt-section mkt-section--tight" aria-label="Free y Pro">
        <ProPlanBanner showTable />
      </section>

      {/* Waitlist temporada */}
      <section className="mkt-section mkt-section--tight" aria-label="Waitlist temporada">
        <WaitlistTemporada source="home" />
      </section>

      {/* Gallery / mini-video flashcards */}
      <section className="mkt-section mkt-section--tight" aria-label="Galería">
        <LearnGallery />
      </section>

      {/* Setadle — short + visual */}
      <section className="mkt-section mkt-section--tight" aria-label="Setadle">
        <div className="mkt-feature mkt-feature--dark mkt-feature--compact">
          <div>
            <h2 className="mkt-h2">Setadle</h2>
            <p className="mkt-lead">Juego diario Free. Modos extra e ilimitado en Pro.</p>
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

      {/* Offline Pro CTA */}
      <section className="mkt-section mkt-section--tight" aria-label="Offline Pro">
        <div className="mkt-feature mkt-feature--compact mkt-offline-cta">
          <div>
            <p className="mkt-kicker">Pro · Campo sin red</p>
            <h2 className="mkt-h2">Offline Pack</h2>
            <p className="mkt-lead">
              Fichas y fotos de estudio para temporada y prioritarias T0/T1. No identifica
              offline ni autoriza consumo.
            </p>
            <div className="mkt-cta-row">
              <Link to="/offline" className="mkt-btn mkt-btn--primary">
                Ver pack Pro
              </Link>
              <Link to="/educacion" className="mkt-btn mkt-btn--ghost">
                Educación de seguridad
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* One-line safety, no essays */}
      <p className="mkt-safety-line">
        Orientación de campo · no consumo · ante la duda, micólogo humano
      </p>
    </div>
  )
}
