/**
 * Contract: Spain map surfaces MAP≠safety / cotos≠consumo rails (UX-07a).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const mapPage = readFileSync(resolve(root, 'pages/SpainMapPage.tsx'), 'utf8')
const es = JSON.parse(
  readFileSync(resolve(root, 'locales/es/common.json'), 'utf8'),
) as { map: Record<string, string> }
const en = JSON.parse(
  readFileSync(resolve(root, 'locales/en/common.json'), 'utf8'),
) as { map: Record<string, string> }

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

  it('locale SSOT includes policy keys (ES/EN)', () => {
    for (const loc of [es, en]) {
      expect(loc.map.policyBanner).toMatch(/MAP|seguridad|safety|consumo|consumption/i)
      expect(loc.map.cotosPolicy).toMatch(/consum|permiso|permission/i)
      expect(loc.map.safetyChip).toMatch(/cotos|consum/i)
      expect(loc.map.disclaimerShort).toMatch(/cotos|consum|forag/i)
    }
    expect(es.map.policyBanner).toMatch(/cotos\s*≠\s*consumo/)
    expect(es.map.safetyChip).toMatch(/cotos\s*≠\s*consumo/)
  })
})
