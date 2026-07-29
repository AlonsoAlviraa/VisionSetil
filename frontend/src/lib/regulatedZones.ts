/**
 * B2B-friendly regulated cotos / parques micológicos helpers.
 * Partner framing: official permit links only — VisionSetil does not sell permits.
 */
import { cylCotosZones } from '../data/cylCotosZones'
import { mycologicalParksZones } from '../data/mycologicalParksZones'
import { scrapedCotosZones } from '../data/scrapedCotosZones'
import type { MushroomZone } from '../data/mushroomZones'
import { getZoneResourcePack, type ZoneResourcePack } from '../data/zonePermitLinks'

export type RegulatedZoneKind = 'coto_cyl' | 'parque' | 'coto'

export type RegulatedZoneRow = {
  zone: MushroomZone
  kind: RegulatedZoneKind
  resources: ZoneResourcePack
  hasPermitLink: boolean
}

const COTO_CYL_IDS = new Set(cylCotosZones.map((z) => z.id))
const PARK_IDS = new Set(mycologicalParksZones.map((z) => z.id))
const SCRAPED_IDS = new Set(scrapedCotosZones.map((z) => z.id))

/** Cap for directory UI (raised from legacy 40 to cover national inventory). */
export const REGULATED_DIRECTORY_CAP = 120

export function classifyRegulatedZone(zone: MushroomZone): RegulatedZoneKind {
  if (COTO_CYL_IDS.has(zone.id) || zone.id.startsWith('cyl-')) return 'coto_cyl'
  if (PARK_IDS.has(zone.id) || zone.id.startsWith('park-')) return 'parque'
  if (SCRAPED_IDS.has(zone.id) || zone.id.startsWith('coto-')) {
    // Explicit parque micológico pins outside the parks array
    if (/parque micol[oó]gico|parc micol[oò]gic/i.test(zone.name)) return 'parque'
    return 'coto'
  }
  if (zone.id.startsWith('cyl')) return 'coto_cyl'
  return 'parque'
}

export function kindLabelEs(kind: RegulatedZoneKind): string {
  switch (kind) {
    case 'coto_cyl':
      return 'Acotado CyL'
    case 'parque':
      return 'Parque micológico'
    case 'coto':
      return 'Coto regulado'
    default:
      return 'Zona regulada'
  }
}

function safeResourcePack(zone: MushroomZone): ZoneResourcePack {
  try {
    return getZoneResourcePack(zone)
  } catch {
    return { links: [] }
  }
}

/**
 * Core B2B inventory: CyL cotos + emblematic parks + national scraped cotos (deduped by id).
 */
export function listRegulatedZones(): RegulatedZoneRow[] {
  const seen = new Set<string>()
  const out: RegulatedZoneRow[] = []
  for (const zone of [...cylCotosZones, ...mycologicalParksZones, ...scrapedCotosZones]) {
    if (!zone?.id || seen.has(zone.id)) continue
    seen.add(zone.id)
    const resources = safeResourcePack(zone)
    const kind = classifyRegulatedZone(zone)
    out.push({
      zone,
      kind,
      resources,
      hasPermitLink: resources.links.some((l) => l.kind === 'permit'),
    })
  }
  return out.sort((a, b) => {
    const r = (a.zone.region || '').localeCompare(b.zone.region || '', 'es')
    if (r !== 0) return r
    return (a.zone.name || '').localeCompare(b.zone.name || '', 'es')
  })
}

export function regulatedZoneStats() {
  const rows = listRegulatedZones()
  const byRegion: Record<string, number> = {}
  let withPermit = 0
  let cotos = 0
  let parks = 0
  let cotosOther = 0
  for (const r of rows) {
    byRegion[r.zone.region] = (byRegion[r.zone.region] || 0) + 1
    if (r.hasPermitLink) withPermit += 1
    if (r.kind === 'coto_cyl') cotos += 1
    if (r.kind === 'parque') parks += 1
    if (r.kind === 'coto') cotosOther += 1
  }
  return {
    total: rows.length,
    cotos,
    parks,
    cotosOther,
    withPermit,
    byRegion,
    cylCount: cylCotosZones.length,
    parksSourceCount: mycologicalParksZones.length,
    scrapedCount: scrapedCotosZones.length,
  }
}

export const B2B_PARTNER_BLURB_ES =
  'VisionSetil enlaza a gestores oficiales de permisos (MicologíaCyL, MicoAragón, MycoGalicia, parques forales, ayuntamientos…). No vendemos permisos ni autorizamos recolección o consumo. Superficie lista para partners de cotos y parques micológicos.'
