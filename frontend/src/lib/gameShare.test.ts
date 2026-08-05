import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  buildDailyBoardShareCard,
  buildModeShareCard,
  buildQuizShareCard,
  buildSetadleShareCard,
  buildWordleShareCard,
  shareFeedbackMessage,
  shareGameText,
  shareOrientationFooter,
  SHARE_ORIENTATION_FOOTER_EN,
  SHARE_ORIENTATION_FOOTER_ES,
} from './gameShare'
import {
  __setDailyGamesStorageForTests,
  markDailyGameDone,
  gamesDayKey,
} from './dailyGames'
import { FORBIDDEN_CONSUMPTION_PHRASES } from './riskLabels'

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function assertNoForbidden(text: string) {
  const f = fold(text)
  for (const phrase of FORBIDDEN_CONSUMPTION_PHRASES) {
    expect(f, `share must not contain "${phrase}"`).not.toContain(fold(phrase))
  }
  // Extra forage / consumption permission denylist for share cards
  const extra = [
    'safe to eat',
    'puedes comer',
    'excelente comestible',
    'buen comestible',
    'apto para consumo',
    'se puede comer',
    'you can eat',
    'permission to forage',
    'permiso de recoleccion',
    'product_unlock',
  ]
  for (const phrase of extra) {
    expect(f, `share must not contain "${phrase}"`).not.toContain(fold(phrase))
  }
}

describe('gameShare (UX-05 honest share)', () => {
  beforeEach(() => {
    const mem = new Map<string, string>()
    __setDailyGamesStorageForTests({
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v)
      },
      removeItem: (k) => {
        mem.delete(k)
      },
    })
  })

  it('orientation footer is never-forage / never-consume', () => {
    expect(shareOrientationFooter('es')).toBe(SHARE_ORIENTATION_FOOTER_ES)
    expect(shareOrientationFooter('en')).toBe(SHARE_ORIENTATION_FOOTER_EN)
    assertNoForbidden(SHARE_ORIENTATION_FOOTER_ES)
    assertNoForbidden(SHARE_ORIENTATION_FOOTER_EN)
    expect(fold(SHARE_ORIENTATION_FOOTER_ES)).toMatch(/orientacion/)
    expect(fold(SHARE_ORIENTATION_FOOTER_ES)).toMatch(/nunca recoleccion|nunca consumo/)
    expect(fold(SHARE_ORIENTATION_FOOTER_EN)).toMatch(/orientation only/)
    expect(fold(SHARE_ORIENTATION_FOOTER_EN)).toMatch(/never forage|never consumption/)
  })

  it('daily board share includes progress chips + orientation footer', () => {
    const day = gamesDayKey()
    markDailyGameDone('wordle', day)
    markDailyGameDone('quiz', day)
    const text = buildDailyBoardShareCard({ day, streak: 3, locale: 'es' })
    expect(text).toContain(day)
    expect(text).toMatch(/2\/\d/)
    expect(text).toContain('✅')
    expect(text).toContain('⬜')
    expect(text).toContain(SHARE_ORIENTATION_FOOTER_ES)
    expect(text).toMatch(/Racha de estudio: 3/)
    assertNoForbidden(text)
  })

  it('daily board share EN is orientation-only', () => {
    const text = buildDailyBoardShareCard({
      day: '2026-08-05',
      done: 1,
      total: 5,
      doneMap: { quiz: true },
      locale: 'en',
      streak: 1,
    })
    expect(text).toContain(SHARE_ORIENTATION_FOOTER_EN)
    expect(text).toMatch(/Progress: 1\/5/)
    expect(text).toMatch(/Study streak: 1 day/)
    assertNoForbidden(text)
  })

  it('setadle / wordle / quiz share cards always append orientation footer', () => {
    const setadle = buildSetadleShareCard({
      won: true,
      guesses: 4,
      maxGuesses: 8,
      modeTitle: 'Setadle · Clásico',
      common: 'Boletus',
      taxon: 'Boletus edulis',
      riskShort: 'Orientación',
      emojiGrid: '🟩⬜⬜\n🟩🟩⬜',
      locale: 'es',
    })
    const wordle = buildWordleShareCard({
      won: false,
      guesses: 6,
      maxGuesses: 6,
      common: 'Oronja verde',
      taxon: 'Amanita phalloides',
      riskShort: 'Mortal',
      locale: 'es',
    })
    const quiz = buildQuizShareCard({
      score: 420,
      accuracyPct: 83,
      locale: 'es',
    })
    for (const text of [setadle, wordle, quiz]) {
      expect(text).toContain(SHARE_ORIENTATION_FOOTER_ES)
      assertNoForbidden(text)
    }
    expect(setadle).toMatch(/Resuelto/)
    expect(wordle).toMatch(/Sin acierto/)
    expect(wordle).toMatch(/Riesgo \(orientación\): Mortal/)
    expect(quiz).toMatch(/Puntos: 420/)
    // Quiz is score-centric — no misleading Resuelto from partial accuracy
    expect(quiz).not.toMatch(/Resuelto|Sin acierto/)
  })

  it('mode share never treats risk as edible clearance', () => {
    const text = buildModeShareCard({
      modeTitle: 'Reto',
      won: true,
      riskShort: 'Desconocido / riesgoso',
      common: 'Cualquiera',
      taxon: 'Species sp.',
      locale: 'es',
    })
    assertNoForbidden(text)
    expect(fold(text)).toMatch(/orientacion|riesgo/)
    expect(fold(text)).not.toMatch(/\bcomestible\b/)
  })

  it('shareGameText: AbortError is cancelled (no clipboard)', async () => {
    const prevShare = navigator.share
    const prevClipboard = navigator.clipboard
    const writeText = vi.fn(async () => undefined)
    // @ts-expect-error test stub
    navigator.share = async () => {
      const err = new Error('user cancelled')
      err.name = 'AbortError'
      throw err
    }
    // @ts-expect-error test stub
    navigator.clipboard = { writeText }

    const r = await shareGameText('hola', { title: 't' })
    expect(r).toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
    expect(shareFeedbackMessage('cancelled', (k, o) => o?.defaultValue || k)).toBeNull()

    // @ts-expect-error restore
    navigator.share = prevShare
    // @ts-expect-error restore
    navigator.clipboard = prevClipboard
  })
})
