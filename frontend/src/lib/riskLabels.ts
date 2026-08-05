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

/**
 * Short, clean labels — color carries severity (not long ugly sentences).
 * SSOT for ES display copy: poisonous = Venenosa, toxic = Tóxica (distinct).
 * i18n keys under `risk.*` must stay in parity (es/en/ca/eu).
 */
export const RISK_META: Record<
  RiskLabel,
  { label: string; className: string; icon: string; short: string }
> = {
  deadly: { label: 'Mortal', short: 'Mortal', className: 'risk-deadly', icon: '' },
  poisonous: { label: 'Venenosa', short: 'Venenosa', className: 'risk-poisonous', icon: '' },
  toxic: { label: 'Tóxica', short: 'Tóxica', className: 'risk-toxic', icon: '' },
  unknown_or_risky: {
    // Educational low-risk / documented-edible bucket — never "safe to eat"
    label: 'Orientación',
    short: 'Orientación',
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

/**
 * ES fallbacks when i18n key is missing — pure projection of RISK_META.short.
 * poisonous = Venenosa; toxic = Tóxica (never collapse). Lives next to RISK_META (SSOT).
 */
export const RISK_DEFAULT: Record<RiskLabel, string> = {
  deadly: RISK_META.deadly.short,
  poisonous: RISK_META.poisonous.short,
  toxic: RISK_META.toxic.short,
  unknown_or_risky: RISK_META.unknown_or_risky.short,
  dangerous_or_unknown: RISK_META.dangerous_or_unknown.short,
  not_for_consumption_guidance: RISK_META.not_for_consumption_guidance.short,
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

/** Severity for max(model edibility, catalog risk_level) join visibility (B-42). */
const RISK_SEVERITY: Record<RiskLabel, number> = {
  deadly: 100,
  poisonous: 80,
  toxic: 80,
  not_for_consumption_guidance: 40,
  dangerous_or_unknown: 30,
  unknown_or_risky: 20,
}

export function riskSeverity(raw: string | null | undefined): number {
  return RISK_SEVERITY[toRiskLabel(raw)] ?? 0
}

/**
 * Prefer the more severe of model edibility vs catalog hydrate risk_level (B-42).
 * Catalog join must not stay invisible when model left edibility=unknown.
 */
export function resolveJoinRisk(
  edibility?: string | null,
  riskLevel?: string | null,
): RiskLabel {
  const fromEd = toRiskLabel(edibility)
  if (!riskLevel) return fromEd
  const fromCatalog = toRiskLabel(riskLevel)
  return riskSeverity(fromCatalog) > riskSeverity(fromEd) ? fromCatalog : fromEd
}

/** Deadly / poisonous / toxic — candidates for visual boost on real results. */
export function isSevereRisk(raw: string | null | undefined): boolean {
  const k = toRiskLabel(raw)
  return k === 'deadly' || k === 'poisonous' || k === 'toxic'
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
