import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * Drives shipped authFetchInit / isAuthCookieMode path via real module
 * with featureFlags.AUTH_COOKIE mocked — proves cookie mode uses credentials
 * and does not attach Authorization.
 */

describe('auth API cookie mode (shipped fetch path)', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('cookie mode: login uses credentials include and no Authorization header', async () => {
    vi.doMock('../lib/featureFlags', () => ({
      featureFlags: { AUTH_COOKIE: true },
      isFeatureEnabled: () => true,
    }))

    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return new Response(
        JSON.stringify({
          token: '',
          token_type: 'cookie',
          auth_via: 'cookie',
          user: { id: 1, email: 'a@b.c', username: 'u', display_name: 'U' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch

    const auth = await import('./auth')
    expect(auth.isAuthCookieMode()).toBe(true)
    await auth.login('u', 'password123')
    expect(calls.length).toBe(1)
    expect(calls[0].init?.credentials).toBe('include')
    const headers = new Headers(calls[0].init?.headers || {})
    expect(headers.get('Authorization')).toBeNull()
  })

  it('bearer mode: fetchMe sends Authorization when token provided', async () => {
    vi.doMock('../lib/featureFlags', () => ({
      featureFlags: { AUTH_COOKIE: false },
      isFeatureEnabled: () => false,
    }))

    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return new Response(
        JSON.stringify({ id: 1, email: 'a@b.c', username: 'u', display_name: 'U' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch

    const auth = await import('./auth')
    expect(auth.isAuthCookieMode()).toBe(false)
    await auth.fetchMe('tok_abc')
    expect(calls.length).toBe(1)
    const headers = new Headers(calls[0].init?.headers || {})
    expect(headers.get('Authorization')).toBe('Bearer tok_abc')
  })
})
