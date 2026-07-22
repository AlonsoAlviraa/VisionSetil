import { describe, expect, it } from 'vitest'
import axios, { AxiosError } from 'axios'
import {
  classifyApiError,
  extractServerDetail,
  isViewTypesValidationDetail,
} from './classifyErrors'

function axiosErr(partial: {
  code?: string
  message?: string
  status?: number
  data?: unknown
}): AxiosError {
  const err = new AxiosError(partial.message || 'Request failed')
  err.code = partial.code
  if (partial.status != null) {
    err.response = {
      status: partial.status,
      statusText: String(partial.status),
      data: partial.data,
      headers: {},
      config: {} as never,
    }
  }
  return err
}

describe('extractServerDetail', () => {
  it('reads string detail', () => {
    expect(extractServerDetail({ detail: 'At least one image is required' })).toBe(
      'At least one image is required',
    )
  })

  it('joins validation array detail', () => {
    expect(
      extractServerDetail({
        detail: [{ msg: 'field required' }, { msg: 'invalid locale' }],
      }),
    ).toBe('field required; invalid locale')
  })

  it('falls back to message/error', () => {
    expect(extractServerDetail({ message: 'boom' })).toBe('boom')
    expect(extractServerDetail({ error: 'nope' })).toBe('nope')
  })
})

describe('isViewTypesValidationDetail', () => {
  it('detects backend view_types 400 copy', () => {
    expect(
      isViewTypesValidationDetail(
        "Invalid view_types label(s): ['foo']. Valid labels: ['gills', 'front', 'habitat', 'detail'].",
      ),
    ).toBe(true)
    expect(isViewTypesValidationDetail('At least one image is required')).toBe(false)
  })
})

describe('classifyApiError', () => {
  it('maps timeout (ECONNABORTED, no response)', () => {
    const c = classifyApiError(
      axiosErr({ code: 'ECONNABORTED', message: 'timeout of 60000ms exceeded' }),
    )
    expect(c.kind).toBe('timeout')
    expect(c.retryable).toBe(true)
    expect(c.messageKey).toBe('error.timeout')
  })

  it('maps network (no response)', () => {
    const c = classifyApiError(axiosErr({ code: 'ERR_NETWORK', message: 'Network Error' }))
    expect(c.kind).toBe('network')
    expect(c.retryable).toBe(true)
  })

  it('maps view_types 400', () => {
    const c = classifyApiError(
      axiosErr({
        status: 400,
        data: {
          detail:
            "Invalid view_types label(s): ['xyz']. Valid labels: ['gills', 'front', 'habitat', 'detail'].",
        },
      }),
    )
    expect(c.kind).toBe('view_types')
    expect(c.status).toBe(400)
    expect(c.retryable).toBe(false)
    expect(c.serverDetail).toMatch(/view_types/i)
  })

  it('maps generic 400', () => {
    const c = classifyApiError(
      axiosErr({ status: 400, data: { detail: 'Maximum 10 images per request' } }),
    )
    expect(c.kind).toBe('bad_request')
    expect(c.serverDetail).toMatch(/10 images/)
  })

  it('maps 401/403 unauthorized', () => {
    expect(classifyApiError(axiosErr({ status: 401, data: { detail: 'nope' } })).kind).toBe(
      'unauthorized',
    )
    expect(classifyApiError(axiosErr({ status: 403, data: {} })).kind).toBe('unauthorized')
  })

  it('maps 429 rate limited as retryable', () => {
    const c = classifyApiError(axiosErr({ status: 429, data: { detail: 'slow down' } }))
    expect(c.kind).toBe('rate_limited')
    expect(c.retryable).toBe(true)
  })

  it('maps 5xx as server retryable', () => {
    const c = classifyApiError(axiosErr({ status: 503, data: { detail: 'unavailable' } }))
    expect(c.kind).toBe('server')
    expect(c.retryable).toBe(true)
  })

  it('maps other 4xx as client', () => {
    const c = classifyApiError(axiosErr({ status: 404, data: { detail: 'missing' } }))
    expect(c.kind).toBe('client')
    expect(c.retryable).toBe(false)
  })

  it('maps plain Error as unknown', () => {
    const c = classifyApiError(new Error('weird'))
    expect(c.kind).toBe('unknown')
    expect(c.serverDetail).toBe('weird')
  })

  it('isAxiosError path via real axios helper', () => {
    expect(axios.isAxiosError(axiosErr({ status: 500, data: {} }))).toBe(true)
  })
})
