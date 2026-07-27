/**
 * Client-side community safety helpers.
 * Blocks consumption-permission language before post/comment submit.
 */
import { FORBIDDEN_CONSUMPTION_PHRASES } from './riskLabels'

/** Extra ES/EN phrases that must never appear as foraging advice. */
const EXTRA_FORBIDDEN = [
  'se puede comer',
  'se puede consumir',
  'apto para consumo',
  'buena para comer',
  'come esta',
  'cómetela',
  'comela',
  'receta',
  'cocinar y comer',
  'edible and safe',
  'you can eat',
  'safe for consumption',
] as const

export function foldCommunityText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
}

/** Returns first matched forbidden phrase, or null if clean. */
export function findForbiddenCommunityPhrase(text: string): string | null {
  const f = foldCommunityText(text)
  if (!f) return null
  const all = [...FORBIDDEN_CONSUMPTION_PHRASES, ...EXTRA_FORBIDDEN]
  for (const phrase of all) {
    const p = foldCommunityText(phrase)
    if (p && f.includes(p)) return phrase
  }
  return null
}

export function communityTextIsSafe(text: string): boolean {
  return findForbiddenCommunityPhrase(text) == null
}

export function relativeTimeEs(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const sec = Math.round((now - t) / 1000)
  if (sec < 45) return 'Ahora'
  if (sec < 3600) return `Hace ${Math.max(1, Math.round(sec / 60))} min`
  if (sec < 86400) return `Hace ${Math.max(1, Math.round(sec / 3600))} h`
  if (sec < 86400 * 7) return `Hace ${Math.max(1, Math.round(sec / 86400))} d`
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
