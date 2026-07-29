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

export function relativeTime(iso: string, locale?: string, now = Date.now()): string {
  const en = (locale || '').toLowerCase().startsWith('en')
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const sec = Math.round((now - t) / 1000)
  if (sec < 45) return en ? 'Just now' : 'Ahora'
  if (sec < 3600) {
    const n = Math.max(1, Math.round(sec / 60))
    return en ? `${n} min ago` : `Hace ${n} min`
  }
  if (sec < 86400) {
    const n = Math.max(1, Math.round(sec / 3600))
    return en ? `${n} h ago` : `Hace ${n} h`
  }
  if (sec < 86400 * 7) {
    const n = Math.max(1, Math.round(sec / 86400))
    return en ? `${n} d ago` : `Hace ${n} d`
  }
  return new Date(iso).toLocaleDateString(en ? 'en-GB' : 'es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** @deprecated Prefer relativeTime(iso, locale) */
export function relativeTimeEs(iso: string, now = Date.now()): string {
  return relativeTime(iso, 'es', now)
}

export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/**
 * Human consensus cues for community feed (v1.8 graph eng).
 * Never upgrades model scores to research-grade or edible clearance.
 */
export type CommunityConsensusCue =
  | 'needs_human_second_opinion'
  | 'active_discussion'
  | 'orientation_only'

export type CommunityConsensusChip = {
  cue: CommunityConsensusCue
  labelEs: string
  labelEn: string
  /** Always orientation policy — never research-grade */
  policyEs: string
  policyEn: string
}

const SECOND_OPINION_HINTS = [
  'segunda opinion',
  'segunda opinión',
  'no estoy seguro',
  'no estoy segura',
  'duda',
  'help id',
  'need id',
  'ayuda id',
  'confirmar',
  'lookalike',
  'parecida',
  'mortal',
  'toxico',
  'tóxico',
]

/**
 * Lightweight educational cue from post body + comment count.
 * Human discussion only — never "research grade" from AI.
 */
export function communityConsensusChip(
  body: string,
  commentCount: number,
): CommunityConsensusChip {
  const f = foldCommunityText(body)
  const asksHelp = SECOND_OPINION_HINTS.some((h) => f.includes(foldCommunityText(h)))
  if (asksHelp || commentCount === 0) {
    return {
      cue: 'needs_human_second_opinion',
      labelEs: 'Pide segunda opinión humana',
      labelEn: 'Needs human second opinion',
      policyEs:
        'Consenso humano de campo — no es research-grade ni permiso de consumo.',
      policyEn:
        'Human field consensus only — never research-grade or consumption permission.',
    }
  }
  if (commentCount >= 2) {
    return {
      cue: 'active_discussion',
      labelEs: 'Discusión humana activa',
      labelEn: 'Active human discussion',
      policyEs:
        'Varias voces humanas · nunca certificado de ID del modelo · nunca consumo.',
      policyEn:
        'Several human voices · never model ID certificate · never consumption.',
    }
  }
  return {
    cue: 'orientation_only',
    labelEs: 'Solo orientación de campo',
    labelEn: 'Field orientation only',
    policyEs: 'Feed educativo — no research-grade, no permiso de consumo.',
    policyEn: 'Educational feed — not research-grade, no consumption permission.',
  }
}
