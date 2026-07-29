/** 404 — friendly atelier empty + multiview field honesty. */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/EmptyState'
import { IconMushroom } from '../components/icons'
import { deadlyPriorityViews } from '../lib/diagnosticViews'

export function NotFoundPage() {
  const { t } = useTranslation()
  const priorityViews = deadlyPriorityViews().slice(0, 3)

  return (
    <div className="page-404 page-atelier-shell" data-testid="not-found-page">
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
        <Link
          to="/identificar"
          className="btn-atelier btn-atelier--primary"
          data-testid="not-found-cta-identify"
        >
          {t('nav.identify', { defaultValue: 'Identificar multi-vista' })}
        </Link>
        <Link
          to="/enciclopedia"
          className="btn-atelier btn-atelier--ghost"
          data-testid="not-found-cta-ency"
        >
          {t('nav.encyclopedia', { defaultValue: 'Enciclopedia' })}
        </Link>
        <Link
          to="/educacion"
          className="btn-atelier btn-atelier--ghost"
          data-testid="not-found-cta-edu"
        >
          {t('nav.education', { defaultValue: 'Educación' })}
        </Link>
        <Link to="/reto" className="btn-atelier btn-atelier--ghost">
          {t('nav.quiz', { defaultValue: 'Reto' })}
        </Link>
      </div>
    </div>
  )
}

export default NotFoundPage
