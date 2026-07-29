/** Scientific name → kebab slug (canonical D9). Handles multi-word taxa & accents. */

export function scientificNameToSlug(name: string): string {
  if (!name || typeof name !== 'string') return ''
  let s = name
  try {
    // Decode once when callers pass URL-encoded scientific names
    if (/%[0-9A-Fa-f]{2}/.test(s)) s = decodeURIComponent(s)
  } catch {
    /* keep raw */
  }
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[''`´]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidSlug(slug: string): boolean {
  if (!slug) return false
  return SLUG_RE.test(slug.trim().toLowerCase())
}

/** Heuristic: looks like "Amanita phalloides" rather than kebab slug. */
export function looksLikeScientificName(param: string): boolean {
  let decoded = param
  try {
    decoded = decodeURIComponent(param)
  } catch {
    decoded = param
  }
  if (decoded.includes(' ')) return true
  if (/[A-Z]/.test(decoded)) return true
  // hybrid marks / subsp. etc.
  if (/[×x]\s/i.test(decoded) || /\b(subsp|var|f)\./i.test(decoded)) return true
  return false
}

/** Normalize any route param (slug or scientific) to catalog slug key. */
export function normalizeSlugParam(param: string): string {
  if (!param) return ''
  let raw = param.trim()
  try {
    raw = decodeURIComponent(raw)
  } catch {
    /* keep */
  }
  if (looksLikeScientificName(raw) || raw.includes(' ')) {
    return scientificNameToSlug(raw)
  }
  return scientificNameToSlug(raw) // also collapses accents/case on slug-like input
}
