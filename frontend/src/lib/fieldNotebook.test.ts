import { describe, expect, it } from 'vitest'
import {
  exportHistoryJson,
  parseTagsInput,
  updateHistoryNotebook,
  type HistoryEntry,
} from './observationHistory'
import {
  buildExpertHandoff,
  expertReviewPath,
  saveHandoffDraft,
  loadHandoffDraft,
  type StorageLike,
} from './expertHandoff'
import type { ClassificationResult } from '../api/types'

function memStorage(): StorageLike & { store: Record<string, string> } {
  const store: Record<string, string> = {}
  return {
    store,
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      store[k] = v
    },
    removeItem: (k) => {
      delete store[k]
    },
  }
}

const sampleEntry = (): HistoryEntry => ({
  id: 'h1',
  timestamp: Date.now(),
  previews: ['blob:preview-1'],
  view_types: ['gills', 'front'],
  result: {
    request_id: 'req1',
    decision: 'accepted',
    predictions: [{ species: 'Amanita phalloides', confidence: 0.7, edibility: 'deadly' }],
    recommend_human_review: true,
    dangerous_lookalikes: ['Amanita muscaria'],
  },
})

describe('field notebook', () => {
  it('parses tags and updates notebook fields', () => {
    expect(parseTagsInput('Pinar, Otoño; #dudosa')).toEqual(['pinar', 'otoño', 'dudosa'])
    const updated = updateHistoryNotebook([sampleEntry()], 'h1', {
      notes: 'Bajo pino, olor a tierra',
      tags: ['pinar', 'otono'],
    })
    expect(updated[0].notes).toMatch(/pino/)
    expect(updated[0].tags).toContain('pinar')
  })

  it('exports JSON with policy disclaimer and entry notes', () => {
    const entries = updateHistoryNotebook([sampleEntry()], 'h1', {
      notes: 'Notas de campo',
      tags: ['campo'],
    })
    const json = exportHistoryJson(entries)
    const parsed = JSON.parse(json)
    expect(parsed.policy).toBe('orientation_only_unsafe_to_consume')
    expect(parsed.disclaimer.toLowerCase()).toMatch(/consumo/)
    expect(parsed.entries[0].notes).toBe('Notas de campo')
    expect(parsed.entries[0].tags).toContain('campo')
    expect(parsed.entries[0].view_types).toEqual(['gills', 'front'])
  })
})

describe('expert handoff', () => {
  it('packages multi-view evidence and persists draft', () => {
    const result = {
      request_id: 'abc',
      decision: 'rejected',
      predictions: [{ species: 'Unknown fungi', confidence: 0.2, common_name: null, edibility: null }],
      rejection_reason: 'open-set',
      processing_time_ms: 10,
      observation_id: 42,
      safety_level: 'unsafe_to_consume',
      missing_evidence: ['gills'],
      warnings: [],
      quality_warnings: [],
      dangerous_lookalikes: ['Amanita phalloides'],
      questions_for_user: [],
      model_stack: null,
      open_set_reason: 'low margin',
      recommend_human_review: true,
      final_warning: 'No consumas',
    } satisfies ClassificationResult

    const draft = buildExpertHandoff({
      result,
      viewTypes: ['gills', 'front'],
      previews: ['blob:a', 'blob:b'],
      notes: 'Sospecha de lookalike mortal',
    })
    expect(draft.view_types).toEqual(['gills', 'front'])
    expect(draft.preview_count).toBe(2)
    expect(draft.observation_id).toBe(42)
    expect(draft.safety_disclaimer.toLowerCase()).toMatch(/consumo/)
    expect(draft.dangerous_lookalikes).toContain('Amanita phalloides')
    // Legacy result without mode → resolveMode fallback (mock when is_mock_stack unknown)
    expect(draft.mode).toBe('mock')
    expect(draft.quality_gate).toBeNull()

    const storage = memStorage()
    saveHandoffDraft(draft, storage)
    const loaded = loadHandoffDraft(storage)
    expect(loaded?.id).toBe(draft.id)
    expect(expertReviewPath(draft.id)).toContain('handoff=')
  })

  it('snapshots mode + dual quality_gate when present (B-37)', () => {
    const result = {
      request_id: 'gated',
      decision: 'rejected',
      predictions: [],
      rejection_reason: 'model_quality_gate_failed: map_below',
      processing_time_ms: 12,
      observation_id: null,
      safety_level: 'unsafe_to_consume',
      missing_evidence: [],
      warnings: ['GATE'],
      quality_warnings: [],
      dangerous_lookalikes: [],
      questions_for_user: [],
      model_stack: null,
      open_set_reason: null,
      recommend_human_review: true,
      final_warning: 'No consumas',
      mode: 'blocked' as const,
      is_mock_stack: false,
      quality_gate: {
        species_id_allowed: false,
        metrics_acceptable: false,
        block_enabled: true,
        reason: 'MAP@3 below threshold',
        reason_code: 'map_below' as const,
        verdict: 'UNACCEPTABLE' as const,
        test_map_at_3: 0.05,
        safety_recall_deadly: 0.4,
      },
    } satisfies ClassificationResult

    const draft = buildExpertHandoff({ result })
    expect(draft.mode).toBe('blocked')
    expect(draft.quality_gate?.metrics_acceptable).toBe(false)
    expect(draft.quality_gate?.species_id_allowed).toBe(false)
    expect(draft.quality_gate?.verdict).toBe('UNACCEPTABLE')
    expect(draft.quality_gate?.reason_code).toBe('map_below')

    const storage = memStorage()
    saveHandoffDraft(draft, storage)
    const loaded = loadHandoffDraft(storage)
    expect(loaded?.mode).toBe('blocked')
    expect(loaded?.quality_gate?.species_id_allowed).toBe(false)
    expect(loaded?.quality_gate?.metrics_acceptable).toBe(false)
  })

  it('soft-loads old drafts missing mode/quality_gate', () => {
    const storage = memStorage()
    const legacy = {
      id: 'handoff_legacy',
      created_at: 1,
      request_id: null,
      observation_id: null,
      decision: 'accepted',
      top_species: 'Boletus edulis',
      top_confidence: 0.8,
      safety_level: 'caution',
      view_types: [],
      preview_count: 0,
      preview_urls: [],
      missing_evidence: [],
      dangerous_lookalikes: [],
      rejection_reason: null,
      recommend_human_review: false,
      notes: '',
      safety_disclaimer: 'x',
      // intentionally no mode / quality_gate
    }
    storage.setItem('visionsetil_expert_handoff_draft', JSON.stringify(legacy))
    const loaded = loadHandoffDraft(storage)
    expect(loaded?.id).toBe('handoff_legacy')
    expect(loaded?.mode).toBeUndefined()
    expect(loaded?.quality_gate).toBeUndefined()
    expect(loaded?.top_species).toBe('Boletus edulis')
  })

  it('stores quality_gate as null when payload is malformed (B-37)', () => {
    const result = {
      request_id: 'bad-gate',
      decision: 'accepted',
      predictions: [
        { species: 'Boletus edulis', confidence: 0.9, common_name: null, edibility: 'edible' },
      ],
      rejection_reason: null,
      processing_time_ms: 5,
      observation_id: null,
      safety_level: 'caution',
      missing_evidence: [],
      warnings: [],
      quality_warnings: [],
      dangerous_lookalikes: [],
      questions_for_user: [],
      model_stack: null,
      open_set_reason: null,
      recommend_human_review: false,
      final_warning: '',
      mode: 'real' as const,
      is_mock_stack: false,
      // incomplete — missing dual signals / verdict
      quality_gate: { reason: 'oops', reason_code: 'unset' } as ClassificationResult['quality_gate'],
    } satisfies ClassificationResult

    const draft = buildExpertHandoff({ result })
    expect(draft.mode).toBe('real')
    expect(draft.quality_gate).toBeNull()
  })

  it('snapshots dual-signal disagreement (metrics OK, ID blocked)', () => {
    const result = {
      request_id: 'disagree',
      decision: 'rejected',
      predictions: [],
      rejection_reason: 'model_quality_gate_failed: policy',
      processing_time_ms: 8,
      observation_id: null,
      safety_level: 'unsafe_to_consume',
      missing_evidence: [],
      warnings: [],
      quality_warnings: [],
      dangerous_lookalikes: [],
      questions_for_user: [],
      model_stack: null,
      open_set_reason: null,
      recommend_human_review: true,
      final_warning: '',
      mode: 'blocked' as const,
      is_mock_stack: false,
      quality_gate: {
        // Dual honesty: metrics can pass while serve policy blocks ID
        metrics_acceptable: true,
        species_id_allowed: false,
        block_enabled: true,
        reason: 'policy block despite metrics',
        reason_code: 'unset' as const,
        verdict: 'ACCEPTABLE' as const,
      },
    } satisfies ClassificationResult

    const draft = buildExpertHandoff({ result })
    expect(draft.mode).toBe('blocked')
    expect(draft.quality_gate?.metrics_acceptable).toBe(true)
    expect(draft.quality_gate?.species_id_allowed).toBe(false)
    expect(draft.quality_gate?.verdict).toBe('ACCEPTABLE')
  })
})
