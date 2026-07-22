/**
 * Local observation history store (iNaturalist-style personal collection lite).
 * Pure helpers + localStorage I/O for unit tests with injectable storage.
 */

export type HistoryPrediction = {
  species: string
  confidence: number
  edibility?: string | null
  common_name?: string | null
}

/** Minimal classification shape required for history (satisfied by ClassificationResult). */
export type HistoryClassification = {
  request_id: string
  decision: 'accepted' | 'rejected' | string
  safety_level?: string
  predictions: HistoryPrediction[]
  recommend_human_review?: boolean
  dangerous_lookalikes?: string[]
  rejection_reason?: string | null
  processing_time_ms?: number
}

export type HistoryEntry<T extends HistoryClassification = HistoryClassification> = {
  id: string
  timestamp: number
  previews: string[]
  result: T
  view_types?: string[]
  /** Field notebook: free-text notes (local only) */
  notes?: string
  /** Field notebook: user tags */
  tags?: string[]
}

export const HISTORY_KEY = 'visionsetil_history'
export const MAX_HISTORY = 30

export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function loadHistory(storage: StorageLike = localStorage): HistoryEntry[] {
  try {
    const raw = storage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HistoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveHistory(entries: HistoryEntry[], storage: StorageLike = localStorage): void {
  const trimmed = entries.slice(0, MAX_HISTORY)
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
  } catch {
    storage.setItem(HISTORY_KEY, JSON.stringify(trimmed.slice(0, 5)))
  }
}

export function appendHistory(
  entry: HistoryEntry,
  storage: StorageLike = localStorage,
): HistoryEntry[] {
  const next = [entry, ...loadHistory(storage)].slice(0, MAX_HISTORY)
  saveHistory(next, storage)
  return next
}

export function clearHistoryStore(storage: StorageLike = localStorage): void {
  storage.removeItem(HISTORY_KEY)
}

export type HistorySummary = {
  total: number
  accepted: number
  rejected: number
  need_review: number
  latest_species: string | null
}

export function summarizeHistory(entries: HistoryEntry[]): HistorySummary {
  let accepted = 0
  let rejected = 0
  let need_review = 0
  for (const e of entries) {
    if (e.result.decision === 'accepted') accepted += 1
    if (e.result.decision === 'rejected') rejected += 1
    if (e.result.recommend_human_review) need_review += 1
  }
  return {
    total: entries.length,
    accepted,
    rejected,
    need_review,
    latest_species: entries[0]?.result.predictions?.[0]?.species ?? null,
  }
}

export function entriesNeedingReview(entries: HistoryEntry[]): HistoryEntry[] {
  return entries.filter(
    (e) =>
      e.result.recommend_human_review ||
      e.result.decision === 'rejected' ||
      (e.result.dangerous_lookalikes && e.result.dangerous_lookalikes.length > 0),
  )
}

/** Update notebook fields on an existing history entry (immutable). */
export function updateHistoryNotebook(
  entries: HistoryEntry[],
  id: string,
  patch: { notes?: string; tags?: string[] },
): HistoryEntry[] {
  return entries.map((e) => {
    if (e.id !== id) return e
    return {
      ...e,
      notes: patch.notes !== undefined ? patch.notes : e.notes,
      tags: patch.tags !== undefined ? patch.tags : e.tags,
    }
  })
}

export function saveNotebookFields(
  id: string,
  patch: { notes?: string; tags?: string[] },
  storage: StorageLike = localStorage,
): HistoryEntry[] {
  const next = updateHistoryNotebook(loadHistory(storage), id, patch)
  saveHistory(next, storage)
  return next
}

/**
 * Export history as portable JSON (field notebook).
 * Strips huge data-URLs if over soft limit to keep export usable.
 */
export function exportHistoryJson(
  entries: HistoryEntry[],
  options: { includePreviews?: boolean; maxPreviewChars?: number } = {},
): string {
  const includePreviews = options.includePreviews ?? true
  const maxPreviewChars = options.maxPreviewChars ?? 200_000
  const payload = {
    exported_at: new Date().toISOString(),
    product: 'VisionSetil',
    policy: 'orientation_only_unsafe_to_consume',
    disclaimer:
      'Exportación educativa del cuaderno de campo local. No es permiso de consumo ni certificado de identificación.',
    count: entries.length,
    entries: entries.map((e) => {
      let previews = includePreviews ? e.previews || [] : []
      const joined = previews.join('').length
      if (joined > maxPreviewChars) {
        previews = previews.map((p) =>
          p.startsWith('data:') ? `[data-url omitted, ${p.length} chars]` : p,
        )
      }
      return {
        id: e.id,
        timestamp: e.timestamp,
        iso_time: new Date(e.timestamp).toISOString(),
        view_types: e.view_types || [],
        notes: e.notes || '',
        tags: e.tags || [],
        previews,
        result: e.result,
      }
    }),
  }
  return JSON.stringify(payload, null, 2)
}

export function parseTagsInput(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[,;#]+/)) {
    const t = part.trim().toLowerCase()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out.slice(0, 20)
}
