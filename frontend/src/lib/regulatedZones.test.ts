import { describe, expect, it } from 'vitest'
import {
  B2B_PARTNER_BLURB_ES,
  classifyRegulatedZone,
  listRegulatedZones,
  regulatedZoneStats,
} from './regulatedZones'
import { cylCotosZones } from '../data/cylCotosZones'
import { mycologicalParksZones } from '../data/mycologicalParksZones'

describe('regulated zones B2B', () => {
  it('lists CyL cotos and parks with permit awareness', () => {
    const rows = listRegulatedZones()
    const stats = regulatedZoneStats()
    expect(rows.length).toBeGreaterThanOrEqual(cylCotosZones.length)
    expect(stats.cylCount).toBe(cylCotosZones.length)
    expect(stats.parksSourceCount).toBe(mycologicalParksZones.length)
    expect(stats.total).toBeGreaterThan(10)
    expect(stats.withPermit).toBeGreaterThan(5)
    // Montes de Soria present
    expect(rows.some((r) => /soria/i.test(r.zone.name) || r.zone.id.includes('soria'))).toBe(
      true,
    )
  })

  it('classifies cyl and park ids', () => {
    expect(classifyRegulatedZone(cylCotosZones[0])).toBe('coto_cyl')
    expect(classifyRegulatedZone(mycologicalParksZones[0])).toBe('parque')
  })

  it('partner blurb avoids medical / consumption claims', () => {
    expect(B2B_PARTNER_BLURB_ES).toMatch(/no vendemos permisos/i)
    expect(B2B_PARTNER_BLURB_ES).not.toMatch(/safe to eat|comestible seguro/i)
  })
})
