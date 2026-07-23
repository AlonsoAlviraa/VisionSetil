/**
 * Edibility / risk presentation helpers — D16 surface rules (PR-09).
 * Encyclopedia: educational wording + non-food-safe colors.
 * Identify: risk-only labels, never green edible.
 */

export type EdibilityCode =
  | 'excelente'
  | 'buen_comestible'
  | 'comestible_con_cautela'
  | 'no_recomendado'
  | 'toxico'
  | 'mortifero'
  | 'desconocido'

/** D16 colors — no food-safe green for excelente. */
export const EDIBILITY_COLORS_D16: Record<EdibilityCode, string> = {
  excelente: '#0e7490', // teal/info
  buen_comestible: '#0284c7',
  comestible_con_cautela: '#d97706',
  no_recomendado: '#b45309',
  toxico: '#dc2626',
  mortifero: '#7f1d1d',
  desconocido: '#64748b',
}

export type RiskLevel =
  | 'deadly'
  | 'high'
  | 'medium'
  | 'low'
  | 'unknown'
  | 'risky_lookalikes'
  | 'toxic'
  | 'critical'

export function riskToPlaceholder(
  risk?: string | null,
  edibility?: string | null,
): 'default' | 'toxic' | 'deadly' | 'unknown' {
  const r = (risk || '').toLowerCase()
  const e = (edibility || '').toLowerCase()
  if (r === 'deadly' || r === 'critical' || e === 'mortifero') return 'deadly'
  if (r === 'high' || r === 'toxic' || r === 'risky_lookalikes' || r === 'medium' || e === 'toxico')
    return 'toxic'
  if (r === 'unknown' || e === 'desconocido') return 'unknown'
  return 'default'
}

export function edibilityToRisk(code: EdibilityCode | string): RiskLevel {
  switch (code) {
    case 'mortifero':
      return 'deadly'
    case 'toxico':
      return 'high'
    case 'no_recomendado':
      return 'medium'
    case 'comestible_con_cautela':
      return 'risky_lookalikes'
    case 'desconocido':
      return 'unknown'
    default:
      return 'low'
  }
}
