/**
 * Table-driven tests for assessPhotoClientHints (UX-03 PhotoCoach).
 */
import { describe, expect, it } from 'vitest'
import {
  ASPECT_EXTREME_RATIO,
  EDGE_SMALL_PX,
  FILE_TINY_BYTES,
  LUMA_BRIGHT_MIN,
  LUMA_DARK_MAX,
  PHOTO_COACH_SKILL_KEY,
  assessPhotoClientHints,
  checklistForView,
  examplesForView,
  probePhotoClientMeta,
  readPhotoCoachSkill,
  recordPhotoCoachOpen,
  type PhotoClientHintInput,
} from './photoCoach'

function codes(input: PhotoClientHintInput, opts?: { luminance?: boolean }) {
  return assessPhotoClientHints(input, opts).map((h) => h.code)
}

describe('assessPhotoClientHints', () => {
  const table: Array<{
    name: string
    input: PhotoClientHintInput
    options?: { luminance?: boolean }
    expectCodes: string[]
  }> = [
    {
      name: 'healthy mid-size square → no hints',
      input: { byteLength: 120_000, width: 800, height: 800 },
      expectCodes: [],
    },
    {
      name: 'file_tiny when byteLength under 40k',
      input: { byteLength: FILE_TINY_BYTES - 1 },
      expectCodes: ['file_tiny'],
    },
    {
      name: 'no file_tiny at exact threshold',
      input: { byteLength: FILE_TINY_BYTES },
      expectCodes: [],
    },
    {
      name: 'no file_tiny when byteLength is 0 (unknown / empty skip)',
      input: { byteLength: 0 },
      expectCodes: [],
    },
    {
      name: 'edge_small when min edge < 400',
      input: { byteLength: 80_000, width: EDGE_SMALL_PX - 1, height: 600 },
      expectCodes: ['edge_small'],
    },
    {
      name: 'no edge_small at 400',
      input: { byteLength: 80_000, width: EDGE_SMALL_PX, height: EDGE_SMALL_PX },
      expectCodes: [],
    },
    {
      name: 'aspect_extreme when ratio > 3',
      input: {
        byteLength: 90_000,
        width: EDGE_SMALL_PX * ASPECT_EXTREME_RATIO + 100,
        height: EDGE_SMALL_PX,
      },
      expectCodes: ['aspect_extreme'],
    },
    {
      name: 'aspect at exactly 3 is ok',
      input: {
        byteLength: 90_000,
        width: EDGE_SMALL_PX * ASPECT_EXTREME_RATIO,
        height: EDGE_SMALL_PX,
      },
      expectCodes: [],
    },
    {
      name: 'dims missing → no edge/aspect (fail-open)',
      input: { byteLength: 90_000 },
      expectCodes: [],
    },
    {
      name: 'tiny + small edge stacks',
      input: { byteLength: 10_000, width: 200, height: 200 },
      expectCodes: ['file_tiny', 'edge_small'],
    },
    {
      name: 'luminance off (default) ignores lumaMean',
      input: { byteLength: 90_000, width: 800, height: 800, lumaMean: 10 },
      options: { luminance: false },
      expectCodes: [],
    },
    {
      name: 'luminance off when options omitted ignores lumaMean',
      input: { byteLength: 90_000, width: 800, height: 800, lumaMean: 10 },
      expectCodes: [],
    },
    {
      name: 'luma_dark when luminance on and mean low',
      input: {
        byteLength: 90_000,
        width: 800,
        height: 800,
        lumaMean: LUMA_DARK_MAX - 1,
      },
      options: { luminance: true },
      expectCodes: ['luma_dark'],
    },
    {
      name: 'luma_bright when luminance on and mean high',
      input: {
        byteLength: 90_000,
        width: 800,
        height: 800,
        lumaMean: LUMA_BRIGHT_MIN + 1,
      },
      options: { luminance: true },
      expectCodes: ['luma_bright'],
    },
    {
      name: 'luminance on but no mean → no luma hints',
      input: { byteLength: 90_000, width: 800, height: 800 },
      options: { luminance: true },
      expectCodes: [],
    },
    {
      name: 'mid luma with flag on → no luma hints',
      input: { byteLength: 90_000, width: 800, height: 800, lumaMean: 120 },
      options: { luminance: true },
      expectCodes: [],
    },
  ]

  it.each(table)('$name', ({ input, options, expectCodes }) => {
    expect(codes(input, options)).toEqual(expectCodes)
  })

  it('hint objects include severity and messageKey', () => {
    const hints = assessPhotoClientHints({ byteLength: 5_000 })
    expect(hints).toHaveLength(1)
    expect(hints[0]).toMatchObject({
      code: 'file_tiny',
      severity: 'warn',
      messageKey: 'identify.coach.hint.file_tiny',
    })
  })
})

describe('slot checklists & examples (zero webp required)', () => {
  it('checklist covers all four canonical views with ≥2 items', () => {
    for (const view of ['gills', 'front', 'habitat', 'detail'] as const) {
      const items = checklistForView(view)
      expect(items.length, view).toBeGreaterThanOrEqual(2)
      for (const item of items) {
        expect(item.id).toBeTruthy()
        expect(item.labelEs).toBeTruthy()
        expect(item.labelEn).toBeTruthy()
      }
    }
  })

  it('examples JSON has good+bad per view with cssFrame (zero webp: no thumbs required)', () => {
    for (const view of ['gills', 'front', 'habitat', 'detail'] as const) {
      const ex = examplesForView(view)
      expect(ex.some((e) => e.quality === 'good'), `${view} good`).toBe(true)
      expect(ex.some((e) => e.quality === 'bad'), `${view} bad`).toBe(true)
      for (const e of ex) {
        expect(e.cssFrame).toBeTruthy()
        // Ship without public/coach assets — omit thumb until media lands
        expect(e.thumb, `${e.id} should not force missing webp`).toBeUndefined()
        expect(e.labelEs).toMatch(/captura|diagnóst|perfil|hábitat|macro|sombre|recorte/i)
        // Never consumption framing
        expect(e.labelEs.toLowerCase()).not.toMatch(/comestible|seguro para comer|puedes comer/)
        expect(e.labelEn.toLowerCase()).not.toMatch(/safe to eat|edible clearance|you can eat/)
      }
    }
  })
})

describe('probePhotoClientMeta (progressive, fail-open)', () => {
  it('returns empty for null/empty source', async () => {
    expect(await probePhotoClientMeta(null)).toEqual({})
    expect(await probePhotoClientMeta('')).toEqual({})
    expect(await probePhotoClientMeta(undefined)).toEqual({})
  })

  it('returns empty on decode failure (no throw)', async () => {
    const out = await probePhotoClientMeta('blob:invalid-or-missing')
    expect(out).toEqual({})
  })
})

describe('optional photo coach skill counter', () => {
  it('records opens in memory storage', () => {
    const mem = new Map<string, string>()
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
    }
    expect(readPhotoCoachSkill(storage).opens).toBe(0)
    recordPhotoCoachOpen(storage)
    recordPhotoCoachOpen(storage)
    const skill = readPhotoCoachSkill(storage)
    expect(skill.opens).toBe(2)
    expect(skill.lastDay).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(mem.get(PHOTO_COACH_SKILL_KEY)).toBeTruthy()
  })

  it('fail-open without storage', () => {
    expect(readPhotoCoachSkill(null).opens).toBe(0)
    expect(recordPhotoCoachOpen(undefined).opens).toBe(0)
  })
})
