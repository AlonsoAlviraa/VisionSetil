/**
 * Weather-alert styling for mycological zones (AEMET-like levels).
 */
import type { MushroomConditions } from '../api/weather'

export type AlertLevel = 'extreme' | 'severe' | 'moderate' | 'good' | 'unknown'

export type ZoneAlertMeta = {
  level: AlertLevel
  /** Short label like weather warnings */
  label: string
  /** Spanish advisory line */
  advisory: string
  color: string
  bg: string
  border: string
  score: number | null
}

export function alertFromScore(score: number | null): ZoneAlertMeta {
  if (score === null || Number.isNaN(score)) {
    return {
      level: 'unknown',
      label: 'Sin datos',
      advisory: 'Condiciones no disponibles aún',
      color: '#64748b',
      bg: 'rgba(100, 116, 139, 0.12)',
      border: 'rgba(100, 116, 139, 0.35)',
      score: null,
    }
  }
  if (score < 35) {
    return {
      level: 'extreme',
      label: 'Desfavorable',
      advisory: 'Suelo seco o condiciones pobres para fructificación',
      color: '#b91c1c',
      bg: 'rgba(185, 28, 28, 0.12)',
      border: 'rgba(185, 28, 28, 0.45)',
      score,
    }
  }
  if (score < 55) {
    return {
      level: 'severe',
      label: 'Regular',
      advisory: 'Condiciones mediocres; baja probabilidad de setas',
      color: '#c2410c',
      bg: 'rgba(194, 65, 12, 0.12)',
      border: 'rgba(194, 65, 12, 0.4)',
      score,
    }
  }
  if (score < 75) {
    return {
      level: 'moderate',
      label: 'Aceptable',
      advisory: 'Condiciones pasables; posibles hallazgos locales',
      color: '#a16207',
      bg: 'rgba(161, 98, 7, 0.12)',
      border: 'rgba(161, 98, 7, 0.4)',
      score,
    }
  }
  return {
    level: 'good',
    label: 'Favorable',
    advisory: 'Humedad y temperatura favorables a fructificación',
    color: '#15803d',
    bg: 'rgba(21, 128, 61, 0.12)',
    border: 'rgba(21, 128, 61, 0.4)',
    score,
  }
}

export function alertFromConditions(c: MushroomConditions | null): ZoneAlertMeta {
  if (!c) return alertFromScore(null)
  return alertFromScore(c.score)
}

/** Concurrent weather fetch with pool limit (avoid Open-Meteo bursts). */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx], idx)
    }
  }
  const n = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}
