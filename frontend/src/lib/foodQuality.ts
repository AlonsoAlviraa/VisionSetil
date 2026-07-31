/**
 * Documented food-quality registry — NO invented data.
 *
 * Runtime path loads a **slim precomputed index** (`data/foodQualityIndex.json`)
 * so encyclopedia/home cards do not pull the full mushroomDatabase prose graph.
 *
 * Rebuild index: `npx tsx scripts/build-food-quality-index.mjs` (or tsx -e see package).
 * Sources: mushroomDatabase (+ additional/extended) + poisonousSpecies.json
 */
import foodIndexJson from '../data/foodQualityIndex.json'
import type { EdibilityLevel } from '../data/mushroomDatabase'

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

function norm(taxon: string): string {
  return taxon.trim().toLowerCase().replace(/\s+/g, ' ')
}

type IndexFile = {
  version: string
  generated: string
  count: number
  by_taxon: Record<string, FoodQualityRecord>
}

const foodIndex = foodIndexJson as IndexFile

function loadRegistryFromIndex(): Map<string, FoodQualityRecord> {
  const map = new Map<string, FoodQualityRecord>()
  for (const [k, v] of Object.entries(foodIndex.by_taxon || {})) {
    map.set(k, v)
  }
  return map
}

let _cache: Map<string, FoodQualityRecord> | null = null

export function getFoodQualityRegistry(): Map<string, FoodQualityRecord> {
  if (!_cache) _cache = loadRegistryFromIndex()
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
  }
}

export function listDocumentedFoodQuality(): FoodQualityRecord[] {
  return Array.from(getFoodQualityRegistry().values())
}

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

/* Heavy rebuild: import buildFoodQualityRegistry from './foodQualityBuild' (scripts/tests only). */