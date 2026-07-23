/**
 * Pure helpers for optional async classify + job polling (B-46).
 *
 * Product path: POST /classify/async → poll GET /jobs/{id} → GET /jobs/{id}/result
 * → read envelope.simple only (D-B18). Never surface envelope.raw in Identify UI.
 */

import type {
  ClassificationJob,
  ClassificationResult,
  JobResultEnvelope,
} from '../api/types'

/** Default poll interval (1.5s) — aligns with design “1–2s”. */
export const DEFAULT_JOB_POLL_MS = 1500

/** Max wait for a single job before failing the client poll loop. */
export const DEFAULT_JOB_TIMEOUT_MS = 120_000

export function isTerminalJobStatus(status: string): boolean {
  const s = String(status || '').toLowerCase()
  return s === 'completed' || s === 'failed'
}

export function isJobCompleted(status: string): boolean {
  return String(status || '').toLowerCase() === 'completed'
}

export function isJobFailed(status: string): boolean {
  return String(status || '').toLowerCase() === 'failed'
}

/**
 * Extract product ClassificationResult from a job result envelope.
 * Requires schema_version === 2 and a present `simple` object.
 * Never returns or mixes in `raw` (admin/debug only).
 */
export function extractSimpleFromEnvelope(
  envelope: unknown,
): ClassificationResult {
  if (envelope === null || typeof envelope !== 'object') {
    throw new Error('Job result envelope missing or invalid')
  }
  const env = envelope as Record<string, unknown>
  if (env.schema_version !== 2) {
    throw new Error(
      `Unsupported job result schema_version: ${String(env.schema_version)}`,
    )
  }
  if (env.simple === null || typeof env.simple !== 'object') {
    throw new Error('Job result envelope missing simple (product path)')
  }
  // Intentionally ignore env.raw — product honesty path is simple-only (D-B18).
  return env.simple as ClassificationResult
}

/** Narrow guard that envelope looks like JobResultEnvelope (no zod). */
export function isJobResultEnvelope(value: unknown): value is JobResultEnvelope {
  if (value === null || typeof value !== 'object') return false
  const e = value as Record<string, unknown>
  return e.schema_version === 2 && e.simple !== null && typeof e.simple === 'object'
}

export type JobPollDeps = {
  getStatus: (jobId: string) => Promise<Pick<ClassificationJob, 'status' | 'error'>>
  getResult: (jobId: string) => Promise<unknown>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  intervalMs?: number
  timeoutMs?: number
  signal?: AbortSignal
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Async classify aborted', 'AbortError')
  }
}

/**
 * Poll job status until completed|failed, then fetch result envelope and
 * return `simple` only.
 */
export async function pollJobUntilSimple(
  jobId: string,
  deps: JobPollDeps,
): Promise<ClassificationResult> {
  const intervalMs = deps.intervalMs ?? DEFAULT_JOB_POLL_MS
  const timeoutMs = deps.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS
  const sleep = deps.sleep ?? defaultSleep
  const now = deps.now ?? Date.now
  const started = now()

  // Immediate first status check (no artificial delay before first poll).
  for (;;) {
    throwIfAborted(deps.signal)

    if (now() - started > timeoutMs) {
      throw new Error(
        `Async classify timed out after ${timeoutMs}ms (job ${jobId})`,
      )
    }

    const statusPayload = await deps.getStatus(jobId)
    const status = statusPayload.status

    if (isJobFailed(status)) {
      const detail =
        statusPayload.error?.trim() ||
        'Classification job failed without error detail'
      throw new Error(detail)
    }

    if (isJobCompleted(status)) {
      const envelope = await deps.getResult(jobId)
      return extractSimpleFromEnvelope(envelope)
    }

    await sleep(intervalMs)
  }
}
