/** Favorites in localStorage only (PR-12 / D14 — no cloud auth). */

const KEY = 'visionsetil_favorites'

export function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

export function saveFavorites(slugs: string[]): void {
  localStorage.setItem(KEY, JSON.stringify(slugs))
}

export function isFavorite(slug: string): boolean {
  return loadFavorites().includes(slug)
}

export function toggleFavorite(slug: string): boolean {
  const set = new Set(loadFavorites())
  if (set.has(slug)) {
    set.delete(slug)
    saveFavorites([...set])
    return false
  }
  set.add(slug)
  saveFavorites([...set])
  return true
}
