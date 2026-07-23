/** Compact risk badge — short label + soft color (no long warning sentences). */
import { getRiskMeta, isSevereRisk } from '../lib/riskLabels'

type Props = {
  risk?: string | null
  label?: string
  className?: string
  /**
   * B-42: stronger chrome for deadly/poisonous join on real Identify results.
   * No-op for non-severe risk. Callers gate boost on mode===real (or legacy).
   */
  boost?: boolean
}

export function RiskChip({ risk, label, className = '', boost = false }: Props) {
  const meta = getRiskMeta(risk)
  const boostClass = boost && isSevereRisk(risk) ? 'risk-chip--boost' : ''
  return (
    <span
      className={`risk-chip ${meta.className} ${boostClass} ${className}`.trim()}
      title={meta.label}
    >
      <span className="risk-chip__dot" aria-hidden="true" />
      <span className="risk-chip__text">{label || meta.short || meta.label}</span>
    </span>
  )
}
