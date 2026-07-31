import { describe, expect, it } from 'vitest'
import {
  buildHistoryEntry,
  sanitizeHistoryPreviews,
} from './observationHistory'
import type { ClassificationResult } from '../api/types'

const baseResult = {
  request_id: 'req-1',
  decision: 'rejected',
  predictions: [],
} as ClassificationResult

describe('history preview durability', () => {
  it('sanitizeHistoryPreviews drops blob: URLs', () => {
    expect(
      sanitizeHistoryPreviews([
        'blob:http://localhost/abc',
        'data:image/jpeg;base64,aaa',
        'https://example.com/x.jpg',
        '',
      ]),
    ).toEqual(['data:image/jpeg;base64,aaa', 'https://example.com/x.jpg'])
  })

  it('buildHistoryEntry never stores blob previews', () => {
    const entry = buildHistoryEntry({
      result: baseResult,
      previews: ['blob:http://localhost/dead', 'data:image/jpeg;base64,ok'],
    })
    expect(entry.previews).toEqual(['data:image/jpeg;base64,ok'])
    expect(entry.previews.every((p) => !p.startsWith('blob:'))).toBe(true)
  })
})
