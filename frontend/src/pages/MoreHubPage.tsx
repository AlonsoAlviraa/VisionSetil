/** Más hub — nav SSOT from lib/navConfig.ts (architecture M1). */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon, LinkButton, PageShell } from '../components/ui'
import {
  betaFeedbackHref,
  isBetaExternalForm,
  isBetaMailto,
} from '../lib/betaFeedback'
import { WORLD_MUSHROOM_RESOURCES } from '../lib/openStudyLinks'
import { MORE_NAV_GROUPS } from '../lib/navConfig'

/**
 * Learn-group blurb clarity (PR-UX-07b): multi-view photos + lookalikes + orientation only.
 * Falls back to navConfig blurbFallback when i18n key is missing.
 */
const LEARN_BLURB_DEFAULTS: Record<string, string> = {
  'nav.blurb.education':
    'Multi-vista (láminas, perfil, base) y estudio mortales · solo orientación',
  'nav.blurb.lookalikes': 'Lookalikes lado a lado · estudio, nunca consumo',
  'nav.blurb.setadle': 'Adivina la seta · juego de estudio',
  'nav.blurb.quiz': 'Quiz de caracteres · sin permiso de consumo',
  'nav.blurb.wordle': 'Letras del nombre · solo estudio',
}

export function MoreHubPage() {
  const { t } = useTranslation()
  const betaHref = betaFeedbackHref()
  const betaExternal = isBetaExternalForm() || isBetaMailto()

  return (
    <PageShell
      className="page-more-hub page-more-hub--v12"
      testId="more-hub-page"
      orientationSticky
      orientationText={t('more.orientation', {
        defaultValue: 'Solo orientación · nunca consumo',
      })}
    >
      <header className="cn-page-head cn-page-pad">
        <h1 className="cn-page-head__title cn-text-cream">
          {t('more.title', { defaultValue: 'Más' })}
        </h1>
        <p className="cn-page-head__lead">
          {t('more.policy', { defaultValue: 'Todo el producto, en un sitio.' })}
        </p>
      </header>

      <div className="cn-page-pad">
        <div className="more-hub-groups">
          {MORE_NAV_GROUPS.map((g) => (
            <section
              key={g.id}
              className="more-hub-group more-hub-group--v12"
              data-testid={`more-hub-${g.id}`}
            >
              <h2 className="more-hub-group__title more-hub-group__title--v12">
                {g.glyph ? <Icon name={g.glyph} size="sm" aria-hidden="true" /> : null}
                {t(g.titleKey, { defaultValue: g.titleFallback })}
              </h2>
              {g.id === 'learn' ? (
                <p
                  className="more-hub-group__lead muted"
                  data-testid="more-hub-learn-blurb"
                  role="note"
                >
                  {t('more.learnLead', {
                    defaultValue:
                      'Aprende con fotos multi-vista y confusiones (lookalikes). Solo orientación — nunca consumo ni recolección.',
                  })}
                </p>
              ) : null}
              <ul className="more-hub-list more-hub-list--v12">
                {g.items.map((item) => {
                  const isBeta = item.to === '/beta-feedback'
                  const glyph = item.glyph || 'circle'
                  const blurbDefault =
                    (g.id === 'learn' && LEARN_BLURB_DEFAULTS[item.blurbKey]) ||
                    item.blurbFallback
                  // Soft deep-link PhotoCoach / learn CTA into multi-view education anchor
                  const to =
                    item.to === '/educacion' ? '/educacion#multi-view' : item.to
                  const body = (
                    <>
                      <span className="more-hub-tile__icon" aria-hidden="true">
                        <Icon name={glyph} size="md" />
                      </span>
                      <span className="more-hub-tile__text">
                        <span className="more-hub-tile__label">
                          {t(item.labelKey, { defaultValue: item.fallback })}
                        </span>
                        <span className="more-hub-tile__blurb">
                          {t(item.blurbKey, { defaultValue: blurbDefault })}
                        </span>
                      </span>
                      <Icon
                        name="chevron_right"
                        size="sm"
                        className="more-hub-tile__chev"
                        aria-hidden="true"
                      />
                    </>
                  )
                  if (isBeta && betaExternal) {
                    return (
                      <li key={item.to} className="more-hub-tile">
                        <a
                          href={betaHref}
                          className="more-hub-tile__link"
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
                    <li key={item.to} className="more-hub-tile">
                      <Link to={to} className="more-hub-tile__link" data-testid={item.testId}>
                        {body}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <section
          className="more-hub-group more-hub-world more-hub-world--v12"
          data-testid="more-hub-world"
        >
          <h2 className="more-hub-group__title more-hub-group__title--v12">
            <Icon name="public" size="sm" aria-hidden="true" />
            {t('more.worldTitle', { defaultValue: 'Recursos del mundo' })}
          </h2>
          <ul className="more-hub-list more-hub-list--v12 more-hub-world__list">
            {WORLD_MUSHROOM_RESOURCES.map((r) => (
              <li key={r.id} className="more-hub-tile">
                <a
                  href={r.href}
                  className="more-hub-tile__link"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`more-world-${r.id}`}
                  aria-label={t('more.worldLinkAria', {
                    defaultValue: '{{name}} (se abre en pestaña nueva)',
                    name: r.name,
                  })}
                >
                  <span className="more-hub-tile__text">
                    <span className="more-hub-tile__label">{r.name}</span>
                    <span className="more-hub-tile__blurb">{r.blurbEs}</span>
                  </span>
                  <Icon
                    name="open_in_new"
                    size="sm"
                    className="more-hub-tile__chev"
                    aria-hidden="true"
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <div className="more-hub-cta">
          <LinkButton
            to="/identificar"
            skin="cn"
            variant="primary"
            block
            className="more-hub-cta__btn"
            data-testid="more-hub-cta-identify"
          >
            <Icon name="center_focus_strong" size="sm" aria-hidden="true" />
            {t('more.ctaIdentify', { defaultValue: 'Identificar seta' })}
          </LinkButton>
        </div>
      </div>
    </PageShell>
  )
}

export default MoreHubPage
