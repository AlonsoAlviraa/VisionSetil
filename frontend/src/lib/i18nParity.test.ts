/**
 * EN locale key tree must cover ES (missing keys break English UI).
 */
import { describe, expect, it } from 'vitest'
import es from '../locales/es/common.json'
import en from '../locales/en/common.json'

function leafKeys(obj: unknown, prefix = ''): string[] {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    return prefix ? [prefix] : []
  }
  const out: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...leafKeys(v, path))
    } else {
      out.push(path)
    }
  }
  return out
}

describe('i18n EN/ES key parity', () => {
  it('EN has every ES leaf key', () => {
    const esKeys = leafKeys(es)
    const enKeys = new Set(leafKeys(en))
    const missing = esKeys.filter((k) => !enKeys.has(k))
    expect(missing, `Missing EN keys: ${missing.slice(0, 20).join(', ')}`).toEqual([])
  })

  it('critical surface namespaces exist in both locales', () => {
    for (const ns of [
      'nav',
      'home',
      'encyclopedia',
      'identify',
      'setadle',
      'community',
      'expert',
      'education',
      'names',
      'safety',
      'risk',
      'result',
    ]) {
      expect((es as Record<string, unknown>)[ns], `es.${ns}`).toBeTruthy()
      expect((en as Record<string, unknown>)[ns], `en.${ns}`).toBeTruthy()
    }
  })

  it('EN home hero is not Spanish', () => {
    expect(en.home.heroTitleLine1.toLowerCase()).not.toMatch(/setas con/)
    expect(en.home.ctaIdentifyShort.toLowerCase()).toMatch(/identify/)
    expect(en.encyclopedia.titlePage.toLowerCase()).toMatch(/encyclopedia|mushroom/)
  })

  it('critical long EN strings differ from ES (not untranslated copy-paste)', () => {
    const pairs: Array<[string, string, string]> = [
      ['home.heroLead', en.home.heroLead, es.home.heroLead],
      ['identify.bannerLead', en.identify.bannerLead, es.identify.bannerLead],
      ['encyclopedia.titlePage', en.encyclopedia.titlePage, es.encyclopedia.titlePage],
      ['result.deadlyCalloutTitle', en.result.deadlyCalloutTitle, es.result.deadlyCalloutTitle],
      ['community.emptyBody', en.community.emptyBody, es.community.emptyBody],
      ['expert.emptyDraftBody', en.expert.emptyDraftBody, es.expert.emptyDraftBody],
    ]
    for (const [path, a, b] of pairs) {
      expect(a, path).toBeTruthy()
      expect(b, path).toBeTruthy()
      expect(a, path).not.toBe(b)
    }
  })

  it('EN identify bannerLead keeps never-consume posture', () => {
    expect(en.identify.bannerLead.toLowerCase()).toMatch(
      /orientation|never|consum/,
    )
  })

  it('v1.8.3 softConfirm + pin list + consensus keys exist and EN differs from ES', () => {
    const idEs = es.identify as Record<string, unknown>
    const idEn = en.identify as Record<string, unknown>
    expect(idEs.softConfirm).toBeTruthy()
    expect(idEn.softConfirm).toBeTruthy()
    expect(idEs.gpsPinLabel).toBeTruthy()
    expect(idEn.gpsPinLabel).toBeTruthy()
    expect(String(idEn.gpsPinLabel)).not.toBe(String(idEs.gpsPinLabel))
    expect(String(idEn.gpsPinLabel).toLowerCase()).toMatch(/no exif|lat\/lng|orientation|notebook/)

    const nbEs = es.notebook as Record<string, unknown>
    const nbEn = en.notebook as Record<string, unknown>
    for (const k of ['pinListTitle', 'pinListPolicy', 'pinListStats', 'pinPolicy']) {
      expect(nbEs[k], `es.notebook.${k}`).toBeTruthy()
      expect(nbEn[k], `en.notebook.${k}`).toBeTruthy()
      expect(String(nbEn[k]), k).not.toBe(String(nbEs[k]))
    }
    expect(String(nbEn.pinListPolicy).toLowerCase()).toMatch(/no exif|not uploaded|forag/)

    const cEs = es.community as Record<string, unknown>
    const cEn = en.community as Record<string, unknown>
    expect(cEs.consensusTitle).toBeTruthy()
    expect(cEn.consensusTitle).toBeTruthy()
    expect(String(cEn.consensusTitle)).not.toBe(String(cEs.consensusTitle))
    expect(String(cEn.consensusBody).toLowerCase()).toMatch(
      /orientation|never|consum|research-grade|mycologist/,
    )
  })
})
