/** 404 — friendly empty + multiview field honesty. Architecture M5g LinkButton. */
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/EmptyState'
import { IconMushroom } from '../components/icons'
import { LinkButton, PageShell } from '../components/ui'
import { deadlyPriorityViews } from '../lib/diagnosticViews'

export function NotFoundPage() {
  const { t } = useTranslation()
  const priorityViews = deadlyPriorityViews().slice(0, 3)

  return (
    <PageShell
      className="page-404 page-atelier-shell"
      testId="not-found-page"
      orientationSticky
      orientationText={t('notFound.orientation', {
        defaultValue: 'Solo orientación · nunca consumo',
      })}
    >
      <EmptyState
        title={t('notFound.title', { defaultValue: 'Página no encontrada' })}
        description={t('notFound.body', {
          defaultValue:
            'Esa ruta no existe en VisionSetil. Vuelve al inicio o identifica con multi-vista (orientación — nunca consumo).',
        })}
        icon={<IconMushroom size={32} />}
        actionLabel={t('notFound.home', { defaultValue: 'Ir al inicio' })}
        actionTo="/"
      />

      <section
        className="mkt-multiview-strip page-404-multiview"
        data-testid="not-found-multiview-tip"
        role="note"
      >
        <p className="mkt-multiview-strip__text">
          {t('notFound.multiviewTip', {
            defaultValue:
              'Si ibas a Identificar: prioriza láminas, perfil/pie y base (volva/anillo). Multi-foto sin esas vistas no basta para confusiones mortales — solo orientación, nunca consumo.',
          })}
        </p>
        <div className="mkt-multiview-strip__views lookalike-item__diag-views">
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
      </section>

      <div className="page-404__links">
        <LinkButton to="/identificar" variant="ghost" data-testid="not-found-cta-identify">
          {t('nav.identify', { defaultValue: 'Identificar' })}
        </LinkButton>
        <LinkButton to="/enciclopedia" variant="ghost" data-testid="not-found-cta-ency">
          {t('nav.encyclopedia', { defaultValue: 'Enciclopedia' })}
        </LinkButton>
        <LinkButton to="/educacion" variant="ghost" data-testid="not-found-cta-edu">
          {t('nav.education', { defaultValue: 'Educación' })}
        </LinkButton>
        <LinkButton to="/reto" variant="ghost">
          {t('nav.quiz', { defaultValue: 'Reto' })}
        </LinkButton>
      </div>
    </PageShell>
  )
}

export default NotFoundPage
