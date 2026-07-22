/**
 * Ranked encyclopedia search: scientific + common + family + risk + family filter.
 */
import type { CatalogSpecies } from '../data/speciesCatalog'
import { familyNameEs } from '../data/familyNamesEs'
import { foldEs } from '../data/commonNamesEs'
import { toRiskLabel, type RiskLabel } from './riskLabels'

export type CatalogSearchOptions = {
  query?: string
  risk?: RiskLabel | 'all'
  /** Exact family name filter (e.g. Amanitaceae) */
  family?: string | 'all'
  limit?: number
  offset?: number
  boostHighRisk?: boolean
}

export type RankedSpecies = CatalogSpecies & { matchScore: number }

export type FamilyCount = {
  family: string
  /** Spanish display name */
  family_es: string
  count: number
}

function scoreSpecies(s: CatalogSpecies, q: string, boostHighRisk: boolean): number {
  let score = 0
  const taxon = s.taxon.toLowerCase()
  const family = (s.family || '').toLowerCase()
  const commons = s.common_names.map((c) => c.toLowerCase())
  if (!q) {
    score = 1
  } else {
    const qNorm = foldEs(q)
    if (taxon === q) score += 100
    else if (taxon.startsWith(q)) score += 80
    else if (taxon.includes(q)) score += 50
    for (const c of commons) {
      const cNorm = foldEs(c)
      if (c === q || cNorm === qNorm) score += 90
      else if (c.startsWith(q) || cNorm.startsWith(qNorm)) score += 70
      else if (c.includes(q) || cNorm.includes(qNorm)) score += 40
    }
    // Family match is first-class (Latin + Spanish educational names)
    const familyEs = (s.family_es || familyNameEs(s.family) || '').toLowerCase()
    const famEsNorm = foldEs(familyEs)
    if (family === q) score += 95
    else if (family.startsWith(q)) score += 70
    else if (family.includes(q)) score += 45
    if (familyEs === q) score += 95
    else if (familyEs.startsWith(q)) score += 70
    else if (q.length >= 3 && familyEs.includes(q)) score += 50
    if (qNorm.length >= 4 && famEsNorm.includes(qNorm)) score += 48
    // "fam:amanitaceae" or "familia amanitas"
    const famQuery = q.replace(/^(fam(ilia)?|family)\s*[:=]?\s*/, '')
    if (famQuery !== q) {
      if (family === famQuery || familyEs.includes(famQuery)) score += 100
      else if (family.includes(famQuery)) score += 60
    }
    if (s.slug.includes(q.replace(/\s+/g, '-'))) score += 20
    // genus-only query
    const genus = taxon.split(/\s+/)[0] || ''
    if (genus === q) score += 55
  }
  if (boostHighRisk) {
    const risk = toRiskLabel(s.risk_label)
    if (risk === 'deadly') score += 15
    else if (risk === 'poisonous' || risk === 'toxic') score += 8
  }
  return score
}

export function searchCatalogRanked(
  species: CatalogSpecies[],
  options: CatalogSearchOptions = {},
): RankedSpecies[] {
  const q = (options.query || '').trim().toLowerCase()
  const risk = options.risk ?? 'all'
  const family = (options.family || 'all').trim()
  const limit = options.limit ?? 40
  const offset = Math.max(0, options.offset ?? 0)
  const boost = options.boostHighRisk ?? true

  let rows = species
  if (risk !== 'all') {
    rows = rows.filter((s) => toRiskLabel(s.risk_label) === risk)
  }
  if (family && family !== 'all') {
    const fl = family.toLowerCase()
    if (fl === 'sin familia') {
      rows = rows.filter((s) => !(s.family || '').trim())
    } else {
      rows = rows.filter((s) => (s.family || '').toLowerCase() === fl)
    }
  }

  const ranked: RankedSpecies[] = []
  for (const s of rows) {
    const matchScore = scoreSpecies(s, q, boost)
    if (q && matchScore <= 0) continue
    if (!q && matchScore <= 0) continue
    ranked.push({ ...s, matchScore })
  }
  ranked.sort(
    (a, b) => b.matchScore - a.matchScore || a.taxon.localeCompare(b.taxon),
  )
  return ranked.slice(offset, offset + Math.max(1, limit))
}

/** Count species per family (after optional risk filter). */
export function listFamilies(
  species: CatalogSpecies[],
  risk: RiskLabel | 'all' = 'all',
): FamilyCount[] {
  const counts = new Map<string, number>()
  for (const s of species) {
    if (risk !== 'all' && toRiskLabel(s.risk_label) !== risk) continue
    const f = (s.family || '').trim() || 'Sin familia'
    counts.set(f, (counts.get(f) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([family, count]) => ({
      family,
      family_es: family === 'Sin familia' ? 'Sin familia' : familyNameEs(family),
      count,
    }))
    .sort(
      (a, b) =>
        b.count - a.count || a.family_es.localeCompare(b.family_es, 'es'),
    )
}
