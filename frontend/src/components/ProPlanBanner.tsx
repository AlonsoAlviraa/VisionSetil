/**
 * Compact Free / Pro plan chrome + demo unlock.
 * Packaging only — no payment processor.
 * Plan state synced via entitlements usePlan (localStorage + events).
 */
import {
  freeVsProRows,
  planLabelEs,
  usePlanActions,
} from '../lib/entitlements'
import { Button, LinkButton } from './ui'

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
      role="region"
      aria-label={`Plan ${planLabelEs(plan)} · empaquetado de estudio`}
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
          <Button type="button" variant="primary" onClick={unlock} data-testid="pro-unlock-demo">
            Pro (prueba en este dispositivo)
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={lock} data-testid="pro-deactivate">
            Volver a Free
          </Button>
        )}
        <LinkButton to="/offline" variant="ghost">
          Pack offline
        </LinkButton>
        <LinkButton to="/identificar" variant="ghost">
          Identificar
        </LinkButton>
      </div>
      <p className="pro-plan-banner__note" role="note">
        Demo local sin pago. Orientación de campo — nunca permiso de consumo.
      </p>
    </section>
  )
}
