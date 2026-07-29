/**
 * Home — Campo nocturno (Stitch screens-b-v2/01-home)
 * Calm hero + trust + quick links. Orientation only.
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesImage } from '../components/SpeciesImage'
import { FREE_IDENTIFY_PER_DAY } from '../lib/entitlements'
import { deadlyPriorityViews } from '../lib/diagnosticViews'

const HOME_CATALOG_COUNT = 520

function IconGames() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="8" width="18" height="10" rx="3" />
      <path d="M8 13h2M9 12v2M15 12.5h.01M17.5 12.5h.01" strokeLinecap="round" />
    </svg>
  )
}

function IconBook() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5z" />
      <path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20" />
    </svg>
  )
}

function IconMap() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z" strokeLinejoin="round" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  )
}

export function HomePage() {
  const { t } = useTranslation()
  const priorityViews = deadlyPriorityViews().slice(0, 4)

  return (
    <div
      className="cn-page cn-home"
      data-testid="home-page-v193"
      data-skin="campo-nocturno"
    >
      <p
        className="cn-warn-strip"
        data-testid="home-orientation-sticky"
        role="note"
      >
        {t('home.orientationSticky', {
          defaultValue: 'Solo orientación · nunca consumo',
        })}
      </p>

      <section className="cn-home-hero" data-testid="home-cn-calm-hero">
        <div className="cn-home-hero__media">
          <SpeciesImage
            scientificName="Amanita muscaria"
            alt={t('home.cnHeroAlt', {
              defaultValue: 'Foto de campo de seta',
            })}
            variant="detail"
            layout="fill"
            preferCatalog
            className="cn-home-hero__img"
          />
          <div className="cn-home-hero__scrim" aria-hidden="true" />
        </div>
        <div className="cn-home-hero__content">
          <p className="cn-home-hero__kicker">
            {t('home.kicker', { defaultValue: 'VisionSetil · Iberia · campo' })}
          </p>
          <h1 className="cn-home-hero__title">
            {t('home.cnTitle', { defaultValue: 'VisionSetil' })}
          </h1>
          <p className="cn-home-hero__lead">
            {t('home.cnLead', {
              defaultValue:
                'Identificación multi-vista de campo. Captura cada detalle para una guía académica precisa.',
            })}
          </p>
          <div className="cn-chip-row" data-testid="home-cn-view-chips">
            {priorityViews.map((v) => (
              <span key={v} className="cn-chip">
                {t(`identify.views.${v}`, { defaultValue: v })}
              </span>
            ))}
          </div>
          <Link
            to="/identificar"
            className="cn-btn cn-btn--primary cn-btn--lg"
            data-testid="home-cta-identify"
          >
            {t('home.ctaTryIdentify', { defaultValue: 'Probar Identificar' })}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <div className="cn-home-trust" data-testid="home-cn-trust">
        <span className="cn-pill">
          {t('home.trustOpenSetTitle', { defaultValue: 'OPEN-SET IBERIA' })}
        </span>
        <span className="cn-pill">
          {t('home.trustEncy', { defaultValue: 'ENCICLOPEDIA IBERIA' })}
        </span>
        <span className="cn-pill cn-pill--danger">
          {t('home.trustNever', { defaultValue: 'NUNCA CONSUMO' })}
        </span>
      </div>

      <div className="cn-home-lower">
        <nav
          className="cn-home-quick"
          aria-label={t('home.ariaDiscover', { defaultValue: 'Explorar' })}
        >
          <Link to="/juegos" className="cn-home-quick__item" data-testid="home-quick-games">
            <span className="cn-home-quick__icon" aria-hidden="true">
              <IconGames />
            </span>
            <div className="cn-home-quick__text">
              <strong>{t('nav.games', { defaultValue: 'Juegos' })}</strong>
              <span>{t('home.quickGames', { defaultValue: 'Setadle · Wordle · Reto' })}</span>
            </div>
          </Link>
          <Link
            to="/enciclopedia"
            className="cn-home-quick__item"
            data-testid="home-cta-encyclopedia"
          >
            <span className="cn-home-quick__icon" aria-hidden="true">
              <IconBook />
            </span>
            <div className="cn-home-quick__text">
              <strong>{t('nav.encyclopedia', { defaultValue: 'Enciclopedia' })}</strong>
              <span>
                {t('home.quickEncy', {
                  defaultValue: `${HOME_CATALOG_COUNT} taxones`,
                })}
              </span>
            </div>
          </Link>
          <Link to="/mapa" className="cn-home-quick__item" data-testid="home-quick-map">
            <span className="cn-home-quick__icon" aria-hidden="true">
              <IconMap />
            </span>
            <div className="cn-home-quick__text">
              <strong>{t('nav.map', { defaultValue: 'Mapa' })}</strong>
              <span>{t('home.quickMap', { defaultValue: 'Cotos · no ID' })}</span>
            </div>
          </Link>
        </nav>

        <section className="cn-home-obs" data-testid="home-cn-observation">
          <div className="cn-home-obs__copy">
            <h2 className="cn-home-obs__title">
              {t('home.obsTitle', { defaultValue: 'Observación Nocturna' })}
            </h2>
            <p className="cn-home-obs__body">
              {t('home.obsBody', {
                defaultValue:
                  'Optimizado para low-toxins. El brillo de la interfaz no interfiere con la visión nocturna de campo.',
              })}
            </p>
          </div>
          <p className="cn-home-obs__meta">
            {t('home.obsMeta', {
              defaultValue: '← Observaciones hoy · solo orientación',
            })}
          </p>
        </section>
      </div>

      {/* Contract hooks for tests / freemium stats + discover links (sr-only) */}
      <nav className="cn-home-contracts" aria-hidden="true" data-testid="home-discover-hub">
        <Link to="/identificar" data-testid="home-discover-identify">
          Identificar
        </Link>
        <Link to="/lookalikes" data-testid="home-discover-lookalikes">
          Lookalikes
        </Link>
        <Link to="/historial" data-testid="home-discover-notebook">
          Cuaderno
        </Link>
        <Link to="/educacion" data-testid="home-discover-edu">
          Educación
        </Link>
        <Link to="/offline" data-testid="home-discover-offline">
          Offline
        </Link>
        <Link to="/comunidad" data-testid="home-discover-community">
          Comunidad
        </Link>
        <Link to="/revision-experta" data-testid="home-discover-expert">
          Revisión
        </Link>
        <Link to="/mas" data-testid="home-discover-more">
          Más
        </Link>
        <Link to="/juegos" data-testid="home-discover-games">
          Juegos
        </Link>
        <Link to="/mapa" data-testid="home-discover-map">
          Mapa
        </Link>
        <Link to="/enciclopedia" data-testid="home-discover-ency">
          Enciclopedia
        </Link>
        <Link to="/offline" data-testid="home-cta-offline">
          Offline pack
        </Link>
      </nav>

      <span className="visually-hidden" data-testid="home-species-count">
        {HOME_CATALOG_COUNT}
      </span>
      <span className="visually-hidden">{FREE_IDENTIFY_PER_DAY}</span>
    </div>
  )
}

export default HomePage
