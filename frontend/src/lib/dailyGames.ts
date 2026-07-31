/**
 * Daily games SSOT — LoLdle-style day seed, verified species pool, foto del día.
 * Educational only · never forage / consumption permission.
 */
import {
  commonsForLocale,
  speciesCatalog,
  type CatalogSpecies,
} from '../data/speciesCatalog'
import { HIGH_SEARCH_TAXA } from './encyclopediaPopularity'
import { getCatalogPhotoUrl } from './speciesImageService'
import { isPlausiblePhotoUrl } from './speciesMediaVerify'
import { scientificNameToSlug } from './slug'
import { toRiskLabel } from './riskLabels'

/** Civil day key (local TZ) — same as LoLdle “one puzzle per day”. */
export function gamesDayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Curated Iberian / educational taxa — verified one-by-one in buildVerifiedGamesPool.
 * High-search first, then classic confusions & field icons (many modes share this pool).
 */
export const CURATED_GAMES_TAXA: readonly string[] = [
  ...HIGH_SEARCH_TAXA,
  'Amanita rubescens',
  'Amanita citrina',
  'Boletus reticulatus',
  'Xerocomellus chrysenteron',
  'Suillus granulatus',
  'Lactarius sanguifluus',
  'Russula emetica',
  'Russula vesca',
  'Tricholoma portentosum',
  'Tricholoma equestre',
  'Clitocybe nebularis',
  'Clitocybe dealbata',
  'Entoloma sinuatum',
  'Hygrophorus marzuolus',
  'Calocybe gambosa',
  'Agaricus xanthodermus',
  'Agaricus arvensis',
  'Lepiota cristata',
  'Chlorophyllum rhacodes',
  'Gyromitra esculenta',
  'Helvella crispa',
  'Sparassis crispa',
  'Hericium erinaceus',
  'Fistulina hepatica',
  'Fomes fomentarius',
  'Trametes versicolor',
  'Psilocybe semilanceata',
  'Paxillus involutus',
  'Omphalotus olearius',
  'Cortinarius orellanus',
  'Cortinarius rubellus',
  'Inocybe erubescens',
  'Mycena pura',
  'Coprinopsis atramentaria',
  'Pholiota squarrosa',
  'Kuehneromyces mutabilis',
  'Hypholoma lateritium',
  'Stropharia aeruginosa',
  'Volvariella gloiocephala',
  'Pluteus cervinus',
  'Scleroderma citrinum',
  'Lycoperdon perlatum',
  'Calvatia gigantea',
  'Geastrum triplex',
  'Ramaria formosa',
  'Clavariadelphus pistillaris',
  'Auricularia auricula-judae',
  'Tremella mesenterica',
  'Cantharellus friesii',
  'Craterellus tubaeformis',
  'Hydnum rufescens',
  'Sarcodon imbricatus',
  'Albatrellus ovinus',
  'Gomphidius glutinosus',
  'Chroogomphus rutilus',
  'Lactarius torminosus',
  'Lactarius quietus',
  'Russula virescens',
  'Amanita pantherina',
  'Amanita phalloides',
] as const

export type VerifiedGameSpecies = {
  taxon: string
  slug: string
  common: string
  family: string
  risk_label: string
  /** Catalog photo URL passed shape check (no network). */
  photoUrl: string
  /** Pass reason for audits / tests */
  verified: true
  checks: {
    hasTaxon: true
    hasSlug: true
    hasCommon: true
    hasFamily: true
    hasPhotoUrl: true
  }
}

export type DailyGameModeId =
  | 'setadle-classic'
  | 'setadle-photo'
  | 'setadle-habitat'
  | 'wordle'
  | 'quiz'

export type DailyGameModeDef = {
  id: DailyGameModeId
  to: string
  titleEs: string
  blurbEs: string
  badgeEs: string
  glyph: string
  /** Salt for per-mode daily secret (LoLdle: different modes, different/same day seed). */
  seedSalt: string
}

/** LoLdle-style mode list — several daily challenges on the same calendar day. */
export const DAILY_GAME_MODES: readonly DailyGameModeDef[] = [
  {
    id: 'setadle-classic',
    to: '/setadle/classic',
    titleEs: 'Clásico',
    blurbEs: 'Pistas de familia, género y riesgo en cada intento.',
    badgeEs: 'Diario',
    glyph: 'grid_view',
    seedSalt: 'setadle|classic',
  },
  {
    id: 'setadle-photo',
    to: '/setadle/photo',
    titleEs: 'Foto',
    blurbEs: 'Recorte de la foto del día; se revela al fallar.',
    badgeEs: 'Foto',
    glyph: 'photo_camera',
    seedSalt: 'setadle|photo',
  },
  {
    id: 'setadle-habitat',
    to: '/setadle/habitat',
    titleEs: 'Hábitat',
    blurbEs: '¿Vive aquí o no? Pinar, hayedo, prado…',
    badgeEs: 'Campo',
    glyph: 'forest',
    seedSalt: 'setadle|habitat',
  },
  {
    id: 'wordle',
    to: '/wordle',
    titleEs: 'Wordle de setas',
    blurbEs: 'Nombre común, letra a letra (verde / ámbar).',
    badgeEs: 'Letras',
    glyph: 'spellcheck',
    seedSalt: 'wordle',
  },
  {
    id: 'quiz',
    to: '/reto',
    titleEs: 'Reto diario',
    blurbEs: 'Rondas cortas: foto, nombre y confusiones.',
    badgeEs: 'Reto',
    glyph: 'emoji_events',
    seedSalt: 'quiz',
  },
] as const

const STORAGE_KEY = 'visionsetil_daily_games_v1'

type DailyProgressStore = {
  day: string
  /** mode id → completed */
  done: Partial<Record<DailyGameModeId, boolean>>
}

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

/** In-memory fallback (tests / SSR) + optional inject. */
const memStore = new Map<string, string>()
const memStorage: StorageLike = {
  getItem: (k) => memStore.get(k) ?? null,
  setItem: (k, v) => {
    memStore.set(k, v)
  },
  removeItem: (k) => {
    memStore.delete(k)
  },
}

let storageOverride: StorageLike | null = null

export function __setDailyGamesStorageForTests(s: StorageLike | null) {
  storageOverride = s
  if (s == null) memStore.clear()
}

function storage(): StorageLike {
  if (storageOverride) return storageOverride
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage
  } catch {
    /* private mode */
  }
  return memStorage
}

function readStore(): DailyProgressStore {
  try {
    const raw = storage().getItem(STORAGE_KEY)
    if (!raw) return { day: gamesDayKey(), done: {} }
    const parsed = JSON.parse(raw) as DailyProgressStore
    if (!parsed || typeof parsed.day !== 'string') return { day: gamesDayKey(), done: {} }
    return { day: parsed.day, done: parsed.done || {} }
  } catch {
    return { day: gamesDayKey(), done: {} }
  }
}

function writeStore(s: DailyProgressStore) {
  try {
    storage().setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore quota */
  }
}

export function readDailyGamesProgress(day = gamesDayKey()): DailyProgressStore {
  const s = readStore()
  if (s.day !== day) return { day, done: {} }
  return s
}

export function markDailyGameDone(mode: DailyGameModeId, day = gamesDayKey()): void {
  const s = readDailyGamesProgress(day)
  s.day = day
  s.done = { ...s.done, [mode]: true }
  writeStore(s)
}

export function dailyGamesCompletion(
  day = gamesDayKey(),
): { done: number; total: number; pct: number; modes: DailyGameModeId[] } {
  const s = readDailyGamesProgress(day)
  const modes = DAILY_GAME_MODES.map((m) => m.id)
  const done = modes.filter((id) => s.done[id]).length
  const total = modes.length
  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    modes,
  }
}

function firstCommon(c: CatalogSpecies, locale = 'es'): string | null {
  const list = commonsForLocale(c, locale)
  for (const raw of list) {
    const n = String(raw || '').trim()
    if (!n) continue
    if (/^sin nombre/i.test(n) || /^unknown/i.test(n)) continue
    if (n.toLowerCase() === c.taxon.toLowerCase()) continue
    return n
  }
  return null
}

/**
 * Verify each curated taxon independently (catalog row + common + photo URL shape).
 * No network — photo presence is catalog URL shape only (same as media verify unit path).
 */
export function buildVerifiedGamesPool(
  catalog: CatalogSpecies[] = speciesCatalog,
  locale = 'es',
): VerifiedGameSpecies[] {
  const byTaxon = new Map<string, CatalogSpecies>()
  for (const s of catalog) {
    if (s.taxon && !byTaxon.has(s.taxon)) byTaxon.set(s.taxon, s)
  }

  const out: VerifiedGameSpecies[] = []
  const seen = new Set<string>()

  for (const taxon of CURATED_GAMES_TAXA) {
    if (seen.has(taxon)) continue
    const row = byTaxon.get(taxon)
    if (!row) continue
    const slug = row.slug || scientificNameToSlug(taxon)
    if (!slug) continue
    const common = firstCommon(row, locale)
    if (!common) continue
    const family = (row.family || '').trim()
    if (!family) continue
    const photoUrl = getCatalogPhotoUrl(taxon)
    if (!photoUrl || !isPlausiblePhotoUrl(photoUrl)) continue

    seen.add(taxon)
    out.push({
      taxon,
      slug,
      common,
      family,
      risk_label: row.risk_label || 'dangerous_or_unknown',
      photoUrl,
      verified: true,
      checks: {
        hasTaxon: true,
        hasSlug: true,
        hasCommon: true,
        hasFamily: true,
        hasPhotoUrl: true,
      },
    })
  }

  // Top up from catalog if curated list is thin (still one-by-one verification)
  if (out.length < 40) {
    for (const row of catalog) {
      if (out.length >= 80) break
      if (!row.taxon || seen.has(row.taxon)) continue
      const slug = row.slug || scientificNameToSlug(row.taxon)
      if (!slug) continue
      const common = firstCommon(row, locale)
      if (!common) continue
      const family = (row.family || '').trim()
      if (!family) continue
      const photoUrl = getCatalogPhotoUrl(row.taxon)
      if (!photoUrl || !isPlausiblePhotoUrl(photoUrl)) continue
      seen.add(row.taxon)
      out.push({
        taxon: row.taxon,
        slug,
        common,
        family,
        risk_label: row.risk_label || 'dangerous_or_unknown',
        photoUrl,
        verified: true,
        checks: {
          hasTaxon: true,
          hasSlug: true,
          hasCommon: true,
          hasFamily: true,
          hasPhotoUrl: true,
        },
      })
    }
  }

  return out
}

export function pickDailyFromPool<T>(
  pool: readonly T[],
  salt: string,
  day = gamesDayKey(),
): T {
  if (pool.length === 0) throw new Error('daily games pool empty')
  const h = hashSeed(`visionsetil|daily|${day}|${salt}|v1`)
  return pool[h % pool.length]
}

/** Foto del día — shared hub splash (LoLdle splash-of-the-day vibe). */
export function pickDailyPhotoSpecies(
  pool: VerifiedGameSpecies[],
  day = gamesDayKey(),
): VerifiedGameSpecies {
  return pickDailyFromPool(pool, 'foto-del-dia', day)
}

export function pickDailySpeciesForMode(
  pool: VerifiedGameSpecies[],
  mode: DailyGameModeId,
  day = gamesDayKey(),
): VerifiedGameSpecies {
  const def = DAILY_GAME_MODES.find((m) => m.id === mode)
  return pickDailyFromPool(pool, def?.seedSalt || mode, day)
}

export function riskChipClass(risk: string): string {
  return toRiskLabel(risk)
}
