/**
 * Human-readable labels for open-set / Identify abstention reason codes.
 * Never invents forage permission — orientation copy only.
 */

const KNOWN = [
  'low_top1_confidence',
  'low_margin',
  'high_entropy',
  'high_risk_genus',
  'deadly_lookalike_or_high_risk_genus',
  'missing_critical_evidence',
  'no_candidates',
  'open_set_uncertain',
  'low_confidence_or_margin_multiview_few_shot',
] as const

export type OpenSetReasonCode = (typeof KNOWN)[number] | string

/** i18n key under honesty.open_set_reason.* or null for unknown codes */
export function openSetReasonI18nKey(reason: string | null | undefined): string | null {
  if (!reason) return null
  const r = reason.trim()
  if (!r) return null
  if ((KNOWN as readonly string[]).includes(r)) {
    return `honesty.open_set_reason.${r}`
  }
  // Gate failures use honesty.gate / decision keys elsewhere
  if (r.startsWith('model_quality_gate') || r.includes('quality_gate')) {
    return 'honesty.decision.rejected_gate'
  }
  return null
}

/** Fallback Spanish/English when i18n key missing */
export function openSetReasonFallback(
  reason: string | null | undefined,
  locale?: string,
): string {
  const en = (locale || 'es').toLowerCase().startsWith('en')
  const r = (reason || '').trim()
  const map: Record<string, [string, string]> = {
    low_top1_confidence: [
      'Confianza top-1 insuficiente — el modelo se abstiene',
      'Top-1 confidence too low — model abstains',
    ],
    low_margin: [
      'Muy poca diferencia entre las mejores pistas',
      'Too little margin between top predictions',
    ],
    high_entropy: [
      'Distribución incierta (alta entropía) — abstención',
      'Uncertain distribution (high entropy) — abstain',
    ],
    high_risk_genus: [
      'Género de alto riesgo — revisión humana recomendada',
      'High-risk genus — human review recommended',
    ],
    deadly_lookalike_or_high_risk_genus: [
      'Posible confusión con especie peligrosa',
      'Possible confusion with a dangerous lookalike',
    ],
    missing_critical_evidence: [
      'Faltan vistas o evidencia crítica en la foto',
      'Missing critical photo views or evidence',
    ],
    no_candidates: [
      'Sin candidatos del modelo',
      'No model candidates',
    ],
    open_set_uncertain: [
      'Incertidumbre open-set',
      'Open-set uncertainty',
    ],
  }
  if (r in map) return en ? map[r][1] : map[r][0]
  if (!r) return en ? 'Model abstains' : 'El modelo se abstiene'
  return r
}
