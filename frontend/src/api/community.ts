/** Community feed API */

import { isAuthCookieMode } from './auth'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export type CommunityAuthor = {
  id: number
  username: string
  display_name: string
}

export type CommunityComment = {
  id: number
  body: string
  created_at: string
  author: CommunityAuthor
}

export type CommunityPost = {
  id: number
  body: string
  image_url: string | null
  created_at: string
  author: CommunityAuthor
  comments: CommunityComment[]
  orientation_only: boolean
  safety_note: string
}

function authHeaders(token: string | null | undefined): HeadersInit {
  if (isAuthCookieMode()) return {}
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function fetchOpts(init: RequestInit = {}): RequestInit {
  if (isAuthCookieMode()) {
    return { ...init, credentials: 'include' }
  }
  return init
}

function resolveMediaUrl(url: string | null): string | null {
  if (!url) return null
  if (url.startsWith('http')) return url
  // Dev: vite proxies /uploads → backend; production may same-origin reverse-proxy
  return url
}

export async function listPosts(token?: string | null): Promise<CommunityPost[]> {
  const res = await fetch(
    `${API_BASE}/community/posts`,
    fetchOpts({
      headers: { ...authHeaders(token || null) },
    }),
  )
  if (!res.ok) throw new Error('No se pudo cargar el feed')
  const data = (await res.json()) as CommunityPost[]
  return data.map((p) => ({ ...p, image_url: resolveMediaUrl(p.image_url) }))
}

export async function createPost(
  token: string | null,
  body: string,
  image?: File | null,
): Promise<CommunityPost> {
  const form = new FormData()
  form.append('body', body)
  if (image) form.append('image', image)
  const res = await fetch(
    `${API_BASE}/community/posts`,
    fetchOpts({
      method: 'POST',
      headers: { ...authHeaders(token) },
      body: form,
    }),
  )
  if (!res.ok) {
    let msg = 'Error al publicar'
    try {
      const j = await res.json()
      msg = j.detail || msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  const p = (await res.json()) as CommunityPost
  return { ...p, image_url: resolveMediaUrl(p.image_url) }
}

export async function createComment(
  token: string | null,
  postId: number,
  body: string,
): Promise<CommunityComment> {
  const res = await fetch(
    `${API_BASE}/community/posts/${postId}/comments`,
    fetchOpts({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(token),
      },
      body: JSON.stringify({ body }),
    }),
  )
  if (!res.ok) {
    let msg = 'Error al comentar'
    try {
      const j = await res.json()
      msg = j.detail || msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.json()
}
