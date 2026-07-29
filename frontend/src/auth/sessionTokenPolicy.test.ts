import { describe, expect, it } from 'vitest'
import {
  SESSION_TOKEN_KEY,
  applySessionAfterAuth,
  clearStoredSessionToken,
  readStoredSessionToken,
  shouldPersistTokenInLocalStorage,
} from './sessionTokenPolicy'

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed))
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    _map: map,
  }
}

describe('sessionTokenPolicy (E-08 cookie vs bearer)', () => {
  it('cookie mode forbids localStorage token persistence', () => {
    expect(shouldPersistTokenInLocalStorage(true)).toBe(false)
    expect(shouldPersistTokenInLocalStorage(false)).toBe(true)
  })

  it('cookie mode never leaves session token in storage after auth', () => {
    const store = memoryStorage({ [SESSION_TOKEN_KEY]: 'stale-bearer' })
    applySessionAfterAuth(store, true, 'should-not-store')
    expect(store.getItem(SESSION_TOKEN_KEY)).toBeNull()
    expect(readStoredSessionToken(store, true)).toBeNull()
  })

  it('bearer mode stores token under SESSION_TOKEN_KEY', () => {
    const store = memoryStorage()
    applySessionAfterAuth(store, false, 'abc123token')
    expect(store.getItem(SESSION_TOKEN_KEY)).toBe('abc123token')
    expect(readStoredSessionToken(store, false)).toBe('abc123token')
  })

  it('clearStoredSessionToken removes key', () => {
    const store = memoryStorage({ [SESSION_TOKEN_KEY]: 'x' })
    clearStoredSessionToken(store)
    expect(store.getItem(SESSION_TOKEN_KEY)).toBeNull()
  })

  it('SESSION_TOKEN_KEY is the production key used by AuthContext', () => {
    // Structural: key must match shipped Auth/localStorage contract
    expect(SESSION_TOKEN_KEY).toBe('visionsetil_session_token')
  })
})
