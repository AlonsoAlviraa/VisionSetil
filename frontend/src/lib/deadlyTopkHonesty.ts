/**
 * Deadly top-k honesty helpers for Identify result chrome (UX-02).
 * Serious study tone · never confetti · never product_unlock · never forage.
 */
import type { ClassificationResult, SpeciesPrediction } from '../api/types'
import { isSevereRisk, toRiskLabel, type RiskLabel } from './riskLabels'

export type DeadlyTopkHit = {
  source: 'prediction' | 'lookalike'
  name: string
  risk: RiskLabel
  rank?: number
}

/** Collect severe (deadly/poisonous/toxic) hits from top-k + lookalike strings. */
export function collectDeadlyTopkHits(
  result: Pick<ClassificationResult, 'predictions' | 'dangerous_lookalikes'>,
  maxPredictions = 3,
): DeadlyTopkHit[] {
  const hits: DeadlyTopkHit[] = []
  const preds = (result.predictions || []).slice(0, maxPredictions)
  preds.forEach((p: SpeciesPrediction, idx: number) => {
    const risk = toRiskLabel(p.risk_level || p.edibility)
    if (!isSevereRisk(risk)) return
    hits.push({
      source: 'prediction',
      name: p.species,
      risk,
      rank: idx + 1,
    })
  })
  for (const name of result.dangerous_lookalikes || []) {
    if (!name || typeof name !== 'string') continue
    // Lookalike list is already "dangerous"; treat as severe study signal
    hits.push({
      source: 'lookalike',
      name,
      risk: 'deadly',
    })
  }
  return hits
}

/** True when top-k or lookalikes include a severe risk signal. */
export function shouldShowDeadlyTopkCoach(
  result: Pick<ClassificationResult, 'predictions' | 'dangerous_lookalikes' | 'decision'>,
): boolean {
  // Still show for rejected if model surfaced deadly lookalikes / candidates
  const hits = collectDeadlyTopkHits(result)
  return hits.some((h) => h.risk === 'deadly' || h.source === 'lookalike' || isSevereRisk(h.risk))
}

/** True when any prediction in top-k is deadly specifically. */
export function hasDeadlyPredictionInTopk(
  predictions: SpeciesPrediction[] | null | undefined,
  max = 3,
): boolean {
  return (predictions || []).slice(0, max).some((p) => {
    const r = toRiskLabel(p.risk_level || p.edibility)
    return r === 'deadly'
  })
}

export type DeadlyTopkCopy = {
  title: string
  body: string
  studioCta: string
}

/** Locale copy for the deadly study coach block (no celebration). */
export function deadlyTopkCoachCopy(locale?: string): DeadlyTopkCopy {
  const en = (locale || 'es').toLowerCase().startsWith('en')
  if (en) {
    return {
      title: 'High-risk / deadly confusion — study carefully',
      body:
        'Orientation only · never consume. Prefer multi-view (gills + profile) and expert review. Dual top-k may include lookalikes that kill.',
      studioCta: 'Study deadly confusions',
    }
  }
  return {
    title: 'Confusión de alto riesgo / mortal — estudia con cuidado',
    body:
      'Solo orientación · nunca consumas. Prioriza multi-vista (láminas + perfil) y revisión experta. El top-k dual puede incluir confusiones mortales.',
    studioCta: 'Estudiar confusiones mortales',
  }
}

/** product_unlock always false — SSOT for contract tests. */
export const DEADLY_TOPK_PRODUCT_UNLOCK = false as const
