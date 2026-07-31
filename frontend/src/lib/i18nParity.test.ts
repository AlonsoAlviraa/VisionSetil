/**
 * EN locale key tree must cover ES (missing keys break English UI).
 */
import { describe, expect, it } from 'vitest'
import es from '../locales/es/common.json'
import en from '../locales/en/common.json'
import ca from '../locales/ca/common.json'
import eu from '../locales/eu/common.json'

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

  it('CA has every ES leaf key (M6)', () => {
    const esKeys = leafKeys(es)
    const caKeys = new Set(leafKeys(ca))
    const missing = esKeys.filter((k) => !caKeys.has(k))
    expect(missing, `Missing CA keys: ${missing.slice(0, 30).join(', ')}`).toEqual([])
  })

  it('EU has every ES leaf key (M6)', () => {
    const esKeys = leafKeys(es)
    const euKeys = new Set(leafKeys(eu))
    const missing = esKeys.filter((k) => !euKeys.has(k))
    expect(missing, `Missing EU keys: ${missing.slice(0, 30).join(', ')}`).toEqual([])
  })

  it('critical surface namespaces exist in all product locales', () => {
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
      'games',
      'offline',
      'notebook',
    ]) {
      expect((es as Record<string, unknown>)[ns], `es.${ns}`).toBeTruthy()
      expect((en as Record<string, unknown>)[ns], `en.${ns}`).toBeTruthy()
      expect((ca as Record<string, unknown>)[ns], `ca.${ns}`).toBeTruthy()
      expect((eu as Record<string, unknown>)[ns], `eu.${ns}`).toBeTruthy()
    }
  })

  it('identify.uploadTipsPolicy is orientation-only in all locales', () => {
    const esP = (es as { identify: { uploadTipsPolicy?: string } }).identify.uploadTipsPolicy || ''
    const enP = (en as { identify: { uploadTipsPolicy?: string } }).identify.uploadTipsPolicy || ''
    const caP = (ca as { identify: { uploadTipsPolicy?: string } }).identify.uploadTipsPolicy || ''
    const euP = (eu as { identify: { uploadTipsPolicy?: string } }).identify.uploadTipsPolicy || ''
    expect(esP.toLowerCase()).toMatch(/orientaci|abstien/)
    expect(enP.toLowerCase()).toMatch(/orientation|abstain/)
    // CA/EU currently ship an ES base (translation pending) — accept ES orientation language.
    expect(caP.toLowerCase()).toMatch(/orientaci|abst|orientazio|ezetzi/)
    expect(euP.toLowerCase()).toMatch(/orientaci|abst|orientazio|ezetzi|kontsumo/)
    for (const p of [esP, enP, caP, euP]) {
      expect(p.toLowerCase()).not.toMatch(/safe to eat|puedes comer/)
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
