/** Compact risk badge — short label + soft color (no long warning sentences). */
import { useTranslation } from 'react-i18next'
import {
  getRiskMeta,
  isSevereRisk,
  RISK_META,
  toRiskLabel,
  type RiskLabel,
} from '../lib/riskLabels'

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

/**
 * ES fallbacks when i18n key is missing — must match RISK_META (SSOT).
 * poisonous = Venenosa; toxic = Tóxica (never collapse).
 */
export const RISK_DEFAULT: Record<RiskLabel, string> = {
  deadly: RISK_META.deadly.short,
  poisonous: RISK_META.poisonous.short,
  toxic: RISK_META.toxic.short,
  unknown_or_risky: RISK_META.unknown_or_risky.short,
  dangerous_or_unknown: RISK_META.dangerous_or_unknown.short,
  not_for_consumption_guidance: RISK_META.not_for_consumption_guidance.short,
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
