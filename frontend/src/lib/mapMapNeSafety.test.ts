/**
 * Contract: Spain map surfaces MAP≠safety / cotos≠consumo rails (UX-07a).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const mapPage = readFileSync(resolve(root, 'pages/SpainMapPage.tsx'), 'utf8')
const atelierCss = readFileSync(resolve(root, 'styles/atelier.css'), 'utf8')

function loadMapLocale(lang: string): Record<string, string> {
  const json = JSON.parse(
    readFileSync(resolve(root, `locales/${lang}/common.json`), 'utf8'),
  ) as { map: Record<string, string> }
  return json.map
}

const es = loadMapLocale('es')
const en = loadMapLocale('en')
const ca = loadMapLocale('ca')
const eu = loadMapLocale('eu')

describe('map MAP≠safety / cotos≠consumo (UX-07a)', () => {
  it('SpainMapPage exposes policy banner + cotos policy testids', () => {
    expect(mapPage).toMatch(/data-testid="map-map-ne-safety-banner"/)
    expect(mapPage).toMatch(/data-testid="map-cotos-ne-consumo"/)
    expect(mapPage).toMatch(/data-testid="map-safety-chip"/)
    expect(mapPage).toMatch(/map\.policyBanner/)
    expect(mapPage).toMatch(/map\.cotosPolicy/)
  })

  it('copy rails: MAP≠safety and cotos≠consumo (no forage permission)', () => {
    expect(mapPage).toMatch(/MAP\s*≠\s*seguridad/)
    expect(mapPage).toMatch(/cotos\s*≠\s*consumo/)
    expect(mapPage).not.toMatch(/safe to eat|comestible seguro|puedes comer/i)
  })

  it('policy banner CSS is sticky under app header', () => {
    expect(atelierCss).toMatch(
      /\.map-policy-banner\s*\{[^}]*position:\s*sticky/s,
    )
    expect(atelierCss).toMatch(
      /\.map-policy-banner\s*\{[^}]*top:\s*calc\(\s*var\(--header-h/s,
    )
    // Filters sit below sticky banner so rails remain visible
    expect(atelierCss).toMatch(
      /\.page-map--map-first\s+\.map-chrome__filters\s*\{[^}]*top:\s*calc\(\s*var\(--header-h[^)]*\)\s*\+\s*2\.55rem/s,
    )
  })

  it('locale SSOT: ES/EN/CA/EU policy keys + EN MAP≠safety', () => {
    for (const loc of [es, en, ca, eu]) {
      expect(loc.policyBanner?.length).toBeGreaterThan(20)
      expect(loc.cotosPolicy?.length).toBeGreaterThan(20)
      expect(loc.safetyChip?.length).toBeGreaterThan(8)
      expect(loc.disclaimerShort?.length).toBeGreaterThan(20)
      // Deny forage / consumption permission polarity
      expect(loc.policyBanner).toMatch(
        /MAP\s*≠|≠\s*(seguridad|seguretat|segurtasuna|safety)|no autoritz|no autoriza|ez du|does not authorize|forag|recol|bilket|consum/i,
      )
      expect(loc.policyBanner + ' ' + loc.cotosPolicy).not.toMatch(
        /safe to eat|puedes comer|comestible seguro/i,
      )
    }

    expect(es.policyBanner).toMatch(/MAP\s*≠\s*seguridad/i)
    expect(es.policyBanner).toMatch(/cotos\s*≠\s*consumo/i)
    expect(es.safetyChip).toMatch(/cotos\s*≠\s*consumo/)

    expect(en.policyBanner).toMatch(/MAP\s*≠\s*safety/i)
    expect(en.policyBanner).toMatch(/forag|consum/i)
    expect(en.cotosPolicy).toMatch(/consum|forag|permission/i)

    // CA Catalan (not Spanish clone of new keys)
    expect(ca.policyBanner).toMatch(/MAP\s*≠\s*seguretat/i)
    expect(ca.policyBanner).toMatch(/cotos\s*≠\s*consum/i)
    expect(ca.safetyChip).toMatch(/Educatiu|cotos\s*≠\s*consum/i)
    expect(ca.cotosPolicy).toMatch(/bolets|recol·lecció|consum/i)

    // EU Basque (not Spanish clone of new keys)
    expect(eu.policyBanner).toMatch(/MAP\s*≠\s*segurtasuna/i)
    expect(eu.policyBanner).toMatch(/kotoak\s*≠\s*kontsumoa/i)
    expect(eu.safetyChip).toMatch(/kotoak|kontsumoa|Hezigarria/i)
    expect(eu.cotosPolicy).toMatch(/onddoak|kontsumo|bilketa/i)
  })
})
