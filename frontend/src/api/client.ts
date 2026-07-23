/** API client for VisionSetil backend. */

import axios from 'axios'
import type { ClassificationResult, ObservationMetadata } from './types'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
const API_KEY = import.meta.env.VITE_API_KEY || ''

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    ...(API_KEY && { 'X-API-Key': API_KEY }),
  },
})

/**
 * Honest client-side classify pipeline stages (B-28).
 * Discrete labels only ÔÇö never a fake ML confidence/percent meter.
 * - upload: request body still sending
 * - analyze: body sent; waiting for model inference
 * - apply_policy: response received (server gate/policy already applied)
 */
export type ClassifyClientStage = 'upload' | 'analyze' | 'apply_policy'

export type ClassifyImagesOptions = {
  /** Fired on real request milestones only (no simulated ML %). */
  onStage?: (stage: ClassifyClientStage) => void
}

/**
 * Classify one or more images against the VisionSetil backend.
 *
 * Supports optional observation metadata (habitat, substrate, etc.) which
 * improves classification accuracy through multi-modal fusion.
 */
export async function classifyImages(
  files: File[],
  metadata?: ObservationMetadata,
  viewTypes?: string[],
  localeOrOptions?: string | ClassifyImagesOptions,
  maybeOptions?: ClassifyImagesOptions,
): Promise<ClassificationResult> {
  // Support both (..., locale, options) and (..., options) call shapes.
  const locale =
    typeof localeOrOptions === 'string' ? localeOrOptions : undefined
  const options =
    typeof localeOrOptions === 'object' && localeOrOptions !== null
      ? localeOrOptions
      : maybeOptions

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

  const onStage = options?.onStage
  onStage?.('upload')

  let movedToAnalyze = false
  const markAnalyze = () => {
    if (movedToAnalyze) return
    movedToAnalyze = true
    onStage?.('analyze')
  }

  const response = await client.post<ClassificationResult>(
    '/classify',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        // Real XHR upload completion only — never invent a model %.
        if (event.total != null && event.total > 0 && event.loaded >= event.total) {
          markAnalyze()
        }
      },
    },
  )

  // Some runtimes omit upload progress; ensure we leave "upload" before policy.
  markAnalyze()
  onStage?.('apply_policy')

  return response.data
}

/** Backwards-compatible single-image wrapper. */
export async function classifyImage(file: File): Promise<ClassificationResult> {
  return classifyImages([file])
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
