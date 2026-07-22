/** Compact risk badge — short label + soft color (no long warning sentences). */
import { getRiskMeta } from '../lib/riskLabels'

type Props = {
  risk?: string | null
  label?: string
  className?: string
}

export function RiskChip({ risk, label, className = '' }: Props) {
  const meta = getRiskMeta(risk)
  return (
    <span className={`risk-chip ${meta.className} ${className}`.trim()} title={meta.label}>
      <span className="risk-chip__dot" aria-hidden="true" />
      <span className="risk-chip__text">{label || meta.short || meta.label}</span>
    </span>
  )
}
