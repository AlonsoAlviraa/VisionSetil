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

const STACK_COPY = {
  es: {
    demo: {
      label: 'Modo demo (mock)',
      hint: 'Sin pesos reales cargados — pistas de ejemplo, no modelo de campo.',
    },
    loaded: {
      label: 'Modelo cargado',
      hint: 'Backends reales en stack. Sigue siendo solo orientación.',
    },
    mixed: {
      label: 'Stack mixto',
      hint: 'Algunos backends mock y otros reales. No confíes ciegamente.',
    },
    unknown: {
      label: 'Stack desconocido',
      hint: 'No hay información del backend en la respuesta.',
    },
  },
  en: {
    demo: {
      label: 'Demo mode (mock)',
      hint: 'No real weights loaded — sample cues, not a field model.',
    },
    loaded: {
      label: 'Model loaded',
      hint: 'Real backends in the stack. Still orientation only.',
    },
    mixed: {
      label: 'Mixed stack',
      hint: 'Some mock and some real backends. Do not trust blindly.',
    },
    unknown: {
      label: 'Unknown stack',
      hint: 'No backend information in the response.',
    },
  },
} as const

export function stackBadge(
  stack: ModelStack | null | undefined,
  locale?: string,
): {
  mode: StackMode
  label: string
  hint: string
} {
  const mode = stackModeFromModelStack(stack)
  const pack = (locale || '').toLowerCase().startsWith('en')
    ? STACK_COPY.en
    : STACK_COPY.es
  return { mode, ...pack[mode] }
}

/** @deprecated Prefer stackBadge(stack, locale) */
export function stackBadgeEs(stack: ModelStack | null | undefined): {
  mode: StackMode
  label: string
  hint: string
} {
  return stackBadge(stack, 'es')
}
