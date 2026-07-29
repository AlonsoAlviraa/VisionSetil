/** Compact risk badge — short label + soft color (no long warning sentences). */
import { useTranslation } from 'react-i18next'
import { getRiskMeta, isSevereRisk, toRiskLabel, type RiskLabel } from '../lib/riskLabels'

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

const RISK_I18N_KEY: Record<RiskLabel, string> = {
  deadly: 'risk.deadly',
  poisonous: 'risk.poisonous',
  toxic: 'risk.toxic',
  unknown_or_risky: 'risk.orientation',
  dangerous_or_unknown: 'risk.dangerous_or_unknown',
  not_for_consumption_guidance: 'risk.not_for_consumption',
}

const RISK_DEFAULT: Record<RiskLabel, string> = {
  deadly: 'Mortal',
  poisonous: 'Tóxica',
  toxic: 'Tóxica',
  unknown_or_risky: 'Orientación',
  dangerous_or_unknown: 'Precaución',
  not_for_consumption_guidance: 'No apta',
}

export function RiskChip({ risk, label, className = '', boost = false }: Props) {
  const { t } = useTranslation()
  const meta = getRiskMeta(risk)
  const key = toRiskLabel(risk)
  const boostClass = boost && isSevereRisk(risk) ? 'risk-chip--boost' : ''
  const text =
    label ||
    t(RISK_I18N_KEY[key], {
      defaultValue: RISK_DEFAULT[key] || meta.short || meta.label,
    })
  return (
    <span
      className={`risk-chip ${meta.className} ${boostClass} ${className}`.trim()}
      title={text}
    >
      <span className="risk-chip__dot" aria-hidden="true" />
      <span className="risk-chip__text">{text}</span>
    </span>
  )
}
