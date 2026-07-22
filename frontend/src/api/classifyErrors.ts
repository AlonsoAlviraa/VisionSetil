/**
 * B-29 — Identify classify error taxonomy.
 *
 * Maps raw axios / unknown failures into stable kinds for UX:
 * network · timeout · view_types (400) · other 4xx · 5xx · unknown.
 */

import axios from 'axios'

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'view_types'
  | 'bad_request'
  | 'unauthorized'
  | 'rate_limited'
  | 'client'
  | 'server'
  | 'unknown'

export interface ClassifiedApiError {
  kind: ApiErrorKind
  status: number | null
  /** i18n key (common ns) for banner title */
  titleKey: string
  /** i18n key (common ns) for body copy */
  messageKey: string
  /** FastAPI `detail` / message when present (optional secondary line) */
  serverDetail: string | null
  retryable: boolean
}

/** Pull string detail from FastAPI / problem+json-ish bodies. */
export function extractServerDetail(data: unknown): string | null {
  if (data == null) return null
  if (typeof data === 'string') {
    const t = data.trim()
    return t || null
  }
  if (typeof data !== 'object') return null

  const obj = data as Record<string, unknown>
  const detail = obj.detail

  if (typeof detail === 'string') {
    const t = detail.trim()
    return t || null
  }

  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>
          if (typeof rec.msg === 'string') return rec.msg
          if (typeof rec.message === 'string') return rec.message
        }
        return null
      })
      .filter((p): p is string => Boolean(p && p.trim()))
    return parts.length ? parts.join('; ') : null
  }

  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim()
  if (typeof obj.error === 'string' && obj.error.trim()) return obj.error.trim()

  return null
}

export function isViewTypesValidationDetail(detail: string | null): boolean {
  if (!detail) return false
  const s = detail.toLowerCase()
  return (
    s.includes('view_types') ||
    s.includes('invalid view') ||
    (s.includes('canonical') && s.includes('view'))
  )
}

function pack(
  kind: ApiErrorKind,
  status: number | null,
  titleKey: string,
  messageKey: string,
  serverDetail: string | null,
  retryable: boolean,
): ClassifiedApiError {
  return { kind, status, titleKey, messageKey, serverDetail, retryable }
}

/**
 * Classify any thrown value from `classifyImages` / axios into UX taxonomy.
 */
export function classifyApiError(err: unknown): ClassifiedApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? null
    const detail = extractServerDetail(err.response?.data)
    const code = err.code || ''
    const msg = typeof err.message === 'string' ? err.message : ''

    // Timeout before any HTTP response (axios default: ECONNABORTED + "timeout").
    const looksTimeout =
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT' ||
      /timeout/i.test(msg)

    if (looksTimeout && !err.response) {
      return pack('timeout', null, 'error.timeoutTitle', 'error.timeout', null, true)
    }

    // No response → network / offline / CORS / backend down.
    if (!err.response) {
      return pack('network', null, 'error.networkTitle', 'error.network', null, true)
    }

    if (status === 400 && isViewTypesValidationDetail(detail)) {
      return pack(
        'view_types',
        400,
        'error.viewTypesTitle',
        'error.viewTypes',
        detail,
        false,
      )
    }

    if (status === 400) {
      return pack(
        'bad_request',
        400,
        'error.badRequestTitle',
        'error.badRequest',
        detail,
        false,
      )
    }

    if (status === 401 || status === 403) {
      return pack(
        'unauthorized',
        status,
        'error.unauthorizedTitle',
        'error.unauthorized',
        detail,
        false,
      )
    }

    if (status === 429) {
      return pack(
        'rate_limited',
        429,
        'error.rateLimitedTitle',
        'error.rateLimited',
        detail,
        true,
      )
    }

    if (status !== null && status >= 400 && status < 500) {
      return pack('client', status, 'error.clientTitle', 'error.client', detail, false)
    }

    if (status !== null && status >= 500) {
      return pack('server', status, 'error.serverTitle', 'error.server', detail, true)
    }
  }

  if (err instanceof Error && err.message) {
    return pack(
      'unknown',
      null,
      'error.defaultTitle',
      'error.defaultDescription',
      err.message,
      true,
    )
  }

  return pack(
    'unknown',
    null,
    'error.defaultTitle',
    'error.defaultDescription',
    null,
    true,
  )
}
