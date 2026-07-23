/**
 * Local observation history store (iNaturalist-style personal collection lite).
 * Pure helpers + localStorage I/O for unit tests with injectable storage.
 *
 * B-38: stores product honesty mode, compact gate_summary, locale.
 * Soft-migrates pre-B-38 entries on load (derive mode / gate / locale).
 */

import type {
  ClassificationResult,
  ClassifyMode,
  QualityGatePayload,
} from '../api/types'
import { isClassifyMode, isQualityGatePayload, resolveMode } from './classifyMode'

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
  /** Optional honesty fields when result was stored post Phase B */
  mode?: ClassifyMode
  quality_gate?: QualityGatePayload
  locale?: string
  is_mock_stack?: boolean
  warnings?: string[]
  ml_notes?: string[]
  open_set_reason?: string | null
  observation_id?: number | null
  missing_evidence?: string[]
}

/**
 * Compact dual-signal gate snapshot for localStorage (B-38).
 * Full QualityGatePayload stays on result when available; this is filter/display SSOT.
 */
export type HistoryGateSummary = {
  species_id_allowed: boolean
  metrics_acceptable: boolean
  block_enabled?: boolean
  reason_code?: string
  verdict?: 'ACCEPTABLE' | 'UNACCEPTABLE'
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
  /** Product honesty mode (B-38); soft-migrated when missing */
  mode?: ClassifyMode
  /** Compact gate snapshot (B-38); null when unknown */
  gate_summary?: HistoryGateSummary | null
  /** Request locale echo (B-38) */
  locale?: string
}

export const HISTORY_KEY = 'visionsetil_history'
export const MAX_HISTORY = 30

export type HistoryModeFilter = 'all' | ClassifyMode

/** Local calendar window for notebook filters (D-10). */
export type HistoryDateFilter = 'all' | 'today' | '7d' | '30d'

export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Build compact gate summary from full payload (or null if absent/invalid). */
export function toGateSummary(
  gate: QualityGatePayload | unknown | null | undefined,
): HistoryGateSummary | null {
  if (!gate || typeof gate !== 'object') return null
  if (!isQualityGatePayload(gate)) {
    // Best-effort from partial objects (legacy / partial store)
    const g = gate as Record<string, unknown>
    if (
      typeof g.species_id_allowed !== 'boolean' ||
      typeof g.metrics_acceptable !== 'boolean'
    ) {
      return null
    }
    return {
      species_id_allowed: g.species_id_allowed,
      metrics_acceptable: g.metrics_acceptable,
      block_enabled: typeof g.block_enabled === 'boolean' ? g.block_enabled : undefined,
      reason_code: typeof g.reason_code === 'string' ? g.reason_code : undefined,
      verdict:
        g.verdict === 'ACCEPTABLE' || g.verdict === 'UNACCEPTABLE'
          ? g.verdict
          : undefined,
    }
  }
  return {
    species_id_allowed: gate.species_id_allowed,
    metrics_acceptable: gate.metrics_acceptable,
    block_enabled: gate.block_enabled,
    reason_code: gate.reason_code,
    verdict: gate.verdict,
  }
}

/**
 * Resolve effective mode for a history entry (top-level preferred, then result, then D-B20).
 */
export function entryMode(entry: HistoryEntry): ClassifyMode {
  if (isClassifyMode(entry.mode)) return entry.mode
  return resolveMode(entry.result as ClassificationResult)
}

/** Soft-migrate one raw history entry (non-destructive field enrichment). */
export function migrateHistoryEntry(raw: HistoryEntry): HistoryEntry {
  const result = raw.result || ({ request_id: '', decision: 'rejected', predictions: [] } as HistoryClassification)
  const mode = isClassifyMode(raw.mode)
    ? raw.mode
    : resolveMode(result as ClassificationResult)

  let gate_summary: HistoryGateSummary | null | undefined = raw.gate_summary
  if (gate_summary === undefined) {
    gate_summary = toGateSummary(
      result.quality_gate ?? (result as { quality_gate?: unknown }).quality_gate,
    )
  }

  let locale = raw.locale
  if (locale === undefined) {
    // Align with needsMigrate: only promote non-empty strings (empty → stay undefined)
    locale = resultLocaleToPromote(result)
  }

  return {
    ...raw,
    result,
    mode,
    gate_summary: gate_summary ?? null,
    locale,
  }
}

/** Non-empty string locale worth promoting from result → top-level (align with migrate). */
function resultLocaleToPromote(result: HistoryClassification | undefined): string | undefined {
  const fromResult = (result as { locale?: unknown } | undefined)?.locale
  return typeof fromResult === 'string' && fromResult.length > 0 ? fromResult : undefined
}

/**
 * True when soft-migrate would add fields not present on the raw entry.
 * Must stay aligned with migrateHistoryEntry so empty/corrupt locale never causes
 * a perpetual write-back loop (JSON omits undefined).
 */
function needsMigrate(raw: HistoryEntry): boolean {
  if (!isClassifyMode(raw.mode)) return true
  if (raw.gate_summary === undefined) return true
  // Only when migrate would actually stamp a non-empty locale (empty string is a no-op)
  if (raw.locale === undefined && resultLocaleToPromote(raw.result) !== undefined) {
    return true
  }
  return false
}

export function loadHistory(storage: StorageLike = localStorage): HistoryEntry[] {
  try {
    const raw = storage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HistoryEntry[]
    if (!Array.isArray(parsed)) return []

    let dirty = false
    const migrated = parsed.map((e) => {
      if (!e || typeof e !== 'object') return e
      if (needsMigrate(e)) {
        dirty = true
        return migrateHistoryEntry(e)
      }
      return e
    }).filter(Boolean) as HistoryEntry[]

    // Soft-persist migrated shape so subsequent loads are stable
    if (dirty) {
      try {
        saveHistory(migrated, storage)
      } catch {
        // ignore quota errors on migrate write-back
      }
    }
    return migrated
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

/**
 * Build a history entry from a classify result, stamping mode / gate_summary / locale (B-38).
 */
export function buildHistoryEntry(input: {
  result: ClassificationResult | HistoryClassification
  previews: string[]
  view_types?: string[]
  notes?: string
  tags?: string[]
  id?: string
  timestamp?: number
}): HistoryEntry {
  const result = input.result as ClassificationResult & HistoryClassification
  const mode = resolveMode(result as ClassificationResult)
  const gate_summary = toGateSummary(result.quality_gate)
  const locale =
    typeof result.locale === 'string' && result.locale ? result.locale : undefined

  return {
    id: input.id ?? result.request_id,
    timestamp: input.timestamp ?? Date.now(),
    previews: input.previews,
    result: result as HistoryClassification,
    view_types: input.view_types,
    notes: input.notes,
    tags: input.tags,
    mode,
    gate_summary,
    locale,
  }
}

export function appendHistory(
  entry: HistoryEntry,
  storage: StorageLike = localStorage,
): HistoryEntry[] {
  // Ensure honesty fields are stamped even if caller omitted them
  const stamped = migrateHistoryEntry(entry)
  const next = [stamped, ...loadHistory(storage)].slice(0, MAX_HISTORY)
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
  /** Counts by product honesty mode (B-38) */
  by_mode: Record<ClassifyMode, number>
}

export function summarizeHistory(entries: HistoryEntry[]): HistorySummary {
  let accepted = 0
  let rejected = 0
  let need_review = 0
  const by_mode: Record<ClassifyMode, number> = { real: 0, mock: 0, blocked: 0 }
  for (const e of entries) {
    if (e.result.decision === 'accepted') accepted += 1
    if (e.result.decision === 'rejected') rejected += 1
    if (e.result.recommend_human_review) need_review += 1
    by_mode[entryMode(e)] += 1
  }
  return {
    total: entries.length,
    accepted,
    rejected,
    need_review,
    latest_species: entries[0]?.result.predictions?.[0]?.species ?? null,
    by_mode,
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

/** Optional filter by product honesty mode (B-38). */
export function filterHistoryByMode(
  entries: HistoryEntry[],
  mode: HistoryModeFilter,
): HistoryEntry[] {
  if (mode === 'all') return entries
  return entries.filter((e) => entryMode(e) === mode)
}

/** Start of local calendar day for `now` (ms). */
export function startOfLocalDay(now: number = Date.now()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Filter notebook entries by local date window (D-10).
 * `now` injectable for unit tests.
 */
export function filterHistoryByDate(
  entries: HistoryEntry[],
  dateFilter: HistoryDateFilter,
  now: number = Date.now(),
): HistoryEntry[] {
  if (dateFilter === 'all') return entries
  const dayStart = startOfLocalDay(now)
  let minTs = dayStart
  if (dateFilter === '7d') minTs = dayStart - 6 * 24 * 60 * 60 * 1000
  if (dateFilter === '30d') minTs = dayStart - 29 * 24 * 60 * 60 * 1000
  return entries.filter((e) => e.timestamp >= minTs && e.timestamp <= now + 60_000)
}

/** Compose mode + date filters (stable order: mode then date). */
export function filterHistoryEntries(
  entries: HistoryEntry[],
  opts: { mode?: HistoryModeFilter; date?: HistoryDateFilter; now?: number } = {},
): HistoryEntry[] {
  const byMode = filterHistoryByMode(entries, opts.mode ?? 'all')
  return filterHistoryByDate(byMode, opts.date ?? 'all', opts.now)
}

/** Find one entry by id (after soft-migrate load path). */
export function getHistoryEntry(
  id: string,
  storage: StorageLike = localStorage,
): HistoryEntry | null {
  return loadHistory(storage).find((e) => e.id === id) ?? null
}

/**
 * Portable plain-text summary for Web Share / clipboard (no huge data-URLs).
 * Educational only — not a consumption certificate.
 */
export function shareHistoryText(
  entries: HistoryEntry[],
  options: { maxEntries?: number } = {},
): string {
  const max = options.maxEntries ?? 20
  const slice = entries.slice(0, max)
  const lines: string[] = [
    'VisionSetil — Cuaderno de campo (local)',
    'Solo orientación educativa. No es permiso de consumo ni certificado de ID.',
    `Entradas: ${entries.length}${entries.length > max ? ` (mostrando ${max})` : ''}`,
    '',
  ]
  for (const e of slice) {
    const top = e.result.predictions?.[0]
    const when = new Date(e.timestamp).toISOString()
    const species = top?.species || '—'
    const conf =
      top && typeof top.confidence === 'number'
        ? ` · ${(top.confidence * 100).toFixed(0)}%`
        : ''
    const mode = entryMode(e)
    lines.push(`• ${when} · ${e.result.decision} · ${mode}`)
    lines.push(`  ${species}${conf}`)
    if (e.tags?.length) lines.push(`  tags: ${e.tags.join(', ')}`)
    if (e.notes?.trim()) {
      const note = e.notes.trim().slice(0, 160)
      lines.push(`  notas: ${note}${e.notes.trim().length > 160 ? '…' : ''}`)
    }
  }
  return lines.join('\n')
}

/** Spanish labels for date filter chips (HistoryPage). */
export function historyDateLabelEs(filter: HistoryDateFilter): string {
  switch (filter) {
    case 'all':
      return 'Cualquier fecha'
    case 'today':
      return 'Hoy'
    case '7d':
      return '7 días'
    case '30d':
      return '30 días'
    default:
      return '—'
  }
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
      const migrated = migrateHistoryEntry(e)
      return {
        id: migrated.id,
        timestamp: migrated.timestamp,
        iso_time: new Date(migrated.timestamp).toISOString(),
        view_types: migrated.view_types || [],
        notes: migrated.notes || '',
        tags: migrated.tags || [],
        mode: migrated.mode,
        gate_summary: migrated.gate_summary ?? null,
        locale: migrated.locale,
        previews,
        result: migrated.result,
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

/** Spanish labels for honesty mode chips (HistoryPage; matches decisionLabels style). */
export function historyModeLabelEs(mode: ClassifyMode | 'all' | undefined | null): string {
  switch (mode) {
    case 'all':
      return 'Todas'
    case 'real':
      return 'Real'
    case 'mock':
      return 'Demo'
    case 'blocked':
      return 'Bloqueado'
    default:
      return '—'
  }
}
