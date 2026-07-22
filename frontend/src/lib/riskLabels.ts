/**
 * Risk-only display labels for VisionSetil UI (R1 / SAFETY_POLICY).
 * Never map to consumption permission language.
 */

export type RiskLabel =
  | 'deadly'
  | 'poisonous'
  | 'toxic'
  | 'unknown_or_risky'
  | 'dangerous_or_unknown'
  | 'not_for_consumption_guidance'

/** Short, clean labels — color carries severity (not long ugly sentences). */
export const RISK_META: Record<
  RiskLabel,
  { label: string; className: string; icon: string; short: string }
> = {
  deadly: { label: 'Mortal', short: 'Mortal', className: 'risk-deadly', icon: '' },
  poisonous: { label: 'Tóxica', short: 'Tóxica', className: 'risk-poisonous', icon: '' },
  toxic: { label: 'Tóxica', short: 'Tóxica', className: 'risk-toxic', icon: '' },
  unknown_or_risky: {
    label: 'Sin datos',
    short: 'Sin datos',
    className: 'risk-unknown',
    icon: '',
  },
  dangerous_or_unknown: {
    label: 'Precaución',
    short: 'Precaución',
    className: 'risk-caution',
    icon: '',
  },
  not_for_consumption_guidance: {
    label: 'No apta',
    short: 'No apta',
    className: 'risk-noapte',
    icon: '',
  },
}

/** Normalize backend edibility / risk strings to RiskLabel. */
export function toRiskLabel(raw: string | null | undefined): RiskLabel {
  if (!raw) return 'dangerous_or_unknown'
  const k = raw.toLowerCase().trim().replace(/\s+/g, '_')
  if (k === 'deadly' || k === 'mortifero' || k === 'critical') return 'deadly'
  if (k === 'poisonous' || k === 'high') return 'poisonous'
  if (k === 'toxic' || k === 'toxico') return 'toxic'
  if (
    k === 'edible' ||
    k === 'excelente' ||
    k === 'buen_comestible' ||
    k === 'comestible_con_cautela' ||
    k === 'safe'
  ) {
    // Never surface consumption OK — collapse to unknown risk
    return 'unknown_or_risky'
  }
  if (k === 'unknown_or_risky' || k === 'risky_lookalikes' || k === 'no_recomendado') {
    return 'unknown_or_risky'
  }
  if (k === 'not_for_consumption_guidance' || k === 'inedible') {
    return 'not_for_consumption_guidance'
  }
  if (k in RISK_META) return k as RiskLabel
  return 'dangerous_or_unknown'
}

export function getRiskMeta(raw: string | null | undefined) {
  return RISK_META[toRiskLabel(raw)]
}

/** Forbidden consumption-permission phrases for CI / tests. */
export const FORBIDDEN_CONSUMPTION_PHRASES = [
  'segura para comer',
  'safe to eat',
  'excelente comestible',
  'buen comestible',
  'puedes comer',
  'safe to consume',
] as const
