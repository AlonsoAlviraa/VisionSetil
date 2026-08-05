/**
 * UX-02 — Result hierarchy field→UI map + open-set contracts.
 * Reuse shipped testids; never rename identify-result-image-compare.
 * Source-order contracts (no RTL) for ResultCard + IdentifyPage.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ClassificationResult } from '../api/types'
import { isOpenSetRejected } from './classifyMode'
import { decisionLabel } from './decisionLabels'
import {
  DEADLY_TOPK_PRODUCT_UNLOCK,
  shouldShowDeadlyTopkCoach,
} from './deadlyTopkHonesty'
import { pickComparePair } from '../components/ImageCompare'

const root = resolve(__dirname, '../..')

function readSrc(rel: string) {
  return readFileSync(resolve(root, 'src', rel), 'utf8')
}

/** Index of first occurrence of data-testid="id" (or template) in source. */
function testidIndex(src: string, id: string): number {
  const patterns = [
    `data-testid="${id}"`,
    `data-testid={'${id}'}`,
    `data-testid={\`${id}\`}`,
    `testId="${id}"`,
    `testId = '${id}'`,
  ]
  let best = -1
  for (const p of patterns) {
    const i = src.indexOf(p)
    if (i >= 0 && (best < 0 || i < best)) best = i
  }
  return best
}

function orderOf(src: string, ids: string[]): number[] {
  return ids.map((id) => testidIndex(src, id))
}

function fixtureAcceptedDeadly(): ClassificationResult {
  return {
    request_id: 'ux02-accepted-deadly',
    decision: 'accepted',
    predictions: [
      {
        species: 'Amanita phalloides',
        common_name: 'Cicuta verde',
        confidence: 0.62,
        edibility: 'deadly',
        risk_level: 'deadly',
        slug: 'amanita-phalloides',
      },
      {
        species: 'Amanita citrina',
        common_name: null,
        confidence: 0.18,
        edibility: 'poisonous',
      },
      {
        species: 'Amanita muscaria',
        common_name: null,
        confidence: 0.12,
        edibility: 'poisonous',
      },
    ],
    rejection_reason: null,
    processing_time_ms: 120,
    observation_id: 1,
    safety_level: 'critical',
    missing_evidence: ['gills underside missing'],
    warnings: [],
    quality_warnings: [],
    dangerous_lookalikes: ['Galerina marginata'],
    questions_for_user: ['Did you photograph the base/volva?'],
    model_stack: null,
    open_set_reason: null,
    recommend_human_review: true,
    final_warning: 'Orientation only — never consume.',
    mode: 'real',
    is_mock_stack: false,
    quality_gate: {
      species_id_allowed: true,
      metrics_acceptable: true,
      block_enabled: true,
      reason: 'ok',
      reason_code: 'gates_passed',
      verdict: 'ACCEPTABLE',
    },
  }
}

function fixtureRejectedOpenSet(): ClassificationResult {
  return {
    request_id: 'ux02-rejected-os',
    decision: 'rejected',
    predictions: [
      {
        species: 'Russula cyanoxantha',
        common_name: null,
        confidence: 0.33,
        edibility: 'unknown',
      },
    ],
    rejection_reason: 'low_margin',
    processing_time_ms: 90,
    observation_id: 2,
    safety_level: 'caution',
    missing_evidence: ['front profile'],
    warnings: [],
    quality_warnings: ['blur'],
    dangerous_lookalikes: [],
    questions_for_user: [],
    model_stack: null,
    open_set_reason: 'low_margin',
    recommend_human_review: true,
    final_warning: 'Orientation only — never consume.',
    mode: 'real',
    is_mock_stack: false,
    quality_gate: {
      species_id_allowed: true,
      metrics_acceptable: true,
      block_enabled: true,
      reason: 'ok',
      reason_code: 'gates_passed',
      verdict: 'ACCEPTABLE',
    },
  }
}

describe('UX-02 result hierarchy contracts', () => {
  const card = () => readSrc('components/ResultCard.tsx')
  const page = () => readSrc('pages/IdentifyPage.tsx')
  const banner = () => readSrc('components/ResultModeBanner.tsx')

  it('ships field→UI testids (SSOT) — never invent result-image-compare', () => {
    const c = card()
    const p = page()
    const b = banner()
    const requiredCard = [
      'result-mode-banner', // via ResultModeBanner import/render
      'result-orientation-sticky',
      'decision-banner',
      'decision-reject-reason',
      'predictions-list',
      'evidence-questions-panel',
      'missing-evidence-list',
      'questions-for-user-list',
      'cta-expert-handoff',
      'result-deadly-topk-coach',
      'result-deadly-topk-studio',
      'lookalike-next-actions',
      'cta-lookalike-studio-from-result',
    ]
    for (const id of requiredCard) {
      if (id === 'result-mode-banner') {
        expect(b).toMatch(/data-testid="result-mode-banner"/)
        expect(c).toMatch(/ResultModeBanner/)
        continue
      }
      expect(c, id).toMatch(new RegExp(`data-testid="${id}"|data-testid=\\{\`${id}`))
    }
    expect(p).toMatch(/data-testid="identify-result"/)
    expect(p).toMatch(/identify-result-image-compare/)
    expect(p).toMatch(/identify-result-lookalikes/)
    expect(p).toMatch(/identify-result-edu/)
    expect(p).toMatch(/identify-result-notebook/)
    expect(p).toMatch(/identify-orientation-sticky/)
    // Forbid bare alias; allow identify-result-image-compare SSOT id
    expect((c + p).replaceAll('identify-result-image-compare', '')).not.toMatch(
      /result-image-compare/,
    )
  })

  it('DOM source order: safety → decision → predictions → evidence → deadly → lookalikes', () => {
    const c = card()
    const ids = [
      'result-orientation-sticky',
      'decision-banner',
      'predictions-list',
      'evidence-questions-panel',
      'result-deadly-topk-coach',
      'lookalike-next-actions',
    ]
    const idxs = orderOf(c, ids)
    for (let i = 0; i < idxs.length; i++) {
      expect(idxs[i], ids[i]).toBeGreaterThanOrEqual(0)
      if (i > 0) {
        expect(idxs[i], `${ids[i - 1]} before ${ids[i]}`).toBeGreaterThan(idxs[i - 1])
      }
    }
    // evidence before lookalike layer toggle body content marker
    const evidenceIdx = testidIndex(c, 'evidence-questions-panel')
    const lookalikeListMarker = c.indexOf('lookalikes-warning')
    expect(evidenceIdx).toBeGreaterThan(0)
    expect(lookalikeListMarker).toBeGreaterThan(evidenceIdx)
  })

  it('open-set rejected: data-decision + reject reason + no top-match as final', () => {
    const c = card()
    expect(c).toMatch(/data-decision=\{isRejected \? 'rejected' : 'accepted'\}/)
    expect(c).toMatch(/data-testid="decision-reject-reason"/)
    expect(c).toMatch(/predictions--rejected|data-branch="rejected"/)
    expect(c).toMatch(/prediction-item--unreliable|data-unreliable/)
    // Rejected path must not apply top-match class
    const rejectedSliceStart = c.indexOf('data-branch="rejected"')
    expect(rejectedSliceStart).toBeGreaterThan(0)
    const rejectedSlice = c.slice(rejectedSliceStart, rejectedSliceStart + 1800)
    expect(rejectedSlice).not.toMatch(/top-match/)
    expect(rejectedSlice).toMatch(/No es respuesta final|notFinalAnswer|unreliable/i)

    const r = fixtureRejectedOpenSet()
    expect(r.decision).toBe('rejected')
    expect(isOpenSetRejected(r)).toBe(true)
    expect(decisionLabel(r.decision, 'es')).toMatch(/Sin ID|fiable/i)
  })

  it('accepted deadly: coach + RiskChip boost wiring; never product_unlock/confetti', () => {
    const c = card()
    expect(c).toMatch(/result-deadly-topk-coach/)
    expect(c).toMatch(/shouldShowDeadlyTopkCoach|deadlyTopkCoachCopy/)
    expect(c).toMatch(/RiskChip/)
    expect(c).toMatch(/boost=\{boostJoinRisk\}|boostJoinRisk/)
    // No confetti components/classes; policy comment mentioning "no confetti" is fine
    expect(c).not.toMatch(/className=\{?["'`][^"'`]*confetti/i)
    expect(c).not.toMatch(/from ['"][^'"]*confetti/i)
    expect(c).not.toMatch(/¡Excelente!/)
    expect(c).not.toMatch(/safe to eat/i)
    expect(c).not.toMatch(/comestible OK/i)
    expect(DEADLY_TOPK_PRODUCT_UNLOCK).toBe(false)

    const r = fixtureAcceptedDeadly()
    expect(shouldShowDeadlyTopkCoach(r)).toBe(true)
    expect(r.predictions[0].edibility).toBe('deadly')
  })

  it('rejected primary CTA = add view; accepted sticky new analysis; single primary rule', () => {
    const p = page()
    const c = card()
    expect(c).toMatch(/decision-retry-views|addViewRetry/)
    expect(p).toMatch(/identify-sticky-add-view/)
    expect(p).toMatch(/identify-sticky-new/)
    expect(p).toMatch(/decision === 'rejected'/)
    // Classify Button isLoading wired (UX-02 may include; avoids thrash with UX-04)
    expect(p).toMatch(/isLoading=\{loading\}/)
    expect(readSrc('components/ui/Button.tsx')).toMatch(/isLoading/)
  })

  it('ImageCompare ≥2 previews uses shipped testid', () => {
    const pair = pickComparePair(['gills', 'front'], ['a.jpg', 'b.jpg'])
    expect(pair).not.toBeNull()
    const img = readSrc('components/ImageCompare.tsx')
    expect(img).toMatch(/identify-result-image-compare/)
    expect(page()).toMatch(/pickComparePair/)
  })

  it('helpers reused: decisionLabels, openSetReason, deadlyTopkHonesty, riskLabels', () => {
    const c = card()
    expect(c).toMatch(/from '\.\.\/lib\/decisionLabels'|decisionLabel/)
    expect(c).toMatch(/openSetReason/)
    expect(c).toMatch(/deadlyTopkHonesty/)
    expect(c).toMatch(/resolveJoinRisk|isSevereRisk/)
  })
})
