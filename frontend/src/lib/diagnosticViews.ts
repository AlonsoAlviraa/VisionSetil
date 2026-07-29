/**
 * Deadly lookalike diagnostic views — educational coaching for multi-view capture.
 * Sourced from multiview_diagnostic_map.json. Never forage permission.
 */
import diagMap from '../data/multiview_diagnostic_map.json'
import type { CanonicalView } from './multiViewSlots'
import { CANONICAL_VIEWS } from './multiViewSlots'
import { canonicalTaxonName } from './taxonSynonyms'

export type DiagnosticPair = {
  id: string
  taxa: string[]
  why: string
  critical_views: string[]
}

/** Pair-specific coach for a lookalike mate (ResultCard / History). */
export type LookalikePairDiagnostic = {
  pair_id: string
  taxa: string[]
  why: string
  critical_views: CanonicalView[]
  /** Source map section — educational only. */
  source: 'classic_pairs' | 'deadly_diagnostic'
}

type DiagMap = {
  classic_pairs?: DiagnosticPair[]
  deadly_diagnostic?: {
    priority_views?: string[]
    view_weights?: Record<string, number>
    n_pairs_involving_deadly?: number
    pairs?: DiagnosticPair[]
    coach_es?: string
    coach_en?: string
    policy?: string
  }
  view_weights?: Record<string, number>
  policy?: string
}

const MAP = diagMap as DiagMap

export function isCanonicalViewName(v: string): v is CanonicalView {
  return (CANONICAL_VIEWS as readonly string[]).includes(v)
}

function normalizeTaxonKey(name: string): string {
  return canonicalTaxonName(name || '')
    .trim()
    .toLowerCase()
}

function pairTaxaKeys(pair: DiagnosticPair): string[] {
  return (pair.taxa || []).map(normalizeTaxonKey).filter(Boolean)
}

function toCanonicalViews(raw: string[] | undefined): CanonicalView[] {
  const out: CanonicalView[] = []
  for (const v of raw || []) {
    if (isCanonicalViewName(v) && !out.includes(v)) out.push(v)
  }
  return out
}

/** Priority views for deadly confusions (gills/front/detail first). */
export function deadlyPriorityViews(): CanonicalView[] {
  const raw = MAP.deadly_diagnostic?.priority_views || ['gills', 'front', 'detail']
  const out: CanonicalView[] = []
  for (const v of raw) {
    if (isCanonicalViewName(v) && !out.includes(v)) out.push(v)
  }
  for (const v of CANONICAL_VIEWS) {
    if (!out.includes(v)) out.push(v)
  }
  return out
}

export function deadlyCoach(locale?: string): string {
  const en = (locale || 'es').toLowerCase().startsWith('en')
  const d = MAP.deadly_diagnostic
  if (en) {
    return (
      d?.coach_en ||
      'For deadly confusions: prioritize gills, full profile/stem, and base/volva/ring. Extra photos without those views are not enough.'
    )
  }
  return (
    d?.coach_es ||
    'Para confusiones con mortales: prioriza láminas, perfil/pie y base/volva/anillo. Multi-foto sin esas vistas no basta.'
  )
}

/** Classic deadly-involved pairs (educational). */
export function deadlyDiagnosticPairs(): DiagnosticPair[] {
  return (MAP.deadly_diagnostic?.pairs || []) as DiagnosticPair[]
}

/** Classic educational pairs (may include non-deadly confusions). */
export function classicDiagnosticPairs(): DiagnosticPair[] {
  return (MAP.classic_pairs || []) as DiagnosticPair[]
}

/**
 * Union of classic + deadly diagnostic pairs, deduped by id
 * (deadly_diagnostic overwrites classic when same id).
 */
export function allDiagnosticPairs(): Array<
  DiagnosticPair & { source: LookalikePairDiagnostic['source'] }
> {
  const byId = new Map<
    string,
    DiagnosticPair & { source: LookalikePairDiagnostic['source'] }
  >()
  for (const p of classicDiagnosticPairs()) {
    if (!p?.id) continue
    byId.set(p.id, { ...p, source: 'classic_pairs' })
  }
  for (const p of deadlyDiagnosticPairs()) {
    if (!p?.id) continue
    byId.set(p.id, { ...p, source: 'deadly_diagnostic' })
  }
  return Array.from(byId.values())
}

/**
 * Find educational pair matching both taxa (order-independent).
 * Prefer deadly_diagnostic source when both classic and deadly exist.
 */
export function findDiagnosticPair(
  taxonA: string,
  taxonB: string,
): LookalikePairDiagnostic | null {
  const a = normalizeTaxonKey(taxonA)
  const b = normalizeTaxonKey(taxonB)
  if (!a || !b || a === b) return null

  let best: LookalikePairDiagnostic | null = null
  for (const p of allDiagnosticPairs()) {
    const keys = pairTaxaKeys(p)
    if (keys.includes(a) && keys.includes(b)) {
      const coach: LookalikePairDiagnostic = {
        pair_id: p.id,
        taxa: p.taxa || [],
        why: p.why || '',
        critical_views: toCanonicalViews(p.critical_views),
        source: p.source,
      }
      if (coach.critical_views.length === 0) {
        coach.critical_views = deadlyPriorityViews().slice(0, 3)
      }
      if (!best || (best.source !== 'deadly_diagnostic' && coach.source === 'deadly_diagnostic')) {
        best = coach
      }
    }
  }
  return best
}

/**
 * Resolve pair-specific critical_views for a lookalike mate given top predictions.
 * Tries each prediction × lookalike; first deadly hit wins, else first classic hit.
 * Never invents pairs — map miss returns null (caller may show generic deadly coach).
 */
export function diagnosticForLookalikeMate(
  predictionTaxa: string[] | null | undefined,
  lookalikeName: string,
): LookalikePairDiagnostic | null {
  const mate = (lookalikeName || '').trim()
  if (!mate) return null
  let fallback: LookalikePairDiagnostic | null = null
  for (const pred of predictionTaxa || []) {
    if (!pred) continue
    const hit = findDiagnosticPair(pred, mate)
    if (!hit) continue
    if (hit.source === 'deadly_diagnostic') return hit
    if (!fallback) fallback = hit
  }
  return fallback
}

/** Whether a wizard slot is critical for deadly discrimination coaching. */
export function isDeadlyCriticalView(view: CanonicalView): boolean {
  const pri = deadlyPriorityViews().slice(0, 3)
  return pri.includes(view)
}

/**
 * Missing critical views for deadly coaching given current filled slots.
 * Soft guidance only — never blocks submit alone.
 */
export function missingDeadlyCriticalViews(
  filled: readonly string[],
): CanonicalView[] {
  const filledSet = new Set(filled)
  return deadlyPriorityViews()
    .slice(0, 3)
    .filter((v) => !filledSet.has(v))
}

/**
 * Pair-specific missing critical views vs currently filled wizard slots.
 * Soft guidance — educational only.
 */
export function missingPairCriticalViews(
  pair: LookalikePairDiagnostic | null | undefined,
  filled: readonly string[] = [],
): CanonicalView[] {
  if (!pair?.critical_views?.length) return []
  const filledSet = new Set(filled)
  return pair.critical_views.filter((v) => !filledSet.has(v))
}

export function diagnosticPolicy(): string {
  return MAP.policy || MAP.deadly_diagnostic?.policy || 'orientation_only_never_consume'
}
