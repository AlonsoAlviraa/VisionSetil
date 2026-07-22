/**
 * Unified catalog hook (PR-08): API first, snapshot fallback.
 */
import { useEffect, useMemo, useState } from 'react'
import { featureFlags } from '../lib/featureFlags'
import { scientificNameToSlug } from '../lib/slug'
import type { EdibilityLevel, MushroomSpecies } from '../data/mushroomDatabase'
import {
  mushroomDatabase,
  getMushroomByScientificName as legacyGet,
  getFeaturedMushrooms as legacyFeatured,
  searchMushrooms as legacySearch,
} from '../data/mushroomDatabase'

export interface CatalogSpecies {
  id: string
  scientific_name: string
  slug: string
  family: string
  genus?: string
  risk_level: string
  edibility_code: EdibilityLevel | string
  categories: string[]
  featured?: boolean
  icon: string
  vernacular_names: string[]
  common_name?: string | null
  tagline?: string | null
  description?: string | null
  season?: string | null
  habitat?: string | null
  morphology?: {
    cap?: string | null
    stem?: string | null
    hymenium?: string | null
  }
  key_features?: string[]
  toxicity_notes?: string | null
  lookalikes?: Array<{ scientific_name: string; note_key?: string | null }>
}

interface CatalogSnapshot {
  catalog_version: string
  species: Array<Record<string, unknown>>
}

let snapshotCache: CatalogSnapshot | null = null

async function loadSnapshot(): Promise<CatalogSnapshot> {
  if (snapshotCache) return snapshotCache
  const mod = await import('../data/generated/species_catalog_snapshot.json')
  snapshotCache = mod.default as CatalogSnapshot
  return snapshotCache
}

function localizeFromRecord(rec: Record<string, unknown>, locale: string): CatalogSpecies {
  const vernMap = (rec.vernacular_names || {}) as Record<string, string[]>
  const chain = [locale, 'es', 'en', 'ca', 'eu']
  let vern: string[] = []
  for (const loc of chain) {
    if (vernMap[loc]?.length) {
      vern = vernMap[loc]
      break
    }
  }
  const taglineMap = (rec.tagline || {}) as Record<string, string>
  const descMap = (rec.description || {}) as Record<string, string>
  const seasonMap = (rec.season || {}) as Record<string, string>
  const habitatMap = (rec.habitat || {}) as Record<string, string>
  const pick = (m: Record<string, string>) => {
    for (const loc of chain) {
      if (m[loc]) return m[loc]
    }
    return null
  }
  const morph = (rec.morphology || {}) as Record<string, Record<string, string> | string>
  const morphPart = (key: string) => {
    const p = morph[key]
    if (!p) return null
    if (typeof p === 'string') return p
    return pick(p as Record<string, string>)
  }
  const kf = rec.key_features as Record<string, string[]> | string[] | undefined
  let keyFeatures: string[] = []
  if (Array.isArray(kf)) keyFeatures = kf
  else if (kf && typeof kf === 'object') {
    for (const loc of chain) {
      if (kf[loc]?.length) {
        keyFeatures = kf[loc]
        break
      }
    }
  }

  return {
    id: String(rec.id || rec.slug),
    scientific_name: String(rec.scientific_name),
    slug: String(rec.slug || scientificNameToSlug(String(rec.scientific_name))),
    family: String(rec.family || ''),
    genus: rec.genus ? String(rec.genus) : undefined,
    risk_level: String(rec.risk_level || 'unknown'),
    edibility_code: String(rec.edibility_code || 'desconocido'),
    categories: (rec.categories as string[]) || [],
    featured: Boolean(rec.featured),
    icon: String(rec.icon || '🍄'),
    vernacular_names: vern,
    common_name: vern[0] || null,
    tagline: pick(taglineMap),
    description: pick(descMap),
    season: pick(seasonMap),
    habitat: pick(habitatMap),
    morphology: {
      cap: morphPart('cap'),
      stem: morphPart('stem'),
      hymenium: morphPart('hymenium'),
    },
    key_features: keyFeatures,
    toxicity_notes: (() => {
      const t = rec.toxicity_notes
      if (!t) return null
      if (typeof t === 'string') return t
      return pick(t as Record<string, string>)
    })(),
    lookalikes: (rec.lookalikes as CatalogSpecies['lookalikes']) || [],
  }
}

export function catalogToMushroomSpecies(c: CatalogSpecies): MushroomSpecies {
  return {
    scientificName: c.scientific_name,
    commonNames: c.vernacular_names.length ? c.vernacular_names : [c.scientific_name],
    tagline: c.tagline || '',
    description: c.description || '',
    family: c.family,
    habitat: c.habitat || '',
    season: c.season || '',
    cap: c.morphology?.cap || '',
    stem: c.morphology?.stem || '',
    hymenium: c.morphology?.hymenium || '',
    edibility: (c.edibility_code as EdibilityLevel) || 'desconocido',
    toxicity: c.toxicity_notes || undefined,
    keyFeatures: c.key_features || [],
    lookAlikes: (c.lookalikes || []).map((l) =>
      l.note_key ? `${l.scientific_name} (${l.note_key})` : l.scientific_name,
    ),
    categories: c.categories,
    icon: c.icon,
    featured: c.featured,
    riskLevel: c.risk_level,
    slug: c.slug,
  }
}

export function useSpeciesCatalog(locale = 'es') {
  const [items, setItems] = useState<CatalogSpecies[]>([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState<string>('legacy')
  const [source, setSource] = useState<'api' | 'snapshot' | 'legacy'>('legacy')

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      if (!featureFlags.UNIFIED_CATALOG) {
        const legacy = mushroomDatabase.map((m) => ({
          id: scientificNameToSlug(m.scientificName),
          scientific_name: m.scientificName,
          slug: scientificNameToSlug(m.scientificName),
          family: m.family,
          risk_level: 'unknown',
          edibility_code: m.edibility,
          categories: m.categories,
          featured: m.featured,
          icon: m.icon,
          vernacular_names: m.commonNames,
          common_name: m.commonNames[0],
          tagline: m.tagline,
          description: m.description,
          season: m.season,
          habitat: m.habitat,
          morphology: { cap: m.cap, stem: m.stem, hymenium: m.hymenium },
          key_features: m.keyFeatures,
          toxicity_notes: m.toxicity || null,
          lookalikes: (m.lookAlikes || []).map((s) => ({
            scientific_name: s.split('(')[0].trim(),
            note_key: null,
          })),
        }))
        if (!cancelled) {
          setItems(legacy)
          setSource('legacy')
          setVersion('legacy-ts')
          setLoading(false)
        }
        return
      }

      // 1) Snapshot first — reliable, offline, full catalog (520+)
      try {
        const snap = await loadSnapshot()
        const localized = snap.species.map((s) => localizeFromRecord(s, locale))
        if (!cancelled && localized.length) {
          setItems(localized)
          setVersion(snap.catalog_version)
          setSource('snapshot')
          setLoading(false)
        }
      } catch {
        /* try API / legacy below */
      }

      // 2) Optional API enrich (may be partial); only replace if we get a fuller list
      try {
        const controller = new AbortController()
        const timer = window.setTimeout(() => controller.abort(), 2500)
        const res = await fetch(
          `/api/species?limit=2000&locale=${encodeURIComponent(locale)}`,
          { signal: controller.signal },
        )
        window.clearTimeout(timer)
        if (res.ok) {
          const data = await res.json()
          const apiItems = (data.items || []) as CatalogSpecies[]
          if (!cancelled && apiItems.length > 0) {
            // Prefer whichever list is larger / complete
            setItems((prev) => (apiItems.length >= prev.length ? apiItems : prev))
            if (apiItems.length >= (data.total || apiItems.length)) {
              setVersion(data.catalog_version || 'api')
              setSource('api')
            }
          }
        }
      } catch {
        /* snapshot already loaded */
      }

      if (!cancelled) {
        setLoading(false)
        setItems((prev) => {
          if (prev.length) return prev
          // last resort: empty → keep empty (UI empty state)
          setSource('legacy')
          return prev
        })
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [locale])

  const asMushroomSpecies = useMemo(
    () => items.map(catalogToMushroomSpecies),
    [items],
  )

  const getBySlug = (slug: string) => items.find((s) => s.slug === slug)
  const getByScientificName = (name: string) => {
    const found = items.find(
      (s) => s.scientific_name.toLowerCase() === name.toLowerCase(),
    )
    if (found) return found
    if (!featureFlags.UNIFIED_CATALOG) {
      const leg = legacyGet(name)
      return leg
        ? localizeFromRecord(
            {
              scientific_name: leg.scientificName,
              slug: scientificNameToSlug(leg.scientificName),
              vernacular_names: { es: leg.commonNames },
              edibility_code: leg.edibility,
              family: leg.family,
              icon: leg.icon,
              categories: leg.categories,
              tagline: { es: leg.tagline },
              description: { es: leg.description },
            },
            locale,
          )
        : undefined
    }
    return undefined
  }

  return {
    items,
    asMushroomSpecies,
    loading,
    version,
    source,
    getBySlug,
    getByScientificName,
    featured: items.filter((i) => i.featured),
    search: (q: string): CatalogSpecies[] => {
      if (!featureFlags.UNIFIED_CATALOG) {
        return legacySearch(q).map((m) => ({
          id: scientificNameToSlug(m.scientificName),
          scientific_name: m.scientificName,
          slug: scientificNameToSlug(m.scientificName),
          family: m.family,
          risk_level: 'unknown',
          edibility_code: m.edibility,
          categories: m.categories,
          icon: m.icon,
          vernacular_names: m.commonNames,
          tagline: m.tagline,
          description: m.description,
          season: m.season,
          habitat: m.habitat,
        }))
      }
      const qq = q.trim().toLowerCase()
      if (!qq) return items
      return items.filter((s) => {
        if (s.scientific_name.toLowerCase().includes(qq)) return true
        if (s.family.toLowerCase().includes(qq)) return true
        return s.vernacular_names.some((n) => n.toLowerCase().includes(qq))
      })
    },
    legacyFeatured,
  }
}
