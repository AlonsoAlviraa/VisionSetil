/** Human labels for classifier model_stack (Wave D honesty). */
import type { ModelStack } from '../api/types'

export type StackMode = 'demo' | 'loaded' | 'mixed' | 'unknown'

function isMockBackend(name: string | undefined | null): boolean {
  const n = (name || '').toLowerCase()
  if (!n) return true
  return (
    n.includes('mock') ||
    n.includes('stub') ||
    n.includes('placeholder') ||
    n.includes('demo') ||
    n === 'none' ||
    n === 'n/a'
  )
}

export function stackModeFromModelStack(stack: ModelStack | null | undefined): StackMode {
  if (!stack) return 'unknown'
  const parts = [
    stack.detector,
    stack.visual_embedder,
    stack.image_text_embedder,
    stack.metadata_encoder,
  ]
  const mocks = parts.filter((p) => isMockBackend(p)).length
  if (mocks === parts.length) return 'demo'
  if (mocks === 0) return 'loaded'
  return 'mixed'
}

export function stackBadgeEs(stack: ModelStack | null | undefined): {
  mode: StackMode
  label: string
  hint: string
} {
  const mode = stackModeFromModelStack(stack)
  if (mode === 'demo') {
    return {
      mode,
      label: 'Modo demo (mock)',
      hint: 'Sin pesos reales cargados — pistas de ejemplo, no modelo de campo.',
    }
  }
  if (mode === 'loaded') {
    return {
      mode,
      label: 'Modelo cargado',
      hint: 'Backends reales en stack. Sigue siendo solo orientación.',
    }
  }
  if (mode === 'mixed') {
    return {
      mode,
      label: 'Stack mixto',
      hint: 'Algunos backends mock y otros reales. No confíes ciegamente.',
    }
  }
  return {
    mode: 'unknown',
    label: 'Stack desconocido',
    hint: 'No hay información del backend en la respuesta.',
  }
}
