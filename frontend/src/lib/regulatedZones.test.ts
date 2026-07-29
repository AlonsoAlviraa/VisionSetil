import { describe, expect, it } from 'vitest'
import {
  B2B_PARTNER_BLURB_ES,
  classifyRegulatedZone,
  listRegulatedZones,
  regulatedZoneStats,
  REGULATED_DIRECTORY_CAP,
} from './regulatedZones'
import { cylCotosZones } from '../data/cylCotosZones'
import { mycologicalParksZones } from '../data/mycologicalParksZones'
import { scrapedCotosZones } from '../data/scrapedCotosZones'
import { extraCotosZones } from '../data/extraCotosZones'
import { getZoneResourcePack } from '../data/zonePermitLinks'

describe('regulated zones B2B', () => {
  it('lists CyL cotos, parks and national scraped cotos with permit awareness', () => {
    const rows = listRegulatedZones()
    const stats = regulatedZoneStats()
    expect(rows.length).toBeGreaterThanOrEqual(
      cylCotosZones.length + mycologicalParksZones.length,
    )
    expect(stats.cylCount).toBe(cylCotosZones.length)
    expect(stats.parksSourceCount).toBe(mycologicalParksZones.length)
    expect(stats.scrapedCount).toBe(
      scrapedCotosZones.length + extraCotosZones.length,
    )
    expect(stats.extraCount).toBe(extraCotosZones.length)
    expect(stats.total).toBeGreaterThan(40)
    expect(rows.some((r) => r.zone.id.startsWith('coto-lr-') || r.zone.id.startsWith('coto-ex-'))).toBe(
      true,
    )
    expect(stats.withPermit).toBeGreaterThan(20)
    // Montes de Soria present
    expect(rows.some((r) => /soria/i.test(r.zone.name) || r.zone.id.includes('soria'))).toBe(
      true,
    )
    // National expansion present
    expect(rows.some((r) => r.zone.id.startsWith('coto-na-') || r.zone.id.startsWith('coto-ga-'))).toBe(
      true,
    )
  })

  it('classifies cyl, park and scraped coto ids', () => {
    expect(classifyRegulatedZone(cylCotosZones[0])).toBe('coto_cyl')
    expect(classifyRegulatedZone(mycologicalParksZones[0])).toBe('parque')
    const municipal = scrapedCotosZones.find((z) => z.id === 'coto-ar-maestrazgo')
    expect(municipal && classifyRegulatedZone(municipal)).toBe('coto')
    const parkLike = scrapedCotosZones.find((z) => z.id === 'coto-na-ultzama')
    expect(parkLike && classifyRegulatedZone(parkLike)).toBe('parque')
  })

  it('every regulated row has at least one resource link', () => {
    const rows = listRegulatedZones()
    for (const r of rows) {
      expect(r.resources.links.length).toBeGreaterThan(0)
    }
  })

  it('scraped cotos resolve explicit permit packs where expected', () => {
    const ultzama = getZoneResourcePack({
      id: 'coto-na-ultzama',
      name: 'Parque Micológico Ultzama',
      region: 'Navarra',
      provinces: ['Navarra'],
    })
    expect(ultzama.links.some((l) => l.kind === 'permit')).toBe(true)
    expect(ultzama.links[0].url).toMatch(/ultzama|permisos/i)

    const beade = getZoneResourcePack({
      id: 'coto-ga-beade',
      name: 'Couto Beade',
      region: 'Galicia',
      provinces: ['Pontevedra'],
    })
    expect(beade.links.some((l) => l.url.includes('mycogalicia'))).toBe(true)
  })

  it('directory cap covers expanded inventory', () => {
    expect(REGULATED_DIRECTORY_CAP).toBeGreaterThanOrEqual(80)
    expect(listRegulatedZones().length).toBeLessThanOrEqual(REGULATED_DIRECTORY_CAP + 40)
  })

  it('partner blurb avoids medical / consumption claims', () => {
    expect(B2B_PARTNER_BLURB_ES).toMatch(/no vendemos permisos/i)
    expect(B2B_PARTNER_BLURB_ES).not.toMatch(/safe to eat|comestible seguro/i)
  })

  it('validates Spain bbox for scraped and CyL regulated pins', () => {
    for (const z of [...cylCotosZones, ...scrapedCotosZones, ...mycologicalParksZones]) {
      expect(z.lat).toBeGreaterThanOrEqual(36)
      expect(z.lat).toBeLessThanOrEqual(44)
      expect(z.lng).toBeGreaterThanOrEqual(-10)
      expect(z.lng).toBeLessThanOrEqual(5)
      expect(z.id).toBeTruthy()
      expect(z.name.length).toBeGreaterThan(3)
    }
  })
})
