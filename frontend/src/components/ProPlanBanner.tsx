/**
 * Compact Free / Pro plan chrome + demo unlock.
 * Packaging only — no payment processor.
 * Plan state synced via entitlements usePlan (localStorage + events).
 */
import { Link } from 'react-router-dom'
import {
  freeVsProRows,
  planLabelEs,
  usePlanActions,
} from '../lib/entitlements'

type Props = {
  className?: string
  /** show comparison table */
  showTable?: boolean
  compact?: boolean
}

export function ProPlanBanner({
  className = '',
  showTable = false,
  compact = false,
}: Props) {
  const { plan, unlock, lock } = usePlanActions()

  return (
    <section
      className={`pro-plan-banner ${compact ? 'pro-plan-banner--compact' : ''} ${className}`.trim()}
      data-testid="pro-plan-banner"
      data-plan={plan}
    >
      <div className="pro-plan-banner__head">
        <span className={`pro-plan-banner__badge pro-plan-banner__badge--${plan}`}>
          Plan {planLabelEs(plan)}
        </span>
        <p className="pro-plan-banner__lead">
          {plan === 'pro'
            ? 'Pro activo en este dispositivo: pack offline, historial amplio y Setadle extra.'
            : 'Free: identificar con cupo, enciclopedia y seguridad. Pro: offline y extras de estudio.'}
        </p>
      </div>

      {showTable && (
        <div className="pro-plan-banner__table-wrap">
          <table className="pro-plan-banner__table">
            <thead>
              <tr>
                <th>Función</th>
                <th>Free</th>
                <th>Pro</th>
              </tr>
            </thead>
            <tbody>
              {freeVsProRows().map((row) => (
                <tr key={row.feature}>
                  <td>{row.feature}</td>
                  <td>{row.free}</td>
                  <td>{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pro-plan-banner__actions">
        {plan === 'free' ? (
          <button
            type="button"
            className="mkt-btn mkt-btn--amber"
            onClick={unlock}
            data-testid="pro-unlock-demo"
          >
            Activar Pro (demo local)
          </button>
        ) : (
          <button
            type="button"
            className="mkt-btn mkt-btn--ghost"
            onClick={lock}
            data-testid="pro-deactivate"
          >
            Volver a Free
          </button>
        )}
        <Link to="/offline" className="mkt-btn mkt-btn--ghost">
          Pack offline
        </Link>
        <Link to="/identificar" className="mkt-btn mkt-btn--primary">
          Identificar
        </Link>
      </div>
      <p className="pro-plan-banner__note" role="note">
        Demo local sin pago. Orientación de campo — nunca permiso de consumo.
      </p>
    </section>
  )
}
