/**
 * Product home — conversion landing: value prop, safety trust,
 * identify CTA, waitlist temporada, Offline Pack Pro.
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DeviceFrame } from '../components/marketing/DeviceFrame'
import { SetadleBoardMock } from '../components/marketing/SetadleBoardMock'
import { LearnGallery } from '../components/marketing/LearnGallery'
import { SpeciesImage } from '../components/SpeciesImage'
import { WaitlistTemporada } from '../components/WaitlistTemporada'
import {
  betaFeedbackConfig,
  betaFeedbackHref,
  isBetaExternalForm,
  isBetaMailto,
} from '../lib/betaFeedback'
import {
  isPublicAppUrlConfigured,
  publicAppUrl,
  publicAppUrlFromEnv,
} from '../lib/hostingPublicUrl'
import { ProPlanBanner } from '../components/ProPlanBanner'
import { scientificNameToSlug } from '../lib/slug'
import { FREE_IDENTIFY_PER_DAY } from '../lib/entitlements'
import { deadlyPriorityViews } from '../lib/diagnosticViews'
import { fieldHoldoutCoachLines } from '../lib/fieldHoldoutHonesty'

const HOME_CATALOG_COUNT = 520

const DEADLY = [
  { taxon: 'Amanita phalloides', nameKey: 'home.nameDeathCap' },
  { taxon: 'Amanita virosa', nameKey: 'home.nameDestroyingAngel' },
  { taxon: 'Galerina marginata', nameKey: 'home.nameGalerina' },
  { taxon: 'Cortinarius rubellus', nameKey: 'home.nameWebcap' },
  { taxon: 'Lepiota brunneoincarnata', nameKey: 'home.nameLepiota' },
] as const

const ICON_STRIP = [
  { taxon: 'Amanita muscaria', nameKey: 'home.nameFlyAgaric' },
  { taxon: 'Boletus edulis', nameKey: 'home.namePorcini' },
  { taxon: 'Cantharellus cibarius', nameKey: 'home.nameChanterelle' },
  { taxon: 'Lactarius deliciosus', nameKey: 'home.nameMilkcap' },
  { taxon: 'Macrolepiota procera', nameKey: 'home.nameParasol' },
  { taxon: 'Amanita caesarea', nameKey: 'home.nameCaesar' },
] as const

export function HomePage() {
  const { t, i18n } = useTranslation()
  // Ops-only chrome: never show env-key jargon to cohort testers in production builds.
  const showOpsPublicUrlChrome = Boolean(import.meta.env.DEV)
  const publicUrlConfigured = isPublicAppUrlConfigured()
  const shareableUrl = publicAppUrl()
  const envPublicUrl = publicAppUrlFromEnv()
  const priorityViews = deadlyPriorityViews().slice(0, 3)
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const fieldHoldoutCopy = fieldHoldoutCoachLines(locale)

  return (
    <div className="home-page home-mkt home-mkt--tight home-mkt--v193 home-mkt--v195" data-testid="home-page-v193">
      {/* Sticky orientation strip — density polish · never edible green light */}
      <p
        className="home-orientation-sticky"
        data-testid="home-orientation-sticky"
        role="note"
      >
        {t('home.orientationSticky', {
          defaultValue:
            'Solo orientación de campo · open-set + multi-vista · nunca permiso de consumo · nomenclatura Kew no sobrescribe el catálogo',
        })}
      </p>

      {/* Hero — value prop + conversion CTAs */}
      <section
        className="mkt-hero mkt-mesh mkt-hero--compact"
        aria-label={t('home.ariaHero', { defaultValue: 'Presentación' })}
      >
        <div className="mkt-hero__copy">
          <p className="mkt-kicker">
            {t('home.kicker', { defaultValue: 'VisionSetil · España · Soria · CyL' })}
          </p>
          <h1 className="mkt-h1">
            {t('home.heroTitleLine1', { defaultValue: 'Setas con' })}
            <br />
            <em>{t('home.heroTitleEm', { defaultValue: 'criterio.' })}</em>
          </h1>
          <p className="mkt-lead mkt-lead--home">
            {t('home.heroLead', {
              defaultValue:
                'Identificación con honestidad de modelo, enciclopedia y mapa de cotos. Orientación de campo — nunca permiso de consumo.',
            })}
          </p>
          <div className="mkt-cta-row">
            <Link
              to="/identificar"
              className="mkt-btn mkt-btn--primary"
              data-testid="home-cta-identify"
            >
              {t('home.ctaTryIdentify', {
                defaultValue: 'Probar Identificar',
              })}
            </Link>
            <Link
              to="/enciclopedia"
              className="mkt-btn mkt-btn--ghost"
              data-testid="home-cta-encyclopedia"
            >
              {t('home.ctaEncyclopedia', { defaultValue: 'Enciclopedia' })}
            </Link>
            <Link to="/mapa" className="mkt-btn mkt-btn--ghost">
              {t('home.ctaMap', { defaultValue: 'Cotos y mapa' })}
            </Link>
            <Link
              to="/offline"
              className="mkt-btn mkt-btn--amber"
              data-testid="home-cta-offline"
            >
              {t('home.ctaOffline', { defaultValue: 'Pack offline Pro' })}
            </Link>
          </div>
          <div className="mkt-hero__stats">
            <div className="mkt-hero__stat">
              <strong data-testid="home-species-count">{HOME_CATALOG_COUNT}</strong>
              <span>{t('home.statTaxa', { defaultValue: 'Taxones' })}</span>
            </div>
            <div className="mkt-hero__stat">
              <strong>{FREE_IDENTIFY_PER_DAY}</strong>
              <span>{t('home.statFreeId', { defaultValue: 'ID Free/día' })}</span>
            </div>
            <div className="mkt-hero__stat">
              <strong>Pro</strong>
              <span>{t('home.statOffline', { defaultValue: 'Offline campo' })}</span>
            </div>
          </div>
        </div>
        <div className="mkt-hero__visual">
          <DeviceFrame label="Setadle">
            <SetadleBoardMock
              compact
              caption={t('home.boardCaptionDaily', { defaultValue: 'Diario · colores' })}
            />
          </DeviceFrame>
        </div>
      </section>

      {/* Beta try-first feedback (GTM 30-day plan) */}
      <section
        className="mkt-beta-strip"
        aria-label={t('home.ariaBeta', { defaultValue: 'Beta' })}
        data-testid="home-beta-feedback"
      >
        <p className="mkt-beta-strip__text">
          <strong>
            {t('home.betaTitle', { defaultValue: 'Beta abierta a prueba' })}
          </strong>{' '}
          {t('home.betaBody', {
            defaultValue:
              'Estamos pidiendo feedback real de campo. Prueba Identificar o la enciclopedia y cuéntanos qué falla — orientación only, nunca permiso de consumo.',
          })}
          <span
            className="mkt-beta-strip__source"
            data-testid="home-beta-feedback-source"
            data-source={betaFeedbackConfig().source}
          >
            {' '}
            {betaFeedbackConfig().formConfigured
              ? t('home.betaFormReady', {
                  defaultValue: '(formulario externo configurado)',
                })
              : t('home.betaInAppForm', {
                  defaultValue: '(formulario en la app — /beta-feedback)',
                })}
          </span>
        </p>
        <div className="mkt-beta-strip__actions">
          <Link to="/identificar" className="mkt-btn mkt-btn--primary mkt-btn--sm">
            {t('home.betaTry', { defaultValue: 'Probar ahora' })}
          </Link>
          {isBetaExternalForm() || isBetaMailto() ? (
            <a
              href={betaFeedbackHref()}
              className="mkt-btn mkt-btn--ghost mkt-btn--sm"
              data-testid="home-beta-feedback-link"
              {...(isBetaMailto()
                ? {}
                : { target: '_blank', rel: 'noopener noreferrer' })}
            >
              {t('home.betaFeedback', { defaultValue: 'Enviar feedback' })}
            </a>
          ) : (
            <Link
              to={betaFeedbackHref()}
              className="mkt-btn mkt-btn--ghost mkt-btn--sm"
              data-testid="home-beta-feedback-link"
            >
              {t('home.betaFeedback', { defaultValue: 'Enviar feedback' })}
            </Link>
          )}
        </div>
        {showOpsPublicUrlChrome && !publicUrlConfigured ? (
          <p
            className="mkt-beta-strip__ops-warn"
            data-testid="home-public-url-missing"
            data-ops-only="dev"
            role="status"
          >
            {t('home.publicUrlMissing', {
              defaultValue:
                'Ops (dev): URL pública no configurada — invitaciones usan placeholder hasta rebuild. Fija la URL HTTPS pública o pasa appUrl explícito (docs/HOSTING_DEPLOY_BETA.md).',
            })}
          </p>
        ) : null}
        {showOpsPublicUrlChrome && publicUrlConfigured ? (
          <p
            className="mkt-beta-strip__ops-url"
            data-testid="home-public-url-configured"
            data-ops-only="dev"
            data-public-url={envPublicUrl}
          >
            {t('home.publicUrlReady', {
              defaultValue: 'Ops (dev) URL pública (invites):',
            })}{' '}
            <code>{shareableUrl}</code>
          </p>
        ) : null}
      </section>

      {/* Open on mobile / PWA install (orientation only — no store APK pitch) */}
      <section
        className="mkt-install-strip"
        aria-label={t('home.ariaInstall', {
          defaultValue: 'Abrir en el móvil e instalar',
        })}
        data-testid="home-install-guide"
      >
        <p className="mkt-install-strip__text">
          <strong>
            {t('home.installTitle', {
              defaultValue: 'Abrir en el móvil / Instalar app',
            })}
          </strong>{' '}
          {t('home.installBody', {
            defaultValue:
              'Es una web-app (PWA): no hace falta App Store ni APK. Solo orientación de campo — nunca permiso de consumo.',
          })}
        </p>
        <ul className="mkt-install-strip__steps">
          <li data-testid="home-install-ios">
            <strong>
              {t('home.installIosLabel', { defaultValue: 'iPhone / iPad' })}
            </strong>
            {': '}
            {t('home.installIos', {
              defaultValue:
                'Safari → Compartir → «Añadir a pantalla de inicio».',
            })}
          </li>
          <li data-testid="home-install-android">
            <strong>
              {t('home.installAndroidLabel', { defaultValue: 'Android' })}
            </strong>
            {': '}
            {t('home.installAndroid', {
              defaultValue:
                'Chrome → menú ⋮ → «Instalar app» o «Añadir a pantalla de inicio».',
            })}
          </li>
        </ul>
        <div className="mkt-install-strip__actions">
          <Link
            to="/offline"
            className="mkt-btn mkt-btn--ghost mkt-btn--sm"
            data-testid="home-install-offline"
          >
            {t('home.installOffline', {
              defaultValue: 'Pack offline (estudio)',
            })}
          </Link>
        </div>
      </section>

      {/* Privacy / no-account explore (Seek-like: private local learning) */}
      <section
        className="mkt-privacy"
        aria-label={t('home.ariaPrivacy', { defaultValue: 'Privacidad' })}
        data-testid="home-privacy-strip"
      >
        <p className="mkt-privacy__text">
          <strong>
            {t('home.privacyTitle', {
              defaultValue: 'Explora sin cuenta',
            })}
          </strong>{' '}
          {t('home.privacyBody', {
            defaultValue:
              'Enciclopedia, retos y Setadle funcionan en el navegador. El progreso de estudio se guarda solo en este dispositivo. Identificar no exige cuenta; publicar en comunidad sí. Nunca pedimos permiso de consumo a un modelo.',
          })}
        </p>
      </section>

      {/* Trust strip — safety pillars (readable cards, not a cramped pill) */}
      <section
        className="mkt-trust"
        aria-label={t('home.ariaTrust', { defaultValue: 'Confianza y seguridad' })}
      >
        <ul className="mkt-trust__list">
          <li className="mkt-trust__item">
            <span className="mkt-trust__icon" aria-hidden="true">
              ⊘
            </span>
            <strong>
              {t('home.trustOpenSetTitle', { defaultValue: 'Open-set' })}
            </strong>
            <span>
              {t('home.trustOpenSetBody', {
                defaultValue: 'Rechaza lo desconocido en vez de inventar',
              })}
            </span>
          </li>
          <li className="mkt-trust__item mkt-trust__item--risk">
            <span className="mkt-trust__icon" aria-hidden="true">
              ⚠
            </span>
            <strong>
              {t('home.trustDeadlyTitle', { defaultValue: 'Mortales visibles' })}
            </strong>
            <span>
              {t('home.trustDeadlyBody', {
                defaultValue: 'Banderas de riesgo en fichas y resultados',
              })}
            </span>
          </li>
          <li className="mkt-trust__item">
            <span className="mkt-trust__icon" aria-hidden="true">
              ⌖
            </span>
            <strong>
              {t('home.trustZonesTitle', { defaultValue: 'Cotos oficiales' })}
            </strong>
            <span>
              {t('home.trustZonesBody', {
                defaultValue: 'Enlaces a MicologíaCyL / MicoAragón',
              })}
            </span>
          </li>
          <li className="mkt-trust__item mkt-trust__item--policy">
            <span className="mkt-trust__icon" aria-hidden="true">
              ✕
            </span>
            <strong>
              {t('home.trustNoConsumeTitle', {
                defaultValue: 'Sin permiso de consumo',
              })}
            </strong>
            <span>
              {t('home.trustNoConsumeBody', {
                defaultValue: 'Solo orientación; micólogo humano ante la duda',
              })}
            </span>
          </li>
          <li className="mkt-trust__item" data-testid="home-trust-multiview">
            <span className="mkt-trust__icon" aria-hidden="true">
              📷
            </span>
            <strong>
              {t('home.trustMultiviewTitle', {
                defaultValue: 'Multi-vista que discrimina',
              })}
            </strong>
            <span>
              {t('home.trustMultiviewBody', {
                defaultValue:
                  'Láminas + perfil + base: más fotos sin esas vistas no bastan',
              })}
            </span>
          </li>
          <li className="mkt-trust__item" data-testid="home-trust-nomenclature">
            <span className="mkt-trust__icon" aria-hidden="true">
              ✎
            </span>
            <strong>
              {t('home.trustIfTitle', {
                defaultValue: 'Nombres Index Fungorum',
              })}
            </strong>
            <span>
              {t('home.trustIfBody', {
                defaultValue:
                  'Sinónimos Kew en ficha/búsqueda · SSOT local no se reescribe solo',
              })}
            </span>
          </li>
        </ul>
      </section>

      {/* Multi-view diagnostic coach (orientation only — never forage) */}
      <section
        className="mkt-multiview-strip"
        aria-label={t('home.ariaMultiview', {
          defaultValue: 'Multi-vista diagnóstica',
        })}
        data-testid="home-multiview-coach"
      >
        <p className="mkt-multiview-strip__text">
          <strong>
            {t('home.multiviewTitle', {
              defaultValue: 'Antes de Identificar: 3 vistas que importan',
            })}
          </strong>{' '}
          {t('home.multiviewBody', {
            defaultValue:
              'Para confusiones mortales prioriza láminas, perfil/pie y base (volva/anillo). Multi-foto sin ellas no es “más seguro”. Solo orientación — nunca consumo.',
          })}
        </p>
        <div
          className="mkt-multiview-strip__views lookalike-item__diag-views"
          data-testid="home-multiview-priority"
        >
          {priorityViews.map((view) => (
            <span
              key={view}
              className="lookalike-item__diag-badge lookalike-item__diag-badge--static"
              data-slot={view}
            >
              {t(`identify.views.${view}`, { defaultValue: view })}
            </span>
          ))}
        </div>
        <div
          className="mkt-field-holdout-note"
          data-testid="home-field-holdout-note"
          role="note"
        >
          <strong>{fieldHoldoutCopy.title}</strong>
          <span> {fieldHoldoutCopy.body}</span>
          <span className="mkt-field-holdout-note__deadly"> {fieldHoldoutCopy.deadlyNote}</span>
          <span className="mkt-field-holdout-note__policy"> {fieldHoldoutCopy.policy}</span>
        </div>
        <div className="mkt-multiview-strip__actions">
          <Link
            to="/identificar"
            className="mkt-btn mkt-btn--primary mkt-btn--sm"
            data-testid="home-multiview-cta-identify"
          >
            {t('home.ctaTryIdentify', { defaultValue: 'Probar Identificar' })}
          </Link>
          <Link
            to="/educacion"
            className="mkt-btn mkt-btn--ghost mkt-btn--sm"
            data-testid="home-multiview-cta-edu"
          >
            {t('home.multiviewLearn', { defaultValue: 'Por qué multi-vista' })}
          </Link>
        </div>
      </section>

      {/* Photos only — no marketing walls of text */}
      <div
        className="mkt-icon-strip"
        aria-label={t('home.ariaIconic', { defaultValue: 'Setas icónicas' })}
      >
        {ICON_STRIP.map((s) => {
          const slug = scientificNameToSlug(s.taxon)
          const name = t(s.nameKey, { defaultValue: s.taxon })
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
                  alt={name}
                  aspectRatio="1"
                  layout="fill"
                  priority={s.taxon === 'Amanita muscaria'}
                  preferCatalog={false}
                />
              </span>
              <span className="mkt-icon-strip__name">{name}</span>
            </Link>
          )
        })}
      </div>

      {/* Product discovery hub — learn · play · field (visual + functional) */}
      <section
        className="mkt-section mkt-section--tight mkt-discover"
        aria-label={t('home.ariaDiscover', { defaultValue: 'Explorar VisionSetil' })}
        data-testid="home-discover-hub"
      >
        <div className="mkt-discover__head">
          <h2 className="mkt-h2 mkt-h2--sm">
            {t('home.discoverTitle', { defaultValue: 'Explora con criterio' })}
          </h2>
          <p className="mkt-discover__lead">
            {t('home.discoverLead', {
              defaultValue:
                'Aprender, jugar y campo en un solo sitio. Solo orientación — nunca permiso de consumo.',
            })}
          </p>
        </div>
        <div className="mkt-discover__grid">
          <Link
            to="/identificar"
            className="mkt-discover-card mkt-discover-card--primary"
            data-testid="home-discover-identify"
          >
            <span className="mkt-discover-card__kicker">
              {t('home.discoverIdKicker', { defaultValue: 'Campo' })}
            </span>
            <strong className="mkt-discover-card__title">
              {t('home.discoverIdTitle', { defaultValue: 'Identificar multi-vista' })}
            </strong>
            <span className="mkt-discover-card__body">
              {t('home.discoverIdBody', {
                defaultValue: 'Láminas · perfil · base. Open-set honesto.',
              })}
            </span>
          </Link>
          <Link
            to="/enciclopedia"
            className="mkt-discover-card"
            data-testid="home-discover-ency"
          >
            <span className="mkt-discover-card__kicker">
              {t('home.discoverEncyKicker', { defaultValue: 'Estudio' })}
            </span>
            <strong className="mkt-discover-card__title">
              {t('home.discoverEncyTitle', { defaultValue: 'Enciclopedia' })}
            </strong>
            <span className="mkt-discover-card__body">
              {t('home.discoverEncyBody', {
                defaultValue: 'Filtros por láminas, poros y riesgo.',
              })}
            </span>
          </Link>
          <Link
            to="/historial"
            className="mkt-discover-card"
            data-testid="home-discover-notebook"
          >
            <span className="mkt-discover-card__kicker">
              {t('home.discoverNotebookKicker', { defaultValue: 'Campo' })}
            </span>
            <strong className="mkt-discover-card__title">
              {t('home.discoverNotebookTitle', {
                defaultValue: 'Cuaderno + pins',
              })}
            </strong>
            <span className="mkt-discover-card__body">
              {t('home.discoverNotebookBody', {
                defaultValue:
                  'Notas locales y pins GPS sin EXIF · no marketplace.',
              })}
            </span>
          </Link>
          <Link
            to="/lookalikes"
            className="mkt-discover-card"
            data-testid="home-discover-lookalikes"
          >
            <span className="mkt-discover-card__kicker">
              {t('home.discoverLookKicker', { defaultValue: 'Confusiones' })}
            </span>
            <strong className="mkt-discover-card__title">
              {t('home.discoverLookTitle', { defaultValue: 'Lookalike Studio' })}
            </strong>
            <span className="mkt-discover-card__body">
              {t('home.discoverLookBody', {
                defaultValue: 'Pares mortales y vistas críticas.',
              })}
            </span>
          </Link>
          <Link
            to="/setadle"
            className="mkt-discover-card mkt-discover-card--amber"
            data-testid="home-discover-setadle"
          >
            <span className="mkt-discover-card__kicker">
              {t('home.discoverPlayKicker', { defaultValue: 'Jugar' })}
            </span>
            <strong className="mkt-discover-card__title">
              {t('home.discoverPlayTitle', { defaultValue: 'Setadle & retos' })}
            </strong>
            <span className="mkt-discover-card__body">
              {t('home.discoverPlayBody', {
                defaultValue: 'Diario educativo — sin “ganar = comestible”.',
              })}
            </span>
          </Link>
          <Link
            to="/mapa"
            className="mkt-discover-card"
            data-testid="home-discover-map"
          >
            <span className="mkt-discover-card__kicker">
              {t('home.discoverMapKicker', { defaultValue: 'España' })}
            </span>
            <strong className="mkt-discover-card__title">
              {t('home.discoverMapTitle', { defaultValue: 'Cotos y mapa' })}
            </strong>
            <span className="mkt-discover-card__body">
              {t('home.discoverMapBody', {
                defaultValue: 'Enlaces oficiales — no vende permisos.',
              })}
            </span>
          </Link>
          <Link
            to="/educacion"
            className="mkt-discover-card"
            data-testid="home-discover-edu"
          >
            <span className="mkt-discover-card__kicker">
              {t('home.discoverEduKicker', { defaultValue: 'Seguridad' })}
            </span>
            <strong className="mkt-discover-card__title">
              {t('home.discoverEduTitle', { defaultValue: 'Educación' })}
            </strong>
            <span className="mkt-discover-card__body">
              {t('home.discoverEduBody', {
                defaultValue: 'Multi-vista diagnóstica y riesgos.',
              })}
            </span>
          </Link>
        </div>
      </section>

      {/* Competitive differentiators (vs Picture Mushroom / Seek / generic AI IDs) */}
      <section
        className="mkt-section mkt-section--tight mkt-diff"
        aria-label={t('home.ariaDiff', { defaultValue: 'Por qué VisionSetil' })}
      >
        <h2 className="mkt-h2 mkt-h2--sm">
          {t('home.diffTitle', { defaultValue: 'Mejor que “ID mágico”' })}
        </h2>
        <ul className="mkt-diff__list">
          <li>
            <strong>
              {t('home.diffMultiTitle', { defaultValue: 'Multi-foto de campo' })}
            </strong>
            <span>
              {t('home.diffMultiBody', {
                defaultValue:
                  'Inferior + perfil primero (como las apps serias), no un solo disparo.',
              })}
            </span>
          </li>
          <li>
            <strong>
              {t('home.diffOpenTitle', { defaultValue: 'Sabe decir “no sé”' })}
            </strong>
            <span>
              {t('home.diffOpenBody', {
                defaultValue: 'Open-set y gate de calidad: no inventa con seguridad falsa.',
              })}
            </span>
          </li>
          <li>
            <strong>
              {t('home.diffLookTitle', { defaultValue: 'Lookalikes de verdad' })}
            </strong>
            <span>
              {t('home.diffLookBody', {
                defaultValue: 'Studio + SSOT curado; confusiones mortales visibles.',
              })}
            </span>
          </li>
          <li>
            <strong>
              {t('home.diffLocalTitle', { defaultValue: 'España / cotos' })}
            </strong>
            <span>
              {t('home.diffLocalBody', {
                defaultValue: 'Enlaces MicologíaCyL y MicoAragón — no venden permisos.',
              })}
            </span>
          </li>
        </ul>
      </section>

      {/* Freemium packaging */}
      <section
        className="mkt-section mkt-section--tight"
        aria-label={t('home.ariaFreemium', { defaultValue: 'Free y Pro' })}
      >
        <ProPlanBanner showTable />
      </section>

      {/* Waitlist temporada */}
      <section
        className="mkt-section mkt-section--tight"
        aria-label={t('home.ariaWaitlist', { defaultValue: 'Waitlist temporada' })}
      >
        <WaitlistTemporada source="home" />
      </section>

      {/* Gallery / mini-video flashcards */}
      <section
        className="mkt-section mkt-section--tight"
        aria-label={t('home.ariaGallery', { defaultValue: 'Galería' })}
      >
        <LearnGallery />
      </section>

      {/* Setadle — short + visual */}
      <section
        className="mkt-section mkt-section--tight"
        aria-label={t('home.ariaSetadle', { defaultValue: 'Setadle' })}
      >
        <div className="mkt-feature mkt-feature--dark mkt-feature--compact">
          <div>
            <h2 className="mkt-h2">
              {t('home.setadleTitle', { defaultValue: 'Setadle' })}
            </h2>
            <p className="mkt-lead">
              {t('home.setadleLead', {
                defaultValue: 'Juego diario Free. Modos extra e ilimitado en Pro.',
              })}
            </p>
            <div className="mkt-cta-row">
              <Link to="/setadle" className="mkt-btn mkt-btn--amber">
                {t('home.play', { defaultValue: 'Jugar' })}
              </Link>
              <Link to="/reto" className="mkt-btn mkt-btn--ghost">
                {t('home.ctaQuiz', { defaultValue: 'Reto micológico' })}
              </Link>
              <Link to="/lookalikes" className="mkt-btn mkt-btn--ghost">
                {t('home.ctaLookalikes', { defaultValue: 'Lookalikes' })}
              </Link>
            </div>
          </div>
          <div className="mkt-feature__visual">
            <SetadleBoardMock
              compact
              caption={t('home.boardCaptionClassic', {
                defaultValue: 'Exacto · cerca · no',
              })}
            />
          </div>
        </div>
      </section>

      {/* Deadly row — photos only */}
      <section
        className="mkt-section mkt-section--tight"
        aria-label={t('home.ariaDeadly', { defaultValue: 'Mortales' })}
      >
        <div className="mkt-deadly-photos" role="list">
          {DEADLY.map((s) => {
            const slug = scientificNameToSlug(s.taxon)
            const name = t(s.nameKey, { defaultValue: s.taxon })
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
                    alt={name}
                    aspectRatio="4/5"
                    priority={s.taxon === 'Amanita phalloides'}
                    preferCatalog={false}
                  />
                </span>
                <span className="mkt-deadly-card__meta">
                  <span className="mkt-deadly-card__badge">
                    {t('home.deadlyBadge', { defaultValue: 'Mortal' })}
                  </span>
                  <strong>{name}</strong>
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Offline Pro CTA */}
      <section
        className="mkt-section mkt-section--tight"
        aria-label={t('home.ariaOffline', { defaultValue: 'Offline Pro' })}
      >
        <div className="mkt-feature mkt-feature--compact mkt-offline-cta">
          <div>
            <p className="mkt-kicker">
              {t('home.offlineKicker', { defaultValue: 'Pro · Campo sin red' })}
            </p>
            <h2 className="mkt-h2">
              {t('home.offlineTitle', { defaultValue: 'Offline Pack' })}
            </h2>
            <p className="mkt-lead">
              {t('home.offlineLead', {
                defaultValue:
                  'Fichas y fotos de estudio para temporada y prioritarias T0/T1. No identifica offline ni autoriza consumo.',
              })}
            </p>
            <div className="mkt-cta-row">
              <Link to="/offline" className="mkt-btn mkt-btn--primary">
                {t('home.ctaOfflinePack', { defaultValue: 'Ver pack Pro' })}
              </Link>
              <Link to="/educacion" className="mkt-btn mkt-btn--ghost">
                {t('home.ctaEducation', { defaultValue: 'Educación de seguridad' })}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* One-line safety, no essays */}
      <p className="mkt-safety-line">
        {t('home.safetyLine', {
          defaultValue:
            'Orientación de campo · no consumo · ante la duda, micólogo humano',
        })}
      </p>
    </div>
  )
}
