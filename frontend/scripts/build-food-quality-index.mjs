/**
 * Rebuild src/data/foodQualityIndex.json from mushroomDatabase + poison list.
 * Usage (from frontend/): npx tsx scripts/build-food-quality-index.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFoodQualityRegistry } from '../src/lib/foodQualityBuild.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = join(__dirname, '..', 'src', 'data', 'foodQualityIndex.json')

const reg = buildFoodQualityRegistry()
const by_taxon = {}
for (const [k, v] of reg.entries()) {
  by_taxon[k] = {
    taxon: v.taxon,
    common: v.common,
    edibility: v.edibility,
    food_class: v.food_class,
    label: v.label,
    sources: v.sources,
    ...(v.notes ? { notes: v.notes } : {}),
  }
}
const payload = {
  version: '1.0',
  generated: new Date().toISOString().slice(0, 10),
  count: Object.keys(by_taxon).length,
  by_taxon,
}
writeFileSync(outPath, JSON.stringify(payload))
console.log(`Wrote ${payload.count} records → ${outPath}`)
