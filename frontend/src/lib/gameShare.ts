/**
 * Honest game share cards — orientation footer always, never forage / consumption.
 *
 * Policy (UX-05):
 * - Clipboard / Web Share text must include orientation footer.
 * - Never "comestible", "safe to eat", or forage permission language.
 * - Species risk may appear as study orientation only (RiskChip labels), never as food OK.
 */
import {
  DAILY_GAME_MODES,
  dailyGamesCompletion,
  gamesDayKey,
  readDailyGamesProgress,
  type DailyGameModeId,
} from './dailyGames'

/** Footer line required on every share card (ES primary product language). */
export const SHARE_ORIENTATION_FOOTER_ES =
  'Solo orientación · nunca recolección · nunca consumo'

export const SHARE_ORIENTATION_FOOTER_EN =
  'Orientation only · never forage · never consumption permission'

export function shareOrientationFooter(locale?: string): string {
  const loc = (locale || 'es').toLowerCase()
  return loc.startsWith('en') ? SHARE_ORIENTATION_FOOTER_EN : SHARE_ORIENTATION_FOOTER_ES
}

function isEnglish(locale?: string): boolean {
  return (locale || '').toLowerCase().startsWith('en')
}

export type DailyBoardShareInput = {
  day?: string
  /** Override progress (tests / SSR). */
  done?: number
  total?: number
  /** Per-mode completion map override. */
  doneMap?: Partial<Record<DailyGameModeId, boolean>>
  locale?: string
  /** Study streak days (educational celebration only). */
  streak?: number
}

/**
 * Hub daily-board share card (LoLdle multi-mode progress).
 * No species spoilers; no edible framing.
 */
export function buildDailyBoardShareCard(input: DailyBoardShareInput = {}): string {
  const day = input.day ?? gamesDayKey()
  const completion = dailyGamesCompletion(day)
  const done = input.done ?? completion.done
  const total = input.total ?? completion.total
  const progress = input.doneMap ?? readDailyGamesProgress(day).done
  const chips = DAILY_GAME_MODES.map((m) => (progress[m.id] ? '✅' : '⬜')).join('')
  const en = isEnglish(input.locale)
  const lines: string[] = [
    en
      ? `VisionSetil · daily study board ${day}`
      : `VisionSetil · retos del día ${day}`,
    en ? `Progress: ${done}/${total} ${chips}` : `Progreso: ${done}/${total} ${chips}`,
  ]
  if (input.streak != null && input.streak > 0) {
    lines.push(
      en
        ? `Study streak: ${input.streak} day${input.streak === 1 ? '' : 's'}`
        : `Racha de estudio: ${input.streak} día${input.streak === 1 ? '' : 's'}`,
    )
  }
  lines.push('')
  lines.push(shareOrientationFooter(input.locale))
  lines.push(
    en
      ? 'Educational games — not real-world ID or harvest permission'
      : 'Juegos educativos — no identifica setas reales ni autoriza recolección',
  )
  return lines.join('\n')
}

export type ModeShareInput = {
  /** Human mode title (e.g. Setadle Clásico, Wordle, Reto). */
  modeTitle: string
  won: boolean
  guesses?: number
  maxGuesses?: number
  /** Optional emoji grid (Wordle/Setadle style) — no edible symbols. */
  emojiGrid?: string
  day?: string
  locale?: string
  /**
   * Optional post-reveal study line (common / taxon).
   * Never include edibility or forage advice.
   */
  common?: string
  taxon?: string
  /** Orientation risk short label only (e.g. Mortal / Venenosa) — never "comestible". */
  riskShort?: string
  score?: number
  accuracyPct?: number
}

/**
 * Per-mode share after a round ends (Setadle / Wordle / Quiz).
 * Always appends orientation footer. Never consumption permission.
 */
export function buildModeShareCard(input: ModeShareInput): string {
  const en = isEnglish(input.locale)
  const day = input.day ?? gamesDayKey()
  const result = input.won
    ? en
      ? 'Solved'
      : 'Resuelto'
    : en
      ? 'Not solved'
      : 'Sin acierto'
  const lines: string[] = [
    `VisionSetil · ${input.modeTitle}`,
    `${result}${input.guesses != null ? ` · ${input.guesses}${input.maxGuesses != null ? `/${input.maxGuesses}` : ''} ${en ? 'tries' : 'intentos'}` : ''}`,
  ]
  if (input.score != null) {
    lines.push(
      en
        ? `Score: ${input.score}${input.accuracyPct != null ? ` · ${input.accuracyPct}% accuracy` : ''}`
        : `Puntos: ${input.score}${input.accuracyPct != null ? ` · ${input.accuracyPct}% acierto` : ''}`,
    )
  }
  if (input.emojiGrid?.trim()) {
    lines.push(input.emojiGrid.trim())
  }
  if (input.common || input.taxon) {
    const name = [input.common, input.taxon ? `(${input.taxon})` : ''].filter(Boolean).join(' ')
    lines.push(en ? `Study: ${name}` : `Estudio: ${name}`)
  }
  if (input.riskShort?.trim()) {
    lines.push(
      en
        ? `Risk orientation: ${input.riskShort.trim()}`
        : `Riesgo (orientación): ${input.riskShort.trim()}`,
    )
  }
  lines.push(`📅 ${day}`)
  lines.push('')
  lines.push(shareOrientationFooter(input.locale))
  return lines.join('\n')
}

/** Setadle classic/photo/habitat share helper. */
export function buildSetadleShareCard(
  input: Omit<ModeShareInput, 'modeTitle'> & { modeTitle?: string },
): string {
  return buildModeShareCard({
    ...input,
    modeTitle: input.modeTitle || 'Setadle',
  })
}

/** Wordle de setas share helper. */
export function buildWordleShareCard(
  input: Omit<ModeShareInput, 'modeTitle'> & { modeTitle?: string },
): string {
  return buildModeShareCard({
    ...input,
    modeTitle: input.modeTitle || 'Wordle de setas',
  })
}

/** Reto / quiz finished share helper. */
export function buildQuizShareCard(
  input: Omit<ModeShareInput, 'modeTitle'> & { modeTitle?: string },
): string {
  return buildModeShareCard({
    ...input,
    modeTitle: input.modeTitle || 'Reto micológico',
    won: input.won ?? true,
  })
}

export type ShareResult = 'shared' | 'copied' | 'failed'

/**
 * Prefer Web Share API; fall back to clipboard.
 * Never mutates text — callers must pass honest builders above.
 */
export async function shareGameText(
  text: string,
  options: { title?: string } = {},
): Promise<ShareResult> {
  const title = options.title || 'VisionSetil'
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title, text })
      return 'shared'
    }
  } catch {
    /* user cancel or share fail → clipboard */
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
  } catch {
    /* ignore */
  }
  return 'failed'
}
