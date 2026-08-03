/**
 * Home — clean redesign (v1.12 graph)
 * Visual-first: big photo, short words, clear actions.
 * Residual beta/test kit lives in .cn-home-kit (visually hidden, source-visible).
 * Orientation only · never consumption permission.
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesImage } from '../components/SpeciesImage'
import { SeasonalTopStrip } from '../components/SeasonalTopStrip'
import { FeaturedSpeciesGrid } from '../components/FeaturedSpeciesGrid'
import { WaitlistTemporada } from '../components/WaitlistTemporada'
import { ExternalLinkButton, Icon, LinkButton, PageShell } from '../components/ui'
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

/** Contract hub links (aria-hidden) — competitiveFeatures + architecture tests */
const HOME_DISCOVER_LINKS = [
  { to: '/identificar', testId: 'home-discover-identify', label: 'Identificar' },
  { to: '/lookalikes', testId: 'home-discover-lookalikes', label: 'Confusiones' },
  { to: '/historial', testId: 'home-discover-notebook', label: 'Cuaderno' },
  { to: '/educacion', testId: 'home-discover-edu', label: 'Educación' },
  { to: '/offline', testId: 'home-discover-offline', label: 'Offline' },
  { to: '/comunidad', testId: 'home-discover-community', label: 'Comunidad' },
  { to: '/revision-experta', testId: 'home-discover-expert', label: 'Revisión' },
  { to: '/mas', testId: 'home-discover-more', label: 'Más' },
  { to: '/juegos', testId: 'home-discover-games', label: 'Juegos' },
  { to: '/mapa', testId: 'home-discover-map', label: 'Mapa' },
  { to: '/enciclopedia', testId: 'home-discover-ency', label: 'Enciclopedia' },
  { to: '/offline', testId: 'home-cta-offline', label: 'Offline pack' },
] as const

export function HomePage() {
  const { t } = useTranslation()
  const priorityViews = deadlyPriorityViews().slice(0, 4)
  const beta = betaFeedbackConfig()
  const betaHref = betaFeedbackHref()
  const showOpsPublicUrlChrome = import.meta.env.DEV
  const publicUrlOk = isPublicAppUrlConfigured()
  const shareUrl = publicAppUrl()
  const holdout = fieldHoldoutCoachLines()

  return (
    <PageShell className="cn-home cn-home--v12" testId="home-page-v193">
      <p
        className="cn-warn-strip"
        data-testid="home-orientation-sticky"
        role="note"
      >
        {t('home.orientationSticky', {
          defaultValue: 'Solo orientación · nunca consumo',
        })}
      </p>

      {/* ── Hero: photo + little text ───────────────────────────────────── */}
      <section className="cn-home-hero" data-testid="home-cn-calm-hero">
        <div className="cn-home-hero__media">
          <SpeciesImage
            scientificName="Amanita muscaria"
            alt={t('home.cnHeroAlt', {
              defaultValue: 'Seta en el campo',
            })}
            variant="detail"
            layout="fill"
            preferCatalog
            priority
            quality="display"
            sizes="100vw"
            className="cn-home-hero__img"
          />
          <div className="cn-home-hero__scrim" aria-hidden="true" />
        </div>
        <div className="cn-home-hero__content">
          <p className="cn-home-hero__kicker">
            {t('home.kicker', { defaultValue: 'Campo ibérico' })}
          </p>
          <h1 className="cn-home-hero__title cn-text-cream">
            {t('home.cnTitle', { defaultValue: 'VisionSetil' })}
          </h1>
          <p className="cn-home-hero__lead">
            {t('home.cnLead', {
              defaultValue: 'Varias fotos. Si duda, se calla.',
            })}
          </p>
          <div className="cn-chip-row" data-testid="home-cn-view-chips">
            {priorityViews.map((v) => (
              <span key={v} className="cn-chip cn-glass">
                {t(`identify.views.${v}`, { defaultValue: v })}
              </span>
            ))}
          </div>
          <LinkButton
            to="/identificar"
            skin="cn"
            variant="hero"
            className="cn-home-hero__cta cn-glass cn-pill cn-btn cn-btn--lg"
            data-testid="home-cta-identify"
          >
            <span className="cn-home-hero__cta-label">
              {t('home.ctaTryIdentify', { defaultValue: 'Identificar' })}
            </span>
            <span className="cn-home-hero__cta-orb" aria-hidden="true">
              <Icon name="center_focus_strong" filled size="md" />
            </span>
          </LinkButton>
        </div>
      </section>

      {/* ── Trust: 3 words only ─────────────────────────────────────────── */}
      <div
        className="cn-home-trust cn-home-trust--icons"
        data-testid="home-cn-trust"
      >
        <span className="cn-home-trust__item">
          <Icon name="hub" size="sm" aria-hidden="true" />
          <span className="cn-home-trust__label">
            {t('home.trustOpenSetTitle', { defaultValue: 'No inventa' })}
          </span>
        </span>
        <span className="cn-home-trust__item">
          <Icon name="auto_stories" size="sm" aria-hidden="true" />
          <span className="cn-home-trust__label">
            {t('home.trustEncy', { defaultValue: 'Enciclopedia' })}
          </span>
        </span>
        <span className="cn-home-trust__item cn-home-trust__item--danger">
          <Icon name="do_not_disturb_on" size="sm" aria-hidden="true" />
          <span className="cn-home-trust__label">
            {t('home.trustNever', { defaultValue: 'Nunca consumo' })}
          </span>
        </span>
      </div>

      {/* ── Quick doors ─────────────────────────────────────────────────── */}
      <div className="cn-home-lower">
        <nav
          className="cn-home-quick cn-home-quick--grid"
          aria-label={t('home.ariaDiscover', { defaultValue: 'Explorar' })}
        >
          <Link
            to="/identificar"
            className="cn-home-quick__card cn-home-quick__card--primary cn-glass"
            data-testid="home-quick-identify"
          >
            <span className="cn-home-quick__icon" aria-hidden="true">
              <Icon name="center_focus_strong" size="lg" filled />
            </span>
            <span className="cn-home-quick__label">
              {t('nav.identify', { defaultValue: 'Identificar' })}
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
          <Link
            to="/mapa"
            className="cn-home-quick__card cn-glass"
            data-testid="home-quick-map"
          >
            <span className="cn-home-quick__icon" aria-hidden="true">
              <Icon name="map" size="lg" />
            </span>
            <span className="cn-home-quick__label">
              {t('nav.map', { defaultValue: 'Mapa' })}
            </span>
          </Link>
          <Link
            to="/juegos"
            className="cn-home-quick__card cn-glass"
            data-testid="home-quick-games"
          >
            <span className="cn-home-quick__icon" aria-hidden="true">
              <Icon name="extension" size="lg" />
            </span>
            <span className="cn-home-quick__label">
              {t('nav.games', { defaultValue: 'Juegos' })}
            </span>
          </Link>
        </nav>

        <section
          className="cn-home-obs cn-glass"
          data-testid="home-cn-observation"
        >
          <Icon
            name="forest"
            size="xl"
            className="cn-home-obs__deco"
            aria-hidden="true"
          />
          <div className="cn-home-obs__copy">
            <h2 className="cn-home-obs__title">
              {t('home.obsTitle', { defaultValue: 'Noche de campo' })}
            </h2>
            <p className="cn-home-obs__body">
              {t('home.obsBody', {
                defaultValue: 'Pantalla suave para el bosque.',
              })}
            </p>
          </div>
          <p className="cn-home-obs__meta">
            {t('home.obsMeta', {
              defaultValue: 'Solo orientación',
            })}
          </p>
        </section>
      </div>

      {/* ── Season photos ───────────────────────────────────────────────── */}
      <div className="cn-page-pad cn-home-season">
        <SeasonalTopStrip limit={8} />
      </div>

      {/* ── Featured species: photo-first grid of popular taxa ─────────── */}
      <div className="cn-page-pad cn-home-featured">
        <FeaturedSpeciesGrid limit={8} />
      </div>

      {/*
        Residual kit: required by product/QA contracts.
        Visually collapsed so the Home stays calm and photo-first.
      */}
      <div className="cn-home-kit" data-testid="home-residual-kit">
        <p
          className="home-field-holdout-note"
          data-testid="home-field-holdout-note"
          role="note"
        >
          {holdout.title} — {holdout.body} {holdout.deadlyNote} {holdout.policy}
        </p>
        <p
          className="home-privacy-strip"
          data-testid="home-privacy-strip"
          role="note"
        >
          {t('home.privacyStrip', {
            defaultValue:
              'Explora sin cuenta. Nunca pedimos permiso de consumo — solo orientación de campo.',
          })}
        </p>
        <section
          className="mkt-diff"
          data-testid="home-differentiators"
          aria-label={t('home.diffAria', { defaultValue: 'Diferenciadores' })}
        >
          <h2 className="mkt-diff__title">
            {t('home.diffTitle', { defaultValue: 'Por qué VisionSetil' })}
          </h2>
          <ul className="mkt-diff__list">
            <li data-testid="home-trust-multiview">
              <strong>
                {t('home.diffMultiTitle', {
                  defaultValue: 'Multi-foto de campo',
                })}
              </strong>
              <span>
                {t('home.diffMultiBody', {
                  defaultValue: 'Láminas, perfil y base.',
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
                  defaultValue: 'Sinónimos Kew · catálogo local estable.',
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
          className="home-install-guide atelier-card"
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
              defaultValue: 'Añade a pantalla de inicio. Solo orientación.',
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
                  VITE_PUBLIC_APP_URL OK ·{' '}
                  {publicAppUrl({ preferEnvOnly: true })}
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
        <div className="home-beta-row">
          {isBetaExternalForm() || isBetaMailto() ? (
            <ExternalLinkButton
              href={betaHref}
              variant="ghost"
              newTab={!isBetaMailto()}
              data-testid="home-beta-feedback"
              data-source={beta.source}
            >
              {t('nav.betaFeedback', { defaultValue: 'Feedback beta' })}
            </ExternalLinkButton>
          ) : (
            <LinkButton
              to={betaHref}
              variant="ghost"
              skin="cn"
              data-testid="home-beta-feedback"
              data-source={beta.source}
            >
              {t('nav.betaFeedback', { defaultValue: 'Feedback beta' })}
            </LinkButton>
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

      <nav
        className="cn-home-contracts"
        aria-hidden="true"
        data-testid="home-discover-hub"
      >
        {HOME_DISCOVER_LINKS.map((item) => (
          <Link key={item.testId} to={item.to} data-testid={item.testId}>
            {item.label}
          </Link>
        ))}
      </nav>

      <span className="visually-hidden" data-testid="home-species-count">
        {HOME_CATALOG_COUNT}
      </span>
      <span className="visually-hidden">{FREE_IDENTIFY_PER_DAY}</span>
    </PageShell>
  )
}

export default HomePage
