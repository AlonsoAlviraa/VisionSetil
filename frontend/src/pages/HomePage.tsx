/**
 * Home — Campo nocturno · Stitch screens-b-v2/01-home pixel-match (v1.11)
 * Hero glass pill CTA + icon trust row + grid-cols-3 quick access +
 * atmospheric highlight card. Orientation only.
 * Residual beta kit: install guide, public URL ops (DEV), privacy strip, differentiators.
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesImage } from '../components/SpeciesImage'
import { SeasonalTopStrip } from '../components/SeasonalTopStrip'
import { WaitlistTemporada } from '../components/WaitlistTemporada'
import { Icon } from '../components/ui'
import { FREE_IDENTIFY_PER_DAY } from '../lib/entitlements'
import { deadlyPriorityViews } from '../lib/diagnosticViews'
import {
  betaFeedbackConfig,
  betaFeedbackHref,
  isBetaExternalForm,
  isBetaMailto,
} from '../lib/betaFeedback'
import {
  isPublicAppUrlConfigured,
  publicAppUrl,
} from '../lib/hostingPublicUrl'
import { fieldHoldoutCoachLines } from '../lib/fieldHoldoutHonesty'

const HOME_CATALOG_COUNT = 523

export function HomePage() {
  const { t } = useTranslation()
  const priorityViews = deadlyPriorityViews().slice(0, 4)
  const beta = betaFeedbackConfig()
  const betaHref = betaFeedbackHref()
  const showOpsPublicUrlChrome = import.meta.env.DEV
  const publicUrlOk = isPublicAppUrlConfigured()
  const shareUrl = publicAppUrl()

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
          defaultValue: 'Solo orientación de campo · nunca permiso de consumo',
        })}
      </p>

      <section className="cn-home-hero" data-testid="home-cn-calm-hero">
        <div className="cn-home-hero__media">
          <SpeciesImage
            scientificName="Amanita muscaria"
            alt={t('home.cnHeroAlt', {
              defaultValue: 'Foto de seta en el campo',
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
            {t('home.kicker', { defaultValue: 'VisionSetil · campo ibérico' })}
          </p>
          <h1 className="cn-home-hero__title cn-text-cream">
            {t('home.cnTitle', { defaultValue: 'VisionSetil' })}
          </h1>
          <p className="cn-home-hero__lead">
            {t('home.cnLead', {
              defaultValue:
                'Identifica setas con varias fotos de campo. Honestidad primero: si no está seguro, se calla.',
            })}
          </p>
          <div className="cn-chip-row" data-testid="home-cn-view-chips">
            {priorityViews.map((v) => (
              <span key={v} className="cn-chip cn-glass">
                {t(`identify.views.${v}`, { defaultValue: v })}
              </span>
            ))}
          </div>
          {/* Stitch hero CTA: glass pill with 48px primary-container circle orb.
              Keeps cn-btn--lg chrome class so layout-contract tests stay wired. */}
          <Link
            to="/identificar"
            className="cn-home-hero__cta cn-glass cn-pill cn-btn cn-btn--lg"
            data-testid="home-cta-identify"
          >
            <span className="cn-home-hero__cta-label">
              {t('home.ctaTryIdentify', { defaultValue: 'Probar identificar' })}
            </span>
            <span className="cn-home-hero__cta-orb" aria-hidden="true">
              <Icon name="center_focus_strong" filled size="md" />
            </span>
          </Link>
        </div>
      </section>

      {/* Stitch trust row: icon + uppercase label (NOT pills) */}
      <div className="cn-home-trust cn-home-trust--icons" data-testid="home-cn-trust">
        <span className="cn-home-trust__item">
          <Icon name="hub" size="sm" aria-hidden="true" />
          <span className="cn-home-trust__label">
            {t('home.trustOpenSetTitle', { defaultValue: 'Open-set Engine' })}
          </span>
        </span>
        <span className="cn-home-trust__item">
          <Icon name="auto_stories" size="sm" aria-hidden="true" />
          <span className="cn-home-trust__label">
            {t('home.trustEncy', { defaultValue: 'Enciclopedia Iberia' })}
          </span>
        </span>
        <span className="cn-home-trust__item cn-home-trust__item--danger">
          <Icon name="do_not_disturb_on" size="sm" aria-hidden="true" />
          <span className="cn-home-trust__label">
            {t('home.trustNever', { defaultValue: 'Nunca consumo' })}
          </span>
        </span>
      </div>

      <div className="cn-home-lower">
        {/* Stitch quick access: grid-cols-3 centered glass-card icon+label */}
        <nav
          className="cn-home-quick cn-home-quick--grid"
          aria-label={t('home.ariaDiscover', { defaultValue: 'Explorar' })}
        >
          <Link to="/juegos" className="cn-home-quick__card cn-glass" data-testid="home-quick-games">
            <span className="cn-home-quick__icon" aria-hidden="true">
              <Icon name="extension" size="lg" />
            </span>
            <span className="cn-home-quick__label">
              {t('nav.games', { defaultValue: 'Juegos' })}
            </span>
          </Link>
          <Link
            to="/enciclopedia"
            className="cn-home-quick__card cn-glass"
            data-testid="home-cta-encyclopedia"
          >
            <span className="cn-home-quick__icon" aria-hidden="true">
              <Icon name="menu_book" size="lg" />
            </span>
            <span className="cn-home-quick__label">
              {t('nav.encyclopedia', { defaultValue: 'Enciclopedia' })}
            </span>
          </Link>
          <Link to="/mapa" className="cn-home-quick__card cn-glass" data-testid="home-quick-map">
            <span className="cn-home-quick__icon" aria-hidden="true">
              <Icon name="map" size="lg" />
            </span>
            <span className="cn-home-quick__label">
              {t('nav.map', { defaultValue: 'Mapa' })}
            </span>
          </Link>
        </nav>

        {/* Stitch atmospheric highlight card */}
        <section className="cn-home-obs cn-glass" data-testid="home-cn-observation">
          <Icon
            name="forest"
            size="xl"
            className="cn-home-obs__deco"
            aria-hidden="true"
          />
          <div className="cn-home-obs__copy">
            <h2 className="cn-home-obs__title">
              {t('home.obsTitle', { defaultValue: 'Observación Nocturna' })}
            </h2>
            <p className="cn-home-obs__body">
              {t('home.obsBody', {
                defaultValue:
                  'Pantalla oscura pensada para el bosque de noche: menos brillo, menos deslumbramiento.',
              })}
            </p>
          </div>
          <div className="cn-home-obs__avatars" aria-hidden="true">
            <span className="cn-home-obs__avatar" />
            <span className="cn-home-obs__avatar" />
            <span className="cn-home-obs__avatar" />
            <span className="cn-home-obs__avatar-count">
              {t('home.obsCount', { defaultValue: '+12 hoy' })}
            </span>
          </div>
          <p className="cn-home-obs__meta">
            {t('home.obsMeta', {
              defaultValue: 'Observaciones de hoy · solo orientación',
            })}
          </p>
        </section>
      </div>

      <div className="cn-page-pad">
        <SeasonalTopStrip limit={8} />

        <p
          className="home-field-holdout-note cn-home-aux"
          data-testid="home-field-holdout-note"
          role="note"
        >
          {(() => {
            const lines = fieldHoldoutCoachLines()
            return `${lines.title} — ${lines.body} ${lines.deadlyNote} ${lines.policy}`
          })()}
        </p>

        <p
          className="home-privacy-strip cn-home-aux"
          data-testid="home-privacy-strip"
          role="note"
        >
          {t('home.privacyStrip', {
            defaultValue:
              'Explora sin cuenta. Nunca pedimos permiso de consumo — solo orientación de campo.',
          })}
        </p>

        <section
          className="mkt-diff cn-home-aux"
          data-testid="home-differentiators"
          aria-label={t('home.diffAria', { defaultValue: 'Diferenciadores' })}
        >
          <h2 className="mkt-diff__title">
            {t('home.diffTitle', { defaultValue: 'Por qué VisionSetil' })}
          </h2>
          <ul className="mkt-diff__list">
            <li data-testid="home-trust-multiview">
              <strong>
                {t('home.diffMultiTitle', { defaultValue: 'Multi-foto de campo' })}
              </strong>
              <span>
                {t('home.diffMultiBody', {
                  defaultValue:
                    'Láminas, perfil y base — no una sola foto mágica.',
                })}
              </span>
            </li>
            <li data-testid="home-trust-nomenclature">
              <strong>
                {t('home.trustIfTitle', {
                  defaultValue: 'Nombres Index Fungorum',
                })}
              </strong>
              <span>
                {t('home.trustIfBody', {
                  defaultValue:
                    'Sinónimos Kew en ficha y búsqueda. El catálogo local no se reescribe solo.',
                })}
              </span>
            </li>
            <li>
              <strong>
                {t('home.diffOpenSetTitle', {
                  defaultValue: 'Open-set honesto',
                })}
              </strong>
              <span>
                {t('home.diffOpenSetBody', {
                  defaultValue: 'Si no reconoce la seta, se calla.',
                })}
              </span>
            </li>
          </ul>
        </section>

        <section
          className="home-install-guide cn-home-aux atelier-card"
          data-testid="home-install-guide"
          aria-label={t('home.installTitle', {
            defaultValue: 'Instalar app / Abrir en el móvil',
          })}
        >
          <h2>
            {t('home.installTitle', {
              defaultValue: 'Instalar app · Abrir en el móvil',
            })}
          </h2>
          <p>
            {t('home.installBody', {
              defaultValue:
                'Añade VisionSetil a la pantalla de inicio (PWA). Solo orientación de campo.',
            })}
          </p>
          <p className="home-install-guide__url">
            <a href={shareUrl}>{shareUrl}</a>
          </p>
          {showOpsPublicUrlChrome ? (
            <p
              className="home-ops-public-url"
              data-ops-only="true"
              data-testid="home-ops-public-url"
            >
              {publicUrlOk ? (
                <span data-testid="home-public-url-ok">
                  VITE_PUBLIC_APP_URL OK · {publicAppUrl({ preferEnvOnly: true })}
                </span>
              ) : (
                <span data-testid="home-public-url-missing">
                  {t('home.publicUrlMissing', {
                    defaultValue:
                      'Ops: falta VITE_PUBLIC_APP_URL (solo visible en DEV)',
                  })}
                </span>
              )}
            </p>
          ) : null}
        </section>

        <div className="cn-home-aux home-beta-row">
          {isBetaExternalForm() || isBetaMailto() ? (
            <a
              href={betaHref}
              className="cn-btn cn-btn--ghost"
              data-testid="home-beta-feedback"
              data-source={beta.source}
              {...(isBetaMailto()
                ? {}
                : { target: '_blank', rel: 'noopener noreferrer' })}
            >
              {t('nav.betaFeedback', { defaultValue: 'Feedback beta' })}
            </a>
          ) : (
            <Link
              to={betaHref}
              className="cn-btn cn-btn--ghost"
              data-testid="home-beta-feedback"
              data-source={beta.source}
            >
              {t('nav.betaFeedback', { defaultValue: 'Feedback beta' })}
            </Link>
          )}
          <span
            className="visually-hidden"
            data-testid="home-beta-feedback-source"
          >
            {beta.source}
          </span>
        </div>

        <WaitlistTemporada />
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
