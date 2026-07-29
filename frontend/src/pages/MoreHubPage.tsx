/** Más hub — Stitch B 11-mas · full product map. */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  betaFeedbackHref,
  isBetaExternalForm,
  isBetaMailto,
} from '../lib/betaFeedback'

type Item = {
  to: string
  labelKey: string
  fallback: string
  blurbKey: string
  blurbFb: string
  icon: string
  external?: boolean
  testId?: string
}

const GROUPS: {
  id: string
  titleKey: string
  titleFb: string
  items: Item[]
}[] = [
  {
    id: 'learn',
    titleKey: 'nav.moreGroup.learn',
    titleFb: 'Aprender',
    items: [
      {
        to: '/educacion',
        labelKey: 'nav.education',
        fallback: 'Educación',
        blurbKey: 'nav.blurb.education',
        blurbFb: 'Seguridad y multi-vista de campo',
        icon: 'school',
      },
      {
        to: '/lookalikes',
        labelKey: 'nav.lookalikes',
        fallback: 'Confusiones',
        blurbKey: 'nav.blurb.lookalikes',
        blurbFb: 'Compara especies que se confunden',
        icon: 'compare',
      },
      {
        to: '/juegos',
        labelKey: 'nav.games',
        fallback: 'Juegos',
        blurbKey: 'nav.blurb.games',
        blurbFb: 'Setadle, Wordle y reto diario',
        icon: 'games',
      },
    ],
  },
  {
    id: 'field',
    titleKey: 'nav.moreGroup.field',
    titleFb: 'Campo',
    items: [
      {
        to: '/mapa',
        labelKey: 'nav.map',
        fallback: 'Mapa de cotos',
        blurbKey: 'nav.blurb.map',
        blurbFb: 'Zonas y cotos — no identifica setas',
        icon: 'map',
      },
      {
        to: '/historial',
        labelKey: 'nav.notebook',
        fallback: 'Cuaderno',
        blurbKey: 'nav.blurb.notebook',
        blurbFb: 'Tus observaciones en este dispositivo',
        icon: 'book',
      },
      {
        to: '/offline',
        labelKey: 'nav.offline',
        fallback: 'Sin red',
        blurbKey: 'nav.blurb.offline',
        blurbFb: 'Fichas para estudiar sin conexión',
        icon: 'offline',
      },
    ],
  },
  {
    id: 'people',
    titleKey: 'nav.moreGroup.people',
    titleFb: 'Comunidad',
    items: [
      {
        to: '/comunidad',
        labelKey: 'nav.community',
        fallback: 'Comunidad',
        blurbKey: 'nav.blurb.community',
        blurbFb: 'Opiniones humanas, nunca certeza',
        icon: 'people',
      },
      {
        to: '/revision-experta',
        labelKey: 'nav.experts',
        fallback: 'Revisión experta',
        blurbKey: 'nav.blurb.experts',
        blurbFb: 'Prepara el envío a un micólogo',
        icon: 'expert',
      },
      {
        to: '/login',
        labelKey: 'nav.login',
        fallback: 'Entrar',
        blurbKey: 'nav.blurb.login',
        blurbFb: 'Cuenta opcional',
        icon: 'login',
      },
    ],
  },
  {
    id: 'ops',
    titleKey: 'nav.moreGroup.dev',
    titleFb: 'Herramientas',
    items: [
      {
        to: '/ml',
        labelKey: 'nav.ml',
        fallback: 'Panel ML',
        blurbKey: 'nav.blurb.ml',
        blurbFb: 'Métricas honestas del modelo',
        icon: 'ml',
      },
      {
        to: '/beta-feedback',
        labelKey: 'nav.betaFeedback',
        fallback: 'Feedback beta',
        blurbKey: 'nav.blurb.beta',
        blurbFb: 'Cuéntanos qué falla',
        testId: 'more-hub-beta',
        icon: 'feedback',
      },
    ],
  },
]

function MoreIcon({ name }: { name: string }) {
  const c = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'school':
      return (
        <svg {...c}>
          <path d="M3 9l9-5 9 5-9 5-9-5z" />
          <path d="M7 12v5c0 1 2.5 3 5 3s5-2 5-3v-5" />
        </svg>
      )
    case 'compare':
      return (
        <svg {...c}>
          <rect x="3" y="4" width="7" height="16" rx="1.5" />
          <rect x="14" y="4" width="7" height="16" rx="1.5" />
        </svg>
      )
    case 'games':
      return (
        <svg {...c}>
          <rect x="3" y="8" width="18" height="10" rx="3" />
          <path d="M8 13h2M9 12v2" />
        </svg>
      )
    case 'map':
      return (
        <svg {...c}>
          <path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z" />
        </svg>
      )
    case 'book':
      return (
        <svg {...c}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5z" />
        </svg>
      )
    case 'offline':
      return (
        <svg {...c}>
          <path d="M2 8c4-4 10-4 14 0M5 11c3-3 7-3 10 0" />
          <path d="M8.5 14a4 4 0 0 1 5 0M12 18h.01" />
          <path d="M3 3l18 18" />
        </svg>
      )
    case 'people':
      return (
        <svg {...c}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 19c.5-2 2.5-3.5 5-3.5 1 0 2 .3 2.8.8" />
        </svg>
      )
    case 'expert':
      return (
        <svg {...c}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.5-4 4-6 7-6s5.5 2 7 6" />
        </svg>
      )
    case 'login':
      return (
        <svg {...c}>
          <path d="M10 17l5-5-5-5M15 12H3" />
          <path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
        </svg>
      )
    case 'ml':
      return (
        <svg {...c}>
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M7 14l3-4 3 2 4-5" />
        </svg>
      )
    default:
      return (
        <svg {...c}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )
  }
}

export function MoreHubPage() {
  const { t } = useTranslation()
  const betaHref = betaFeedbackHref()
  const betaExternal = isBetaExternalForm() || isBetaMailto()

  return (
    <div className="cn-page page-more-hub" data-testid="more-hub-page">
      <p className="cn-warn-strip" role="note">
        {t('more.orientation', {
          defaultValue: 'Solo orientación · nunca permiso de consumo',
        })}
      </p>
      <header className="cn-page-head cn-page-pad">
        <p className="cn-kicker mkt-kicker">
          {t('nav.more', { defaultValue: 'Más' })}
        </p>
        <h1 className="cn-page-head__title">
          {t('more.title', { defaultValue: 'Más herramientas' })}
        </h1>
        <p className="cn-page-head__lead" role="note">
          {t('more.policy', {
            defaultValue:
              'Todo el mapa del producto. Identificar y los juegos orientan: nunca dan permiso de consumo.',
          })}
        </p>
      </header>

      <div className="cn-page-pad">
        <div className="more-hub-groups">
          {GROUPS.map((g) => (
            <section key={g.id} className="more-hub-group" data-testid={`more-hub-${g.id}`}>
              <h2 className="more-hub-group__title">
                {t(g.titleKey, { defaultValue: g.titleFb })}
              </h2>
              <ul className="more-hub-list">
                {g.items.map((item) => {
                  const isBeta = item.to === '/beta-feedback'
                  const body = (
                    <>
                      <span className="more-hub-list__icon" aria-hidden="true">
                        <MoreIcon name={item.icon} />
                      </span>
                      <span className="more-hub-list__text">
                        <span className="more-hub-list__label">
                          {t(item.labelKey, { defaultValue: item.fallback })}
                        </span>
                        <span className="more-hub-list__blurb">
                          {t(item.blurbKey, { defaultValue: item.blurbFb })}
                        </span>
                      </span>
                      <span className="more-hub-list__chev" aria-hidden="true">
                        ›
                      </span>
                    </>
                  )
                  if (isBeta && betaExternal) {
                    return (
                      <li key={item.to}>
                        <a
                          href={betaHref}
                          className="more-hub-list__link"
                          data-testid={item.testId}
                          {...(isBetaMailto()
                            ? {}
                            : { target: '_blank', rel: 'noopener noreferrer' })}
                        >
                          {body}
                        </a>
                      </li>
                    )
                  }
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className="more-hub-list__link"
                        data-testid={item.testId}
                      >
                        {body}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="more-hub-cta">
          <Link to="/identificar" className="cn-btn cn-btn--primary cn-btn--block more-hub-cta__btn">
            {t('more.ctaIdentify', { defaultValue: 'Ir a Identificar' })}
          </Link>
        </div>
        <p className="more-hub-foot">
          {t('more.foot', {
            defaultValue: 'VisionSetil · campo nocturno',
          })}
        </p>
      </div>
    </div>
  )
}

export default MoreHubPage
