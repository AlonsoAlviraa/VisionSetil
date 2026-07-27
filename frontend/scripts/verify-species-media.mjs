/**
 * Node verification walk: catalog snapshot + speciesPhotos + local media/ dirs.
 * Run from frontend/: node scripts/verify-species-media.mjs
 * Exit 1 if resolve gaps or missing local cards exceed soft threshold.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FE = path.resolve(__dirname, '..')
const ROOT = path.resolve(FE, '..')
const MEDIA = path.join(ROOT, 'media', 'species')
const PLACEHOLDERS = path.join(ROOT, 'media', 'placeholders')
const SNAP = path.join(FE, 'src', 'data', 'generated', 'species_catalog_snapshot.json')
const PHOTOS = path.join(FE, 'src', 'data', 'speciesPhotos.json')

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'))
const photos = JSON.parse(fs.readFileSync(PHOTOS, 'utf8'))
const species = snap.species || []
const photoMap = photos.photos || {}

let missingLocal = 0
let tinyCard = 0
let noCatalogUrl = 0
let badUrl = 0
const issues = []

for (const s of species) {
  const taxon = s.scientific_name || s.taxon || ''
  const slug = s.slug || slugify(taxon)
  const key = taxon.toLowerCase()
  const entry = photoMap[key]
  const url = entry?.url || null
  if (!url) {
    noCatalogUrl += 1
  } else if (!/^https?:\/\//i.test(url) && !url.startsWith('/media/') && !url.startsWith('data:')) {
    badUrl += 1
    issues.push({ taxon, code: 'bad_url', url: String(url).slice(0, 80) })
  }

  const dir = path.join(MEDIA, slug)
  const card = path.join(dir, 'card.webp')
  if (!fs.existsSync(dir)) {
    missingLocal += 1
    issues.push({ taxon, slug, code: 'missing_dir' })
    continue
  }
  if (!fs.existsSync(card) || fs.statSync(card).size < 8192) {
    tinyCard += 1
    issues.push({
      taxon,
      slug,
      code: 'tiny_or_missing_card',
      bytes: fs.existsSync(card) ? fs.statSync(card).size : 0,
    })
  }
}

const phOk = ['default', 'toxic', 'deadly', 'unknown'].every((k) =>
  fs.existsSync(path.join(PLACEHOLDERS, `${k}.webp`)),
)

const report = {
  catalogCount: species.length,
  photosMapped: Object.keys(photoMap).length,
  photoStats: photos.stats || null,
  missingLocal,
  tinyCard,
  noCatalogUrl,
  badUrl,
  placeholdersOk: phOk,
  sampleIssues: issues.slice(0, 20),
}

console.log(JSON.stringify(report, null, 2))

const hardFail =
  !phOk ||
  badUrl > 0 ||
  missingLocal > 0 ||
  tinyCard > Math.max(5, Math.floor(species.length * 0.02))

if (hardFail) {
  console.error('verify-species-media: FAIL')
  process.exit(1)
}
console.error('verify-species-media: OK')
process.exit(0)
