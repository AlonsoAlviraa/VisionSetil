/**
 * S4 FE safety-copy gate: forbidden consumption-permission phrases in shipped UI source.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FORBIDDEN_CONSUMPTION_PHRASES } from './riskLabels'

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
