/**
 * Heavy food-quality registry builder (mushroomDatabase + poison list).
 * Used by scripts/tests only — product UI imports slim `foodQuality.ts` + JSON index.
 */
import {
  mushroomDatabase,
  type EdibilityLevel,
  type MushroomSpecies,
} from '../data/mushroomDatabase'
import poisonousJson from '../data/poisonousSpecies.json'
import {
  edibilityToFoodClass,
  FOOD_CLASS_META,
  type FoodClass,
  type FoodQualityRecord,
} from './foodQuality'

type PoisonRow = {
  latin_name: string
  common_name?: string
  risk_level?: string
  notes?: string
}

const poisonList = poisonousJson as PoisonRow[]

const SOURCE_DB = 'mushroomDatabase (curada Iberia/Europa)'
const SOURCE_POISON = 'poisonousSpecies.json (lista tóxicas)'

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

/** Build full registry from real sources (not used on critical product import path). */
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
        edibility: null as EdibilityLevel | null,
        food_class,
        label: FOOD_CLASS_META[food_class].label,
        sources: [SOURCE_POISON],
        notes: p.notes,
      })
    }
  }

  return map
}
