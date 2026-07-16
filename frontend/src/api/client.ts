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
 * Classify one or more images against the VisionSetil backend.
 *
 * Supports optional observation metadata (habitat, substrate, etc.) which
 * improves classification accuracy through multi-modal fusion.
 */
export async function classifyImages(
  files: File[],
  metadata?: ObservationMetadata,
): Promise<ClassificationResult> {
  const formData = new FormData()

  for (const file of files) {
    formData.append('images', file)
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