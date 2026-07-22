import { describe, expect, it } from 'vitest'
import {
  appendHistory,
  buildHistoryEntry,
  entryMode,
  exportHistoryJson,
  filterHistoryByMode,
  loadHistory,
  parseTagsInput,
  summarizeHistory,
  toGateSummary,
  updateHistoryNotebook,
  type HistoryEntry,
  type StorageLike,
} from './observationHistory'
import {
  buildExpertHandoff,
  expertReviewPath,
  saveHandoffDraft,
  loadHandoffDraft,
  type StorageLike as HandoffStorage,
} from './expertHandoff'
import type { ClassificationResult } from '../api/types'

function memStorage(): StorageLike & HandoffStorage & { store: Record<string, string> } {
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
    // B-38: export includes honesty fields (soft-migrated)
    expect(parsed.entries[0].mode).toBeTruthy()
    expect('gate_summary' in parsed.entries[0]).toBe(true)
  })
})

describe('history mode/gate/locale (B-38)', () => {
  it('buildHistoryEntry stamps mode, gate_summary, locale', () => {
    const result = {
      request_id: 'r-real',
      decision: 'accepted',
      predictions: [{ species: 'Boletus edulis', confidence: 0.9, common_name: null, edibility: null }],
      rejection_reason: null,
      processing_time_ms: 12,
      observation_id: null,
      safety_level: 'unsafe_to_consume',
      missing_evidence: [],
      warnings: [],
      quality_warnings: [],
      dangerous_lookalikes: [],
      questions_for_user: [],
      model_stack: null,
      open_set_reason: null,
      recommend_human_review: false,
      final_warning: 'No consumas',
      mode: 'real',
      is_mock_stack: false,
      locale: 'es',
      quality_gate: {
        species_id_allowed: true,
        metrics_acceptable: true,
        block_enabled: true,
        reason: 'ok',
        reason_code: 'gates_passed',
        verdict: 'ACCEPTABLE',
      },
    } satisfies ClassificationResult

    const entry = buildHistoryEntry({
      result,
      previews: ['blob:x'],
      view_types: ['gills'],
    })
    expect(entry.mode).toBe('real')
    expect(entry.locale).toBe('es')
    expect(entry.gate_summary?.species_id_allowed).toBe(true)
    expect(entry.gate_summary?.metrics_acceptable).toBe(true)
    expect(entry.gate_summary?.reason_code).toBe('gates_passed')
  })

  it('soft-migrates legacy entries without top-level mode', () => {
    const storage = memStorage()
    const legacy: HistoryEntry = {
      id: 'legacy-1',
      timestamp: 1,
      previews: [],
      result: {
        request_id: 'legacy-1',
        decision: 'rejected',
        predictions: [],
        is_mock_stack: true,
        locale: 'ca',
        quality_gate: {
          species_id_allowed: false,
          metrics_acceptable: false,
          block_enabled: true,
          reason: 'map low',
          reason_code: 'map_below',
          verdict: 'UNACCEPTABLE',
        } as HistoryEntry['result']['quality_gate'],
      },
    }
    storage.setItem('visionsetil_history', JSON.stringify([legacy]))
    const loaded = loadHistory(storage)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].mode).toBe('mock')
    expect(entryMode(loaded[0])).toBe('mock')
    expect(loaded[0].locale).toBe('ca')
    expect(loaded[0].gate_summary).toEqual({
      species_id_allowed: false,
      metrics_acceptable: false,
      block_enabled: true,
      reason_code: 'map_below',
      verdict: 'UNACCEPTABLE',
    })
    // write-back persists migrated shape (mode + gate_summary + locale)
    const reloaded = JSON.parse(storage.store['visionsetil_history']) as HistoryEntry[]
    expect(reloaded[0].mode).toBe('mock')
    expect(reloaded[0].locale).toBe('ca')
    expect(reloaded[0].gate_summary?.reason_code).toBe('map_below')
    expect(reloaded[0].gate_summary?.species_id_allowed).toBe(false)

    // second load is stable (no perpetual remigrate)
    const snapshot = storage.store['visionsetil_history']
    loadHistory(storage)
    expect(storage.store['visionsetil_history']).toBe(snapshot)
  })

  it('empty result.locale does not cause perpetual migrate write-back', () => {
    const storage = memStorage()
    const legacy: HistoryEntry = {
      id: 'legacy-empty-locale',
      timestamp: 2,
      previews: [],
      // pre-migrated mode + gate_summary null, but empty-string locale on result only
      mode: 'real',
      gate_summary: null,
      result: {
        request_id: 'legacy-empty-locale',
        decision: 'accepted',
        predictions: [],
        is_mock_stack: false,
        locale: '',
      },
    }
    storage.setItem('visionsetil_history', JSON.stringify([legacy]))
    const before = storage.store['visionsetil_history']
    const loaded = loadHistory(storage)
    expect(loaded[0].mode).toBe('real')
    expect(loaded[0].locale).toBeUndefined()
    // no rewrite when migrate would be a no-op for empty locale
    expect(storage.store['visionsetil_history']).toBe(before)
  })

  it('filters by mode and summarizes by_mode', () => {
    const a = buildHistoryEntry({
      result: {
        request_id: 'a',
        decision: 'accepted',
        predictions: [],
        mode: 'real',
        is_mock_stack: false,
      } as unknown as ClassificationResult,
      previews: [],
    })
    const b = buildHistoryEntry({
      result: {
        request_id: 'b',
        decision: 'rejected',
        predictions: [],
        mode: 'blocked',
        is_mock_stack: false,
      } as unknown as ClassificationResult,
      previews: [],
    })
    const c = buildHistoryEntry({
      result: {
        request_id: 'c',
        decision: 'accepted',
        predictions: [],
        mode: 'mock',
        is_mock_stack: true,
      } as unknown as ClassificationResult,
      previews: [],
    })
    const all = [a, b, c]
    expect(filterHistoryByMode(all, 'all')).toHaveLength(3)
    expect(filterHistoryByMode(all, 'real').map((e) => e.id)).toEqual(['a'])
    expect(filterHistoryByMode(all, 'blocked').map((e) => e.id)).toEqual(['b'])
    expect(filterHistoryByMode(all, 'mock').map((e) => e.id)).toEqual(['c'])
    const s = summarizeHistory(all)
    expect(s.by_mode).toEqual({ real: 1, mock: 1, blocked: 1 })
  })

  it('toGateSummary returns null for invalid payloads', () => {
    expect(toGateSummary(null)).toBeNull()
    expect(toGateSummary({})).toBeNull()
    expect(
      toGateSummary({
        species_id_allowed: false,
        metrics_acceptable: false,
      }),
    ).toEqual({
      species_id_allowed: false,
      metrics_acceptable: false,
      block_enabled: undefined,
      reason_code: undefined,
      verdict: undefined,
    })
  })

  it('appendHistory stamps honesty fields', () => {
    const storage = memStorage()
    const next = appendHistory(
      {
        id: 'x',
        timestamp: Date.now(),
        previews: [],
        result: {
          request_id: 'x',
          decision: 'accepted',
          predictions: [],
          mode: 'blocked',
          locale: 'ca',
          quality_gate: {
            species_id_allowed: false,
            metrics_acceptable: false,
            block_enabled: true,
            reason: 'map',
            reason_code: 'map_below',
            verdict: 'UNACCEPTABLE',
          },
        },
      },
      storage,
    )
    expect(next[0].mode).toBe('blocked')
    expect(next[0].locale).toBe('ca')
    expect(next[0].gate_summary?.reason_code).toBe('map_below')
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
