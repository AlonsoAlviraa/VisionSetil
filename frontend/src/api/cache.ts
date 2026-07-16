/** Simple in-memory cache with TTL. */
interface CacheEntry<T> {
  value: T
  expires: number
}

const cacheStore = new Map<string, CacheEntry<unknown>>()

export const cache = {
  get<T>(key: string): T | null {
    const entry = cacheStore.get(key) as CacheEntry<T> | undefined
    if (!entry) return null
    if (Date.now() > entry.expires) {
      cacheStore.delete(key)
      return null
    }
    return entry.value
  },

  set<T>(key: string, value: T, ttlMs: number): void {
    cacheStore.set(key, { value, expires: Date.now() + ttlMs })
  },

  delete(key: string): void {
    cacheStore.delete(key)
  },

  clear(): void {
    cacheStore.clear()
  },
}