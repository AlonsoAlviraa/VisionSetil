/** API client for VisionSetil backend. */

import axios from 'axios'
import {
  DEFAULT_JOB_POLL_MS,
  DEFAULT_JOB_TIMEOUT_MS,
  pollJobUntilSimple,
} from '../lib/asyncClassify'
import type {
  ClassificationJob,
  ClassificationResult,
  JobResultEnvelope,
  ObservationMetadata,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
const API_KEY = import.meta.env.VITE_API_KEY || ''

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    ...(API_KEY && { 'X-API-Key': API_KEY }),
  },
})

/** Build multipart body shared by sync /classify and async /classify/async. */
export function buildClassifyFormData(
  files: File[],
  metadata?: ObservationMetadata,
  viewTypes?: string[],
  locale?: string,
): FormData {
  const formData = new FormData()

  for (const file of files) {
    formData.append('images', file)
  }

  if (viewTypes && viewTypes.length > 0) {
    // Backend expects comma-separated canonical views (gills,front,habitat,detail).
    formData.append('view_types', viewTypes.join(','))
  }

  if (locale) {
    formData.append('locale', locale)
  }

  if (metadata) {
    if (metadata.title) formData.append('title', metadata.title)
    if (metadata.country) formData.append('country', metadata.country)
    if (metadata.region) formData.append('region', metadata.region)
    if (metadata.habitat) formData.append('habitat', metadata.habitat)
    if (metadata.substrate) formData.append('substrate', metadata.substrate)
    if (metadata.notes) formData.append('notes', metadata.notes)
    if (metadata.smell) formData.append('smell', metadata.smell)
  }

  return formData
}

/**
 * Classify one or more images against the VisionSetil backend (sync).
 *
 * Supports optional observation metadata (habitat, substrate, etc.) which
 * improves classification accuracy through multi-modal fusion.
 * Optional `locale` (es|ca|eu|en) is echoed by the backend for safety/i18n.
 */
export async function classifyImages(
  files: File[],
  metadata?: ObservationMetadata,
  viewTypes?: string[],
  locale?: string,
): Promise<ClassificationResult> {
  const formData = buildClassifyFormData(files, metadata, viewTypes, locale)

  const response = await client.post<ClassificationResult>(
    '/classify',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  )

  return response.data
}

/** Backwards-compatible single-image wrapper. */
export async function classifyImage(file: File): Promise<ClassificationResult> {
  return classifyImages([file])
}

/**
 * Submit images for async classification (POST /classify/async → 202 + job).
 * Caller should poll status / fetch result (or use {@link classifyImagesAsync}).
 */
export async function submitClassifyJob(
  files: File[],
  metadata?: ObservationMetadata,
  viewTypes?: string[],
  locale?: string,
): Promise<ClassificationJob> {
  const formData = buildClassifyFormData(files, metadata, viewTypes, locale)

  const response = await client.post<ClassificationJob>(
    '/classify/async',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      // Async accept is fast; keep a modest timeout separate from poll budget.
      timeout: 60000,
    },
  )

  return response.data
}

/** Poll job status: GET /jobs/{id}. */
export async function getJobStatus(jobId: string): Promise<ClassificationJob> {
  const response = await client.get<ClassificationJob>(`/jobs/${jobId}`)
  return response.data
}

/**
 * Fetch dual-write job result envelope: GET /jobs/{id}/result.
 * Product clients must read `simple` only (D-B18 / D-B24).
 */
export async function getJobResult(jobId: string): Promise<JobResultEnvelope> {
  const response = await client.get<JobResultEnvelope>(`/jobs/${jobId}/result`)
  return response.data
}

export type ClassifyAsyncOptions = {
  intervalMs?: number
  timeoutMs?: number
  signal?: AbortSignal
}

/**
 * Full async product path (B-46):
 * POST /classify/async → poll GET /jobs/{id} → GET /jobs/{id}/result → simple.
 *
 * Returns the same ClassificationResult shape as sync so ResultModeBanner /
 * ResultCard honesty path is identical (mode + quality_gate from simple).
 */
export async function classifyImagesAsync(
  files: File[],
  metadata?: ObservationMetadata,
  viewTypes?: string[],
  locale?: string,
  options?: ClassifyAsyncOptions,
): Promise<ClassificationResult> {
  const job = await submitClassifyJob(files, metadata, viewTypes, locale)
  if (!job?.id) {
    throw new Error('Async classify did not return a job id')
  }

  return pollJobUntilSimple(job.id, {
    getStatus: getJobStatus,
    getResult: getJobResult,
    intervalMs: options?.intervalMs ?? DEFAULT_JOB_POLL_MS,
    timeoutMs: options?.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS,
    signal: options?.signal,
  })
}

/**
 * Prefer async when `useAsync` is true; otherwise sync POST /classify.
 * Never runs sync and async concurrently for the same images.
 */
export async function classifyImagesMaybeAsync(
  files: File[],
  metadata?: ObservationMetadata,
  viewTypes?: string[],
  locale?: string,
  useAsync = false,
  options?: ClassifyAsyncOptions,
): Promise<ClassificationResult> {
  if (useAsync) {
    return classifyImagesAsync(files, metadata, viewTypes, locale, options)
  }
  return classifyImages(files, metadata, viewTypes, locale)
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await client.get('/health')
    return response.status === 200
  } catch {
    return false
  }
}

/**
 * Submit user feedback for a prior classification (active learning loop).
 */
export async function submitFeedback(
  requestId: string,
  isCorrect: boolean,
  correctedSpecies?: string,
): Promise<void> {
  await client.post('/feedback', {
    request_id: requestId,
    is_correct: isCorrect,
    corrected_species: correctedSpecies ?? null,
  })
}
