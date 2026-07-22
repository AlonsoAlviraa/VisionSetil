/**
 * Documented food-quality registry — NO invented data.
 *
 * Sources (only):
 * 1) frontend/src/data/mushroomDatabase.ts (+ additional/extended) — curated Iberian edibility
 * 2) frontend/src/data/poisonousSpecies.json — critical/high toxic list
 *
 * If a taxon is not in these sources → quality is unknown (null). Never invent "comestible".
 * "Comestible" here is culinary documentation class for education / quiz — never permission to eat.
 */
import {
  mushroomDatabase,
  type EdibilityLevel,
  type MushroomSpecies,
} from '../data/mushroomDatabase'
import poisonousJson from '../data/poisonousSpecies.json'

export type FoodClass = 'comestible' | 'no_comestible' | 'toxica' | 'mortal'

export type FoodQualityRecord = {
  taxon: string
  common: string
  /** Raw curated edibility when from DB */
  edibility: EdibilityLevel | null
  food_class: FoodClass
  /** Human short label for UI / quiz */
  label: string
  /** Provenance — never empty for known records */
  sources: string[]
  notes?: string
}

export const FOOD_CLASS_META: Record<
  FoodClass,
  { label: string; hint: string; letter: string; color: string }
> = {
  comestible: {
    label: 'Comestible',
    hint: 'Documentada en base curada',
    letter: 'A',
    color: 'green',
  },
  no_comestible: {
    label: 'No comestible',
    hint: 'No apta o solo con experto',
    letter: 'B',
    color: 'slate',
  },
  toxica: {
    label: 'Tóxica',
    hint: 'Tóxica documentada',
    letter: 'C',
    color: 'orange',
  },
  mortal: {
    label: 'Mortal',
    hint: 'Puede ser letal',
    letter: 'D',
    color: 'red',
  },
}

type PoisonRow = {
  latin_name: string
  common_name?: string
  risk_level?: string
  notes?: string
}

const poisonList = poisonousJson as PoisonRow[]

const SOURCE_DB = 'mushroomDatabase (curada Iberia/Europa)'
const SOURCE_POISON = 'poisonousSpecies.json (lista tóxicas)'

/** Map curated edibility → food class. `desconocido` → null (excluded). */
export function edibilityToFoodClass(edibility: EdibilityLevel): FoodClass | null {
  switch (edibility) {
    case 'excelente':
    case 'buen_comestible':
      return 'comestible'
    case 'comestible_con_cautela':
    case 'no_recomendado':
      return 'no_comestible'
    case 'toxico':
      return 'toxica'
    case 'mortifero':
      return 'mortal'
    case 'desconocido':
    default:
      return null
  }
}

function norm(taxon: string): string {
  return taxon.trim().toLowerCase().replace(/\s+/g, ' ')
}

function poisonToClass(level: string | undefined): FoodClass {
  const k = (level || '').toLowerCase()
  if (k === 'critical' || k === 'deadly' || k === 'mortal') return 'mortal'
  return 'toxica'
}

const classRank: Record<FoodClass, number> = {
  comestible: 1,
  no_comestible: 2,
  toxica: 3,
  mortal: 4,
}

function worse(a: FoodClass, b: FoodClass): FoodClass {
  return classRank[a] >= classRank[b] ? a : b
}

/** Build full registry once from real sources. */
export function buildFoodQualityRegistry(
  db: MushroomSpecies[] = mushroomDatabase,
  poison: PoisonRow[] = poisonList,
): Map<string, FoodQualityRecord> {
  const map = new Map<string, FoodQualityRecord>()

  for (const m of db) {
    const food_class = edibilityToFoodClass(m.edibility)
    if (!food_class) continue
    const key = norm(m.scientificName)
    map.set(key, {
      taxon: m.scientificName,
      common: m.commonNames[0] || m.scientificName,
      edibility: m.edibility,
      food_class,
      label: FOOD_CLASS_META[food_class].label,
      sources: [SOURCE_DB],
      notes: m.toxicity,
    })
  }

  for (const p of poison) {
    const key = norm(p.latin_name)
    const food_class = poisonToClass(p.risk_level)
    const existing = map.get(key)
    if (existing) {
      const merged = worse(existing.food_class, food_class)
      map.set(key, {
        ...existing,
        food_class: merged,
        label: FOOD_CLASS_META[merged].label,
        sources: Array.from(new Set([...existing.sources, SOURCE_POISON])),
        notes: existing.notes || p.notes,
      })
    } else {
      map.set(key, {
        taxon: p.latin_name,
        common: p.common_name || p.latin_name,
        edibility: null,
        food_class,
        label: FOOD_CLASS_META[food_class].label,
        sources: [SOURCE_POISON],
        notes: p.notes,
      })
    }
  }

  return map
}

let _cache: Map<string, FoodQualityRecord> | null = null

export function getFoodQualityRegistry(): Map<string, FoodQualityRecord> {
  if (!_cache) _cache = buildFoodQualityRegistry()
  return _cache
}

/** null = no documented quality in our sources (do not invent). */
export function getFoodQuality(taxon: string): FoodQualityRecord | null {
  if (!taxon?.trim()) return null
  return getFoodQualityRegistry().get(norm(taxon)) ?? null
}

export type FoodQualityStats = {
  total_documented: number
  by_class: Record<FoodClass, number>
  sources: string[]
}

export function foodQualityStats(
  registry: Map<string, FoodQualityRecord> = getFoodQualityRegistry(),
): FoodQualityStats {
  const by_class: Record<FoodClass, number> = {
    comestible: 0,
    no_comestible: 0,
    toxica: 0,
    mortal: 0,
  }
  for (const r of registry.values()) {
    by_class[r.food_class] += 1
  }
  return {
    total_documented: registry.size,
    by_class,
    sources: [SOURCE_DB, SOURCE_POISON],
  }
}

/** All documented records as array (for quiz pool). */
export function listDocumentedFoodQuality(): FoodQualityRecord[] {
  return Array.from(getFoodQualityRegistry().values())
}
