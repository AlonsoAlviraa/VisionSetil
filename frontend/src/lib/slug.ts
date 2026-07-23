/** Scientific name → kebab slug (canonical D9). */

export function scientificNameToSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug)
}

/** Heuristic: looks like "Amanita phalloides" rather than kebab slug. */
export function looksLikeScientificName(param: string): boolean {
  const decoded = decodeURIComponent(param)
  if (decoded.includes(' ')) return true
  if (/[A-Z]/.test(decoded)) return true
  return false
}
