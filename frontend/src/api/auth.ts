/** Auth API client — bearer (default) or E-08 cookie mode. */

import { featureFlags } from '../lib/featureFlags'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

/** Cookie mode: credentials include; no Authorization header. */
const cookieMode = () => featureFlags.AUTH_COOKIE

export type AuthUser = {
  id: number
  email: string
  username: string
  display_name: string
  role?: string
}

export type AuthResponse = {
  token: string
  token_type: string
  user: AuthUser
  auth_via?: string
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = await res.json()
    return j.detail || j.message || res.statusText
  } catch {
    return res.statusText
  }
}

function authFetchInit(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers || {})
  if (cookieMode()) {
    return {
      ...init,
      credentials: 'include',
      headers,
    }
  }
  return init
}

export async function register(data: {
  email: string
  username: string
  password: string
  display_name?: string
}): Promise<AuthResponse> {
  const res = await fetch(
    `${API_BASE}/auth/register`,
    authFetchInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function login(loginId: string, password: string): Promise<AuthResponse> {
  const res = await fetch(
    `${API_BASE}/auth/login`,
    authFetchInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: loginId, password }),
    }),
  )
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

/**
 * Fetch current user. In cookie mode, token is optional (cookie sent automatically).
 */
export async function fetchMe(token?: string | null): Promise<AuthUser> {
  let res: Response
  try {
    const headers: Record<string, string> = {}
    if (!cookieMode() && token) {
      headers.Authorization = `Bearer ${token}`
    }
    res = await fetch(
      `${API_BASE}/auth/me`,
      authFetchInit({ headers }),
    )
  } catch {
    throw new Error('network_error')
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${await parseError(res)}`)
  }
  return res.json()
}

export async function logout(token?: string | null): Promise<void> {
  const headers: Record<string, string> = {}
  if (!cookieMode() && token) {
    headers.Authorization = `Bearer ${token}`
  }
  await fetch(
    `${API_BASE}/auth/logout`,
    authFetchInit({
      method: 'POST',
      headers,
    }),
  )
}

export function isAuthCookieMode(): boolean {
  return cookieMode()
}
