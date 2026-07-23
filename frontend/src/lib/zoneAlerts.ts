/**
 * Weather-alert styling for mycological zones (AEMET-like levels).
 * D-12: hotspot radius helpers for map visual polish (educational, not forage permission).
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

export type ZoneAbundance = 'alta' | 'media' | 'baja' | string

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

/**
 * Visual hotspot radius in meters for CircleMarker/Circle (D-12).
 * Scales with abundance + live score; capped for mobile clarity.
 * Educational glow only — not a legal forage area.
 */
export function hotspotRadiusMeters(
  abundance: ZoneAbundance = 'media',
  score: number | null = null,
): number {
  const base =
    abundance === 'alta' ? 14_000 : abundance === 'baja' ? 7_000 : 10_000
  if (score == null || Number.isNaN(score)) return Math.round(base * 0.55)
  const boost = 0.55 + Math.min(1, Math.max(0, score / 100)) * 0.7
  return Math.round(base * boost)
}

/** Whether a zone should show a filled hotspot glow (favorable/acceptable). */
export function isHotspotActive(level: AlertLevel): boolean {
  return level === 'good' || level === 'moderate'
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

/**
 * Progressive weather load: process in chunks so first paint stays light (D-12).
 * Calls `onChunk` after each batch with partial results (order preserved overall).
 */
export async function mapPoolChunked<T, R>(
  items: T[],
  opts: {
    concurrency?: number
    chunkSize?: number
    onChunk?: (partial: Array<{ index: number; value: R }>) => void
  },
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const concurrency = opts.concurrency ?? 3
  const chunkSize = opts.chunkSize ?? 12
  const results: R[] = new Array(items.length)
  for (let start = 0; start < items.length; start += chunkSize) {
    const slice = items.slice(start, start + chunkSize)
    const chunk = await mapPool(slice, concurrency, (item, j) => fn(item, start + j))
    const partial: Array<{ index: number; value: R }> = []
    for (let j = 0; j < chunk.length; j++) {
      results[start + j] = chunk[j]
      partial.push({ index: start + j, value: chunk[j] })
    }
    opts.onChunk?.(partial)
  }
  return results
}
