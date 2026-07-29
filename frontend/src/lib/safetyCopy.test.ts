/**
 * S4 FE safety-copy gate: forbidden consumption-permission phrases in shipped UI source.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FORBIDDEN_CONSUMPTION_PHRASES } from './riskLabels'
import {
  ENCYCLOPEDIA_FOOD_FILTER_NOTE_EN,
  ENCYCLOPEDIA_FOOD_FILTER_NOTE_ES,
  ML_LAB_METRICS_DISCLAIMER_EN,
  ML_LAB_METRICS_DISCLAIMER_ES,
  ORIENTATION_STICKY_EN,
  ORIENTATION_STICKY_ES,
  orientationStickyLine,
} from './safetyCopy'

describe('safetyCopy helpers', () => {
  it('orientation sticky denies consumption (ES + EN)', () => {
    expect(orientationStickyLine().toLowerCase()).toMatch(/orientaci[oó]n|nunca/)
    expect(ORIENTATION_STICKY_ES.toLowerCase()).toContain('nunca')
    expect(ORIENTATION_STICKY_ES.toLowerCase()).not.toMatch(/puedes comer|safe to eat/)
    expect(orientationStickyLine('en').toLowerCase()).toMatch(/orientation|never/)
    expect(ORIENTATION_STICKY_EN.toLowerCase()).toContain('never')
    expect(ORIENTATION_STICKY_EN.toLowerCase()).not.toMatch(/safe to eat|puedes comer/)
  })

  it('ML lab disclaimer does not unlock identify/consume', () => {
    const s = ML_LAB_METRICS_DISCLAIMER_ES.toLowerCase()
    expect(s).toMatch(/no desbloquean|orientation/)
    expect(s).not.toMatch(/puedes comer|safe to eat|apto para consum/)
    const en = ML_LAB_METRICS_DISCLAIMER_EN.toLowerCase()
    expect(en).toMatch(/do not unlock|orientation/)
    expect(en).not.toMatch(/safe to eat|puedes comer/)
  })

  it('encyclopedia food note is orientation-only', () => {
    expect(ENCYCLOPEDIA_FOOD_FILTER_NOTE_ES.toLowerCase()).toMatch(/no son permiso/)
    expect(ENCYCLOPEDIA_FOOD_FILTER_NOTE_EN.toLowerCase()).toMatch(/not permission/)
  })
})

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue
      walkTsx(p, acc)
    } else if (/\.(tsx|ts)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) {
      acc.push(p)
    }
  }
  return acc
}

describe('safety copy (FE product sources)', () => {
  it('does not contain forbidden consumption-permission phrases', () => {
    const root = join(process.cwd(), 'src')
    const files = walkTsx(root)
    const hits: string[] = []
    for (const file of files) {
      // Skip static data DBs and the allowlist module that *defines* forbidden phrases
      if (file.includes(`${join('src', 'data')}`)) continue
      if (file.endsWith(`${join('lib', 'riskLabels.ts')}`) || file.endsWith('riskLabels.ts')) continue
      const text = readFileSync(file, 'utf8').toLowerCase()
      for (const phrase of FORBIDDEN_CONSUMPTION_PHRASES) {
        if (text.includes(phrase.toLowerCase())) {
          hits.push(`${file}: ${phrase}`)
        }
      }
    }
    expect(hits).toEqual([])
  })
})
