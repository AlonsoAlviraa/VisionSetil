/**
 * Rank dangerous lookalikes by catalog risk (Mushby-style alerts).
 */
import {
  getSpeciesBySlug,
  loadSpeciesCatalog,
  speciesCatalog,
  type CatalogSpecies,
} from '../data/speciesCatalog'

export async function ensureLookalikeRiskCatalog(): Promise<CatalogSpecies[]> {
  return loadSpeciesCatalog()
}
import { toRiskLabel, type RiskLabel } from './riskLabels'

const RISK_RANK: Record<RiskLabel, number> = {
  deadly: 100,
  poisonous: 80,
  toxic: 70,
  unknown_or_risky: 40,
  dangerous_or_unknown: 35,
  not_for_consumption_guidance: 30,
}

export type RankedLookalike = {
  name: string
  slug: string | null
  risk_label: RiskLabel
  score: number
  common_names: string[]
  in_catalog: boolean
}

function slugifyTaxon(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function findCatalogEntry(name: string): CatalogSpecies | undefined {
  const slug = slugifyTaxon(name)
  const bySlug = getSpeciesBySlug(slug)
  if (bySlug) return bySlug
  const lower = name.trim().toLowerCase()
  return speciesCatalog.find((s) => s.taxon.toLowerCase() === lower)
}

/** Rank lookalike names: deadly first, then toxic, then unknown. */
export function rankLookalikes(names: string[]): RankedLookalike[] {
  const seen = new Set<string>()
  const ranked: RankedLookalike[] = []
  for (const raw of names) {
    const name = raw?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const entry = findCatalogEntry(name)
    const risk = toRiskLabel(entry?.risk_label ?? 'dangerous_or_unknown')
    ranked.push({
      name: entry?.taxon ?? name,
      slug: entry?.slug ?? slugifyTaxon(name),
      risk_label: risk,
      score: RISK_RANK[risk] ?? 0,
      common_names: entry?.common_names ?? [],
      in_catalog: Boolean(entry),
    })
  }
  ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return ranked
}

/** True if any lookalike is deadly/poisonous/toxic. */
export function hasHighRiskLookalike(names: string[]): boolean {
  return rankLookalikes(names).some((r) => r.score >= 70)
}

/** Merge prediction taxon lookalikes from catalog descriptions is out of scope;
 * this only ranks API-provided dangerous_lookalikes strings. */
export function lookalikeSummary(names: string[]): {
  total: number
  deadly: number
  high: number
  top: RankedLookalike | null
} {
  const ranked = rankLookalikes(names)
  return {
    total: ranked.length,
    deadly: ranked.filter((r) => r.risk_label === 'deadly').length,
    high: ranked.filter((r) => r.score >= 70).length,
    top: ranked[0] ?? null,
  }
}
