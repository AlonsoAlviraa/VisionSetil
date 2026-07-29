/**
 * Index Fungorum (Kew) nomenclature helpers — FE.
 * Live resolve goes through backend `/nomenclature/resolve` (CORS + cache).
 * Policy: names only · never consumption · always attribute + link.
 */

export const INDEX_FUNGORUM_HOME = 'https://www.indexfungorum.org/'
export const INDEX_FUNGORUM_API =
  'https://www.indexfungorum.org/ixfwebservice/fungus.asmx'
export const INDEX_FUNGORUM_ATTR_SHORT =
  'Index Fungorum (Royal Botanic Gardens, Kew)'

export function indexFungorumRecordUrl(recordId: string | number | null | undefined): string | null {
  const id = String(recordId || '').trim()
  if (!/^\d+$/.test(id)) return null
  return `https://www.indexfungorum.org/Names/NamesRecord.asp?RecordID=${id}`
}

export type IndexFungorumBest = {
  name: string
  authors?: string | null
  year?: string | null
  name_status?: string | null
  record_number?: string | null
  current_name?: string | null
  current_name_record_number?: string | null
  record_url?: string | null
  is_current?: boolean
}

export type IndexFungorumResolve = {
  query: string
  ok: boolean
  best: IndexFungorumBest | null
  current_name: string | null
  if_differs_from_query?: boolean
  synonyms: Array<{
    name: string
    authors?: string | null
    record_number?: string | null
    name_status?: string | null
    record_url?: string | null
  }>
  hits: number
  attribution?: {
    source: string
    url: string
    label: string
    policy: string
  }
  policy?: string
  product_unlock?: boolean
  error?: string | null
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export async function resolveIndexFungorumName(
  query: string,
  signal?: AbortSignal,
): Promise<IndexFungorumResolve | null> {
  const q = query.trim()
  if (q.length < 2) return null
  const url = `${API_BASE.replace(/\/$/, '')}/nomenclature/resolve?q=${encodeURIComponent(q)}`
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as IndexFungorumResolve
    return data
  } catch {
    return null
  }
}

/** Educational policy line (always orientation only). */
export function indexFungorumPolicyEs(): string {
  return (
    'Nomenclatura Index Fungorum (Kew): nombres científicos y sinónimos. ' +
    'No es permiso de consumo ni identificación de campo. ' +
    'El catálogo VisionSetil (SSOT) no se sobrescribe automáticamente.'
  )
}

export function indexFungorumPolicyEn(): string {
  return (
    'Index Fungorum (Kew) nomenclature: scientific names and synonyms. ' +
    'Not consumption permission or field ID. ' +
    'VisionSetil SSOT catalog is not auto-overwritten.'
  )
}

/**
 * Build unique query variants for encyclopedia search boost (P17).
 * Includes raw query + optional IF current name + synonym strings.
 * Never invents taxa — only normalizes supplied strings.
 */
export function nomenclatureQueryVariants(
  query: string,
  extraNames?: readonly string[] | null,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | null | undefined) => {
    const t = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
    if (t.length < 2) return
    // Strip author-ish parentheticals for match helpers
    const bare = t.includes(' (') ? t.split(' (')[0]!.trim() : t
    for (const v of [t, bare]) {
      if (v.length < 2 || seen.has(v)) continue
      seen.add(v)
      out.push(v)
    }
  }
  push(query)
  for (const n of extraNames || []) push(n)
  return out
}

/**
 * Pure score boost when a catalog taxon matches IF/curated nomenclature variants.
 * Orientation-only ranking signal — never consumption or product_unlock.
 */
export function scoreTaxonAgainstNomenclatureVariants(
  taxon: string,
  variants: readonly string[],
): number {
  const t = taxon.trim().toLowerCase()
  if (!t || variants.length === 0) return 0
  let best = 0
  for (const v of variants) {
    if (t === v) best = Math.max(best, 110)
    else if (t.startsWith(v) || v.startsWith(t)) best = Math.max(best, 85)
    else if (t.includes(v) || v.includes(t)) best = Math.max(best, 55)
  }
  return best
}

export type IfSearchHint = {
  hints: string[]
  currentName: string | null
  differs: boolean
  query: string
}

/**
 * Extract encyclopedia search hints from a live IF resolve payload.
 * Hints are names only (current + synonyms); SSOT is never overwritten.
 */
export function ifSearchHintFromResolve(
  resolve: IndexFungorumResolve | null | undefined,
): IfSearchHint {
  if (!resolve || !resolve.ok) {
    return { hints: [], currentName: null, differs: false, query: resolve?.query || '' }
  }
  const hints: string[] = []
  if (resolve.current_name) hints.push(resolve.current_name)
  if (resolve.best?.name) hints.push(resolve.best.name)
  if (resolve.best?.current_name) hints.push(resolve.best.current_name)
  for (const s of resolve.synonyms || []) {
    if (s?.name) hints.push(s.name)
  }
  const variants = nomenclatureQueryVariants(resolve.query || '', hints)
  return {
    hints: variants,
    currentName: resolve.current_name || resolve.best?.current_name || null,
    differs: Boolean(resolve.if_differs_from_query),
    query: resolve.query || '',
  }
}

/** Scientific-looking query? (≥2 tokens or Genus epithet) — avoid IF spam on common names. */
export function looksLikeScientificQuery(q: string): boolean {
  const t = q.trim()
  if (t.length < 5) return false
  // Two Latin-ish words, or italic-style binomial
  if (/^[A-Za-z][a-z]+\s+[a-z-]{3,}/.test(t)) return true
  if (/^[A-Z][a-z]+$/.test(t) && t.length >= 6) return true // genus-only
  return false
}
