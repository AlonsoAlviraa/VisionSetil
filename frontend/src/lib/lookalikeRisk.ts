/**
 * Rank dangerous lookalikes by catalog risk (Mushby-style alerts).
 * Hydrates names → catalog fichas (vernaculars, slug, risk) when catalog is loaded.
 * Identify surfaces risk chips only — never food/edibility chrome (D-B16 / B-34).
 */
import {
  getSpeciesBySlug,
  loadSpeciesCatalog,
  speciesCatalog,
  type CatalogSpecies,
} from '../data/speciesCatalog'
import { riskToPlaceholder } from './edibility'
import { toRiskLabel, type RiskLabel } from './riskLabels'

export async function ensureLookalikeRiskCatalog(): Promise<CatalogSpecies[]> {
  return loadSpeciesCatalog()
}

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
  /** Catalog family when known (for ficha subtitle). */
  family: string | null
  /** SpeciesImage risk placeholder kind (deadly | toxic | unknown | default). */
  risk_placeholder: 'default' | 'toxic' | 'deadly' | 'unknown'
}

export type LookalikeSummary = {
  total: number
  deadly: number
  high: number
  top: RankedLookalike | null
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

function toRanked(name: string, entry: CatalogSpecies | undefined): RankedLookalike {
  // Prefer catalog risk; never invent edible/food labels for Identify.
  const risk = toRiskLabel(entry?.risk_label ?? 'dangerous_or_unknown')
  const placeholder = riskToPlaceholder(entry?.risk_label ?? risk, null)
  return {
    name: entry?.taxon ?? name,
    slug: entry?.slug ?? slugifyTaxon(name),
    risk_label: risk,
    score: RISK_RANK[risk] ?? 0,
    common_names: entry?.common_names ?? [],
    in_catalog: Boolean(entry),
    family: entry?.family ?? entry?.family_es ?? null,
    risk_placeholder: placeholder,
  }
}

/** Rank lookalike names: deadly first, then toxic, then unknown.
 * Sync — uses in-memory catalog (may be empty until loadSpeciesCatalog resolves). */
export function rankLookalikes(names: string[]): RankedLookalike[] {
  const seen = new Set<string>()
  const ranked: RankedLookalike[] = []
  for (const raw of names) {
    const name = raw?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    ranked.push(toRanked(name, findCatalogEntry(name)))
  }
  ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return ranked
}

/** Ensure catalog is loaded, then rank + hydrate lookalikes (B-34). */
export async function rankLookalikesHydrated(names: string[]): Promise<RankedLookalike[]> {
  await ensureLookalikeRiskCatalog()
  return rankLookalikes(names)
}

/** True if any lookalike is deadly/poisonous/toxic. */
export function hasHighRiskLookalike(names: string[]): boolean {
  return rankLookalikes(names).some((r) => r.score >= 70)
}

export function summarizeLookalikes(ranked: RankedLookalike[]): LookalikeSummary {
  return {
    total: ranked.length,
    deadly: ranked.filter((r) => r.risk_label === 'deadly').length,
    high: ranked.filter((r) => r.score >= 70).length,
    top: ranked[0] ?? null,
  }
}

/** Merge prediction taxon lookalikes from catalog descriptions is out of scope;
 * this only ranks API-provided dangerous_lookalikes strings. */
export function lookalikeSummary(names: string[]): LookalikeSummary {
  return summarizeLookalikes(rankLookalikes(names))
}

export async function lookalikeSummaryHydrated(names: string[]): Promise<LookalikeSummary> {
  const ranked = await rankLookalikesHydrated(names)
  return summarizeLookalikes(ranked)
}
