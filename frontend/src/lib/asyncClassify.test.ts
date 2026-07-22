/**
 * B-46 unit tests: job envelope simple-only + poll loop.
 */
import { describe, expect, it, vi } from 'vitest'
import type { ClassificationResult } from '../api/types'
import {
  extractSimpleFromEnvelope,
  isJobCompleted,
  isJobFailed,
  isJobResultEnvelope,
  isTerminalJobStatus,
  pollJobUntilSimple,
} from './asyncClassify'

function minimalSimple(
  overrides: Partial<ClassificationResult> = {},
): ClassificationResult {
  return {
    request_id: 'job-abc',
    decision: 'rejected',
    predictions: [],
    rejection_reason: 'model_quality_gate',
    processing_time_ms: 10,
    observation_id: 1,
    safety_level: 'unknown',
    missing_evidence: [],
    warnings: [],
    quality_warnings: [],
    dangerous_lookalikes: [],
    questions_for_user: [],
    model_stack: null,
    open_set_reason: null,
    recommend_human_review: true,
    final_warning: 'educational',
    mode: 'blocked',
    quality_gate: {
      species_id_allowed: false,
      metrics_acceptable: false,
      block_enabled: true,
      reason: 'no metrics',
      reason_code: 'no_metrics',
      verdict: 'UNACCEPTABLE',
    },
    locale: 'es',
    ...overrides,
  }
}

describe('extractSimpleFromEnvelope', () => {
  it('returns simple and ignores raw (product path)', () => {
    const simple = minimalSimple({ mode: 'mock', request_id: 'r1' })
    const envelope = {
      schema_version: 2,
      simple,
      raw: {
        predictions: [{ species: 'Amanita phalloides', confidence: 0.99 }],
        decision: 'accepted',
      },
    }
    const out = extractSimpleFromEnvelope(envelope)
    expect(out).toBe(simple)
    expect(out.mode).toBe('mock')
    expect(out.predictions).toEqual([])
    // raw must never leak into the product result object
    expect((out as { raw?: unknown }).raw).toBeUndefined()
  })

  it('rejects missing schema_version / wrong version', () => {
    expect(() =>
      extractSimpleFromEnvelope({ simple: minimalSimple() }),
    ).toThrow(/schema_version/)
    expect(() =>
      extractSimpleFromEnvelope({
        schema_version: 1,
        simple: minimalSimple(),
      }),
    ).toThrow(/schema_version/)
  })

  it('rejects missing simple', () => {
    expect(() =>
      extractSimpleFromEnvelope({ schema_version: 2, raw: null }),
    ).toThrow(/simple/)
  })

  it('isJobResultEnvelope narrows correctly', () => {
    expect(
      isJobResultEnvelope({
        schema_version: 2,
        simple: minimalSimple(),
        raw: null,
      }),
    ).toBe(true)
    expect(isJobResultEnvelope({ schema_version: 2 })).toBe(false)
    expect(isJobResultEnvelope(null)).toBe(false)
  })
})

describe('job status helpers', () => {
  it('detects terminal / completed / failed', () => {
    expect(isTerminalJobStatus('queued')).toBe(false)
    expect(isTerminalJobStatus('running')).toBe(false)
    expect(isTerminalJobStatus('completed')).toBe(true)
    expect(isTerminalJobStatus('failed')).toBe(true)
    expect(isJobCompleted('completed')).toBe(true)
    expect(isJobFailed('FAILED')).toBe(true)
  })
})

describe('pollJobUntilSimple', () => {
  it('polls until completed then returns simple only', async () => {
    const simple = minimalSimple({ mode: 'real', request_id: 'done-1' })
    const statuses = ['queued', 'running', 'completed']
    let i = 0
    const getStatus = vi.fn(async () => {
      const status = statuses[Math.min(i, statuses.length - 1)]!
      i += 1
      return { status, error: null }
    })
    const getResult = vi.fn(async () => ({
      schema_version: 2 as const,
      simple,
      raw: { predictions: [{ species: 'secret-raw' }] },
    }))
    const sleep = vi.fn(async () => {})

    const out = await pollJobUntilSimple('job-1', {
      getStatus,
      getResult,
      sleep,
      intervalMs: 10,
      timeoutMs: 5000,
    })

    expect(out.mode).toBe('real')
    expect(out.request_id).toBe('done-1')
    expect(getResult).toHaveBeenCalledTimes(1)
    expect(getStatus.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(sleep.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('throws on failed job with error detail', async () => {
    await expect(
      pollJobUntilSimple('job-fail', {
        getStatus: async () => ({
          status: 'failed',
          error: 'worker boom',
        }),
        getResult: async () => {
          throw new Error('should not fetch result on failed')
        },
        sleep: async () => {},
      }),
    ).rejects.toThrow(/worker boom/)
  })

  it('times out if job never completes', async () => {
    let t = 0
    await expect(
      pollJobUntilSimple('job-slow', {
        getStatus: async () => ({ status: 'running', error: null }),
        getResult: async () => {
          throw new Error('no result')
        },
        sleep: async () => {
          t += 100
        },
        now: () => t,
        intervalMs: 100,
        timeoutMs: 250,
      }),
    ).rejects.toThrow(/timed out/)
  })

  it('aborts when signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      pollJobUntilSimple('job-abort', {
        getStatus: async () => ({ status: 'running', error: null }),
        getResult: async () => ({ schema_version: 2, simple: minimalSimple() }),
        signal: controller.signal,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
