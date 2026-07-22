/** Auth API client */

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export type AuthUser = {
  id: number
  email: string
  username: string
  display_name: string
}

export type AuthResponse = {
  token: string
  token_type: string
  user: AuthUser
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = await res.json()
    return j.detail || j.message || res.statusText
  } catch {
    return res.statusText
  }
}

export async function register(data: {
  email: string
  username: string
  password: string
  display_name?: string
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function login(loginId: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginId, password }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function logout(token: string): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}
