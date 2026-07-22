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

    const storage = memStorage()
    saveHandoffDraft(draft, storage)
    const loaded = loadHandoffDraft(storage)
    expect(loaded?.id).toBe(draft.id)
    expect(expertReviewPath(draft.id)).toContain('handoff=')
  })
})
