/** Más hub — full product map beyond bottom-nav primaries (Option B). */
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
        blurbFb: 'Multi-vista y seguridad de campo',
      },
      {
        to: '/lookalikes',
        labelKey: 'nav.lookalikes',
        fallback: 'Lookalike Studio',
        blurbKey: 'nav.blurb.lookalikes',
        blurbFb: 'Confusiones y vistas críticas',
      },
      {
        to: '/juegos',
        labelKey: 'nav.games',
        fallback: 'Juegos',
        blurbKey: 'nav.blurb.games',
        blurbFb: 'Setadle · Wordle · Reto',
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
        fallback: 'Mapa / cotos',
        blurbKey: 'nav.blurb.map',
        blurbFb: 'Zonas e info oficial — no identifica setas',
      },
      {
        to: '/historial',
        labelKey: 'nav.notebook',
        fallback: 'Cuaderno',
        blurbKey: 'nav.blurb.notebook',
        blurbFb: 'Historial y pins privados',
      },
      {
        to: '/offline',
        labelKey: 'nav.offline',
        fallback: 'Offline pack',
        blurbKey: 'nav.blurb.offline',
        blurbFb: 'Estudio sin red (no ID de campo)',
      },
    ],
  },
  {
    id: 'people',
    titleKey: 'nav.moreGroup.people',
    titleFb: 'Gente',
    items: [
      {
        to: '/comunidad',
        labelKey: 'nav.community',
        fallback: 'Comunidad',
        blurbKey: 'nav.blurb.community',
        blurbFb: 'Segunda opinión humana',
      },
      {
        to: '/revision-experta',
        labelKey: 'nav.experts',
        fallback: 'Revisión experta',
        blurbKey: 'nav.blurb.experts',
        blurbFb: 'Handoff a micólogo',
      },
      {
        to: '/login',
        labelKey: 'nav.login',
        fallback: 'Entrar',
        blurbKey: 'nav.blurb.login',
        blurbFb: 'Cuenta opcional',
      },
    ],
  },
  {
    id: 'ops',
    titleKey: 'nav.moreGroup.dev',
    titleFb: 'Ops / beta',
    items: [
      {
        to: '/beta-feedback',
        labelKey: 'nav.betaFeedback',
        fallback: 'Feedback beta',
        blurbKey: 'nav.blurb.beta',
        blurbFb: 'Cuéntanos qué falla',
        testId: 'more-hub-beta',
      },
      {
        to: '/ml',
        labelKey: 'nav.ml',
        fallback: 'ML dashboard',
        blurbKey: 'nav.blurb.ml',
        blurbFb: 'Métricas honestas · product_unlock false',
      },
    ],
  },
]

export function MoreHubPage() {
  const { t } = useTranslation()
  const betaHref = betaFeedbackHref()
  const betaExternal = isBetaExternalForm() || isBetaMailto()

  return (
    <div className="page-more-hub page-atelier-shell" data-testid="more-hub-page">
      <header className="mkt-page-head">
        <p className="mkt-kicker">{t('nav.more', { defaultValue: 'Más' })}</p>
        <h1 className="mkt-page-head__title">
          {t('more.title', { defaultValue: 'Todo VisionSetil' })}
        </h1>
        <p className="mkt-page-head__lead" role="note">
          {t('more.policy', {
            defaultValue:
              'Mapa completo del producto. Identify y juegos son orientación — nunca permiso de consumo.',
          })}
        </p>
      </header>

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
                  <span className="more-hub-list__label">
                    {t(item.labelKey, { defaultValue: item.fallback })}
                  </span>
                  <span className="more-hub-list__blurb">
                    {t(item.blurbKey, { defaultValue: item.blurbFb })}
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
  )
}

export default MoreHubPage
