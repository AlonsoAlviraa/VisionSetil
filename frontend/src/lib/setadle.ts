/**
 * Setadle — LoLdle-style daily mushroom guessing (educational only).
 * Modes: classic | clue | trait | habitat | photo
 * (legacy route `/setadle/emoji` resolves to habitat)
 */
import {
  loadSpeciesCatalog,
  speciesCatalog,
  type CatalogSpecies,
} from '../data/speciesCatalog'
import { getRiskMeta, toRiskLabel, type RiskLabel } from './riskLabels'
import { resolveSpeciesMeta } from './speciesMeta'

export type SetadleMode = 'classic' | 'clue' | 'trait' | 'habitat' | 'photo'

export const SETADLE_MODES: Array<{
  id: SetadleMode
  title: string
  blurb: string
  emoji: string
}> = [
  {
    id: 'classic',
    title: 'Clásico',
    blurb: 'Pistas en cada intento: familia, género, riesgo…',
    emoji: '🍄',
  },
  {
    id: 'clue',
    title: 'Pista',
    blurb: 'Una frase de la ficha. Adivina la especie.',
    emoji: '💬',
  },
  {
    id: 'trait',
    title: 'Rasgo',
    blurb: 'Un carácter morfológico o clave de campo.',
    emoji: '🔍',
  },
  {
    id: 'habitat',
    title: 'Hábitat',
    blurb: 'Arrastra cada seta: ¿vive aquí o no?',
    emoji: '🌲',
  },
  {
    id: 'photo',
    title: 'Foto',
    blurb: 'Recorte de foto; se aleja con cada fallo.',
    emoji: '📷',
  },
]

/** Map old URLs (`emoji`) → habitat */
export function normalizeSetadleMode(raw: string | null | undefined): SetadleMode | null {
  if (!raw) return null
  if (raw === 'emoji') return 'habitat'
  if (SETADLE_MODES.some((m) => m.id === raw)) return raw as SetadleMode
  return null
}

/** Iberian field habitats used by the habitat sort game */
export type HabitatId =
  | 'pinar'
  | 'hayedo'
  | 'prado'
  | 'ribera'
  | 'encinar'
  | 'sotobosque'

export type HabitatDef = {
  id: HabitatId
  title: string
  blurb: string
  icon: string
  sceneClass: string
}

export const SETADLE_HABITATS: HabitatDef[] = [
  {
    id: 'pinar',
    title: 'Pinar',
    blurb: 'Bajo pinos: agujas, suelo ácido, setas de conífera.',
    icon: '🌲',
    sceneClass: 'hab-scene--pinar',
  },
  {
    id: 'hayedo',
    title: 'Hayedo / robledal',
    blurb: 'Bosque de hoja ancha: hayas, robles, suelo humífero.',
    icon: '🌳',
    sceneClass: 'hab-scene--hayedo',
  },
  {
    id: 'prado',
    title: 'Prado / pastizal',
    blurb: 'Hierba abierta, bordes de camino y prados abonados.',
    icon: '🌿',
    sceneClass: 'hab-scene--prado',
  },
  {
    id: 'ribera',
    title: 'Ribera / humedal',
    blurb: 'Cerca del agua: sauces, alisos, suelos húmedos.',
    icon: '💧',
    sceneClass: 'hab-scene--ribera',
  },
  {
    id: 'encinar',
    title: 'Encinar / mediterráneo',
    blurb: 'Encinas, alcornoques, clima seco de Iberia.',
    icon: '☀️',
    sceneClass: 'hab-scene--encinar',
  },
  {
    id: 'sotobosque',
    title: 'Sotobosque / madera',
    blurb: 'Tocones, ramas y madera muerta en sombra.',
    icon: '🪵',
    sceneClass: 'hab-scene--soto',
  },
]

/** Genus → typical habitats (educational, not exhaustive). */
const GENUS_HABITATS: Record<string, HabitatId[]> = {
  Lactarius: ['pinar', 'hayedo'],
  Suillus: ['pinar'],
  Tricholoma: ['pinar', 'hayedo'],
  Hydnum: ['pinar', 'hayedo'],
  Cantharellus: ['hayedo', 'pinar'],
  Craterellus: ['hayedo'],
  Boletus: ['hayedo', 'encinar', 'pinar'],
  Leccinum: ['hayedo'],
  Amanita: ['hayedo', 'pinar', 'encinar'],
  Russula: ['hayedo', 'pinar'],
  Agaricus: ['prado'],
  Marasmius: ['prado'],
  Coprinus: ['prado', 'sotobosque'],
  Coprinopsis: ['prado', 'sotobosque'],
  Macrolepiota: ['prado', 'encinar'],
  Lepiota: ['sotobosque', 'prado'],
  Lepista: ['prado', 'hayedo'],
  Calocybe: ['prado'],
  Morchella: ['hayedo', 'ribera'],
  Pleurotus: ['sotobosque', 'ribera'],
  Hypholoma: ['sotobosque'],
  Galerina: ['sotobosque', 'pinar'],
  Gymnopilus: ['sotobosque'],
  Armillaria: ['sotobosque', 'hayedo'],
  Flammulina: ['sotobosque', 'ribera'],
  Hericium: ['sotobosque', 'hayedo'],
  Fistulina: ['sotobosque', 'encinar'],
  Omphalotus: ['encinar', 'sotobosque'],
  Tuber: ['encinar'],
  Gyromitra: ['pinar', 'hayedo'],
  Paxillus: ['pinar', 'hayedo'],
  Imleria: ['pinar', 'hayedo'],
  Hygrophorus: ['pinar', 'hayedo'],
  Clitocybe: ['prado', 'hayedo'],
  Entoloma: ['prado'],
  Inocybe: ['hayedo', 'pinar'],
  Cortinarius: ['hayedo', 'pinar'],
  Pholiota: ['sotobosque'],
  Pluteus: ['sotobosque'],
  Sarcoscypha: ['ribera', 'hayedo'],
  Verpa: ['hayedo', 'ribera'],
  Volvariella: ['prado', 'sotobosque'],
  Scleroderma: ['pinar', 'encinar'],
  Lycoperdon: ['prado', 'hayedo'],
  Sparassis: ['pinar'],
  Grifola: ['hayedo', 'sotobosque'],
  Ramaria: ['hayedo', 'pinar'],
}

const FAMILY_HABITATS: Record<string, HabitatId[]> = {
  Boletaceae: ['hayedo', 'pinar', 'encinar'],
  Amanitaceae: ['hayedo', 'pinar', 'encinar'],
  Russulaceae: ['hayedo', 'pinar'],
  Agaricaceae: ['prado', 'sotobosque'],
  Tricholomataceae: ['hayedo', 'pinar', 'prado'],
  Cortinariaceae: ['hayedo', 'pinar'],
  Strophariaceae: ['sotobosque', 'prado'],
  Polyporaceae: ['sotobosque'],
  Morchellaceae: ['hayedo', 'ribera'],
  Cantharellaceae: ['hayedo', 'pinar'],
  Hydnaceae: ['pinar', 'hayedo'],
  Hygrophoraceae: ['prado', 'hayedo'],
}

export function habitatsForSpecies(sp: {
  taxon: string
  family?: string
  common?: string
}): HabitatId[] {
  const genus = sp.taxon.trim().split(/\s+/)[0] || ''
  const fromGenus = GENUS_HABITATS[genus]
  if (fromGenus?.length) return fromGenus
  const fam = (sp.family || '').trim()
  if (fam && FAMILY_HABITATS[fam]) return FAMILY_HABITATS[fam]
  // weak keyword fallback on common name
  const blob = fold(`${sp.common || ''} ${sp.taxon}`)
  if (blob.includes('niscal') || blob.includes('pino')) return ['pinar']
  if (blob.includes('prado') || blob.includes('campestre')) return ['prado']
  return ['hayedo', 'sotobosque']
}

export function speciesBelongsToHabitat(
  sp: { taxon: string; family?: string; common?: string },
  habitatId: HabitatId,
): boolean {
  return habitatsForSpecies(sp).includes(habitatId)
}

export type HabitatCard = {
  taxon: string
  slug: string
  common: string
  risk_raw: string
  belongs: boolean
}

export type HabitatRound = {
  habitat: HabitatDef
  cards: HabitatCard[]
}

/** Build a 6-card sort round (3 yes + 3 no) for a habitat. */
export function buildHabitatRound(
  pool: SetadleSpecies[],
  day = dayKey(),
  playKind: 'daily' | 'unlimited' = 'daily',
): HabitatRound {
  const h = hashSeed(
    playKind === 'daily' ? `setadle|${day}|habitat|round|v2` : `setadle|habitat|u|${Math.random()}`,
  )
  const habitat = SETADLE_HABITATS[h % SETADLE_HABITATS.length]
  const yes = pool.filter((p) => speciesBelongsToHabitat(p, habitat.id))
  const no = pool.filter((p) => !speciesBelongsToHabitat(p, habitat.id))

  const pick = (list: SetadleSpecies[], n: number, seed: number): SetadleSpecies[] => {
    if (list.length === 0) return []
    const out: SetadleSpecies[] = []
    const used = new Set<string>()
    let s = seed
    let guard = 0
    while (out.length < n && guard < list.length * 4) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      const sp = list[s % list.length]
      if (!used.has(sp.taxon)) {
        used.add(sp.taxon)
        out.push(sp)
      }
      guard++
    }
    return out
  }

  const yesN = pick(yes, 3, h)
  const noN = pick(no, 3, h ^ 0x9e3779b9)

  const cards: HabitatCard[] = [
    ...yesN.map((p) => ({
      taxon: p.taxon,
      slug: p.slug,
      common: p.common,
      risk_raw: p.risk_raw,
      belongs: true as boolean,
    })),
    ...noN.map((p) => ({
      taxon: p.taxon,
      slug: p.slug,
      common: p.common,
      risk_raw: p.risk_raw,
      belongs: false as boolean,
    })),
  ]

  // shuffle
  let s = h
  for (let i = cards.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }

  return { habitat, cards: cards.slice(0, 6) }
}

export type HabitatSortResult = {
  correct: number
  total: number
  won: boolean
  mistakes: string[]
}

export function scoreHabitatSort(
  round: HabitatRound,
  placement: Record<string, 'yes' | 'no' | 'tray'>,
): HabitatSortResult {
  let correct = 0
  const mistakes: string[] = []
  for (const c of round.cards) {
    const place = placement[c.taxon] || 'tray'
    const expected: 'yes' | 'no' = c.belongs ? 'yes' : 'no'
    if (place === expected) correct++
    else mistakes.push(c.taxon)
  }
  const total = round.cards.length
  return { correct, total, won: correct === total && total > 0, mistakes }
}

export type CellTone = 'correct' | 'partial' | 'wrong'

export type AttrKey =
  | 'family'
  | 'genus'
  | 'risk'
  | 'edibility'
  | 'iberian'
  | 'season'

export type ClassicGuessRow = {
  taxon: string
  slug: string
  common: string
  cells: Array<{ key: AttrKey; label: string; value: string; tone: CellTone }>
  won: boolean
}

export type SetadleSpecies = {
  taxon: string
  slug: string
  common: string
  family: string
  genus: string
  risk: RiskLabel
  edibility: string
  iberian: string
  season: string
  tagline: string
  description: string
  trait: string
  emojis: string
  risk_raw: string
}

const ATTR_LABELS: Record<AttrKey, string> = {
  family: 'Familia',
  genus: 'Género',
  risk: 'Riesgo',
  edibility: 'Clase educ.',
  iberian: 'Iberia',
  season: 'Temporada',
}

const RISK_ORDER: RiskLabel[] = [
  'deadly',
  'poisonous',
  'toxic',
  'dangerous_or_unknown',
  'unknown_or_risky',
  'not_for_consumption_guidance',
]

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/** Deterministic hash for daily seed */
export function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function seasonLabel(sp: CatalogSpecies): string {
  const s = sp as CatalogSpecies & { season?: unknown; description?: string }
  const season = s.season
  if (typeof season === 'string' && season.trim() && season !== '—') return season.trim()
  if (typeof season === 'object' && season && 'es' in season) {
    const es = String((season as { es?: string }).es || '').trim()
    if (es && es !== '—') return es
  }
  // Resolved via resolveSpeciesMeta (genus / DB / description)
  return resolveSpeciesMeta({
    taxon: sp.taxon,
    family: sp.family,
    risk_label: sp.risk_label,
    food_class: sp.food_class,
    description: typeof sp.description === 'string' ? sp.description : undefined,
    common_names: sp.common_names,
    season: typeof season === 'string' ? season : null,
  }).season
}

function firstTrait(sp: CatalogSpecies): string {
  const rec = sp as CatalogSpecies & {
    key_features?: string[] | Record<string, string>
    morphology?: Record<string, string> | string
  }
  if (Array.isArray(rec.key_features) && rec.key_features[0]) {
    return String(rec.key_features[0])
  }
  if (rec.key_features && typeof rec.key_features === 'object') {
    const vals = Object.values(rec.key_features)
    if (vals[0]) return String(vals[0])
  }
  if (typeof rec.morphology === 'string' && rec.morphology.trim()) {
    return rec.morphology.trim().slice(0, 120)
  }
  if (rec.morphology && typeof rec.morphology === 'object') {
    const v = Object.values(rec.morphology)[0]
    if (v) return String(v).slice(0, 120)
  }
  const desc = (rec as { description?: Record<string, string> | string }).description
  if (typeof desc === 'string') return desc.slice(0, 100)
  if (desc && typeof desc === 'object' && desc.es) return String(desc.es).slice(0, 100)
  return 'Rasgo no documentado en ficha'
}

function buildEmojis(sp: CatalogSpecies): string {
  const risk = toRiskLabel(sp.risk_label)
  const riskE =
    risk === 'deadly'
      ? '☠️'
      : risk === 'poisonous' || risk === 'toxic'
        ? '⚠️'
        : '🍄'
  const cats = ((sp as { categories?: string[] }).categories || []).join(' ').toLowerCase()
  const habitat =
    cats.includes('pinar') || cats.includes('conifer')
      ? '🌲'
      : cats.includes('prado') || cats.includes('meadow')
        ? '🌿'
        : cats.includes('haya') || cats.includes('roble') || cats.includes('bosque')
          ? '🌳'
          : '🏞️'
  const season = seasonLabel(sp).toLowerCase()
  const se =
    season.includes('oto') || season.includes('autumn')
      ? '🍂'
      : season.includes('prima') || season.includes('spring')
        ? '🌸'
        : season.includes('veran') || season.includes('summer')
          ? '☀️'
          : season.includes('invier') || season.includes('winter')
            ? '❄️'
            : '📅'
  return `${riskE}${habitat}${se}🔬`
}

export function toSetadleSpecies(sp: CatalogSpecies): SetadleSpecies {
  const vern = (sp.common_names && sp.common_names[0]) || sp.taxon
  const descMap = (sp as { description?: Record<string, string> | string }).description
  let description = ''
  if (typeof descMap === 'string') description = descMap
  else if (descMap && typeof descMap === 'object') {
    description = String(descMap.es || descMap.en || '')
  }
  const rec = sp as CatalogSpecies & {
    edibility_code?: string
    iberian_relevance?: string
    documented_edibility?: string | null
    season?: string | null
  }
  const meta = resolveSpeciesMeta({
    taxon: sp.taxon,
    family: sp.family,
    risk_label: sp.risk_label,
    food_class: sp.food_class ?? rec.documented_edibility,
    documented_edibility: rec.documented_edibility ?? rec.edibility_code,
    description,
    common_names: sp.common_names,
    season: rec.season,
    iberian_relevance: rec.iberian_relevance,
  })
  const tagline =
    String((sp as { tagline?: string | Record<string, string> }).tagline || '') ||
    description.slice(0, 140) ||
    `${vern} · ${meta.family || meta.genus}`

  return {
    taxon: sp.taxon,
    slug: sp.slug,
    common: vern,
    family: meta.family !== '—' ? meta.family : sp.family || '—',
    genus: meta.genus,
    risk: meta.risk,
    // Clase educ. — never blank "desconocido"; explicit documented class
    edibility: meta.educLabel,
    iberian: meta.iberian,
    season: meta.season,
    tagline: typeof tagline === 'object' ? JSON.stringify(tagline) : tagline,
    description: description || tagline,
    trait: firstTrait(sp),
    emojis: buildEmojis(sp),
    risk_raw: sp.risk_label || 'unknown',
  }
}

/** Display value for classic cells (risk → Spanish short label). */
export function classicCellDisplay(key: AttrKey, value: string): string {
  if (key === 'risk') {
    return getRiskMeta(value).short || getRiskMeta(value).label || value
  }
  return value
}

export async function ensureSetadlePool(): Promise<SetadleSpecies[]> {
  await loadSpeciesCatalog()
  return buildSetadlePool()
}

export function buildSetadlePool(): SetadleSpecies[] {
  // family filled on hydrate via genus map; also accept genus-resolved meta
  const list = speciesCatalog
    .filter((s) => s.taxon && s.slug)
    .map(toSetadleSpecies)
    .filter((s) => s.family && s.family !== '—')
  // Prefer species with Spanish common names for playability
  const withCommon = list.filter((s) => s.common && fold(s.common) !== fold(s.taxon))
  return (withCommon.length >= 40 ? withCommon : list).slice()
}

export function pickDailySecret(pool: SetadleSpecies[], mode: SetadleMode, day = dayKey()): SetadleSpecies {
  if (pool.length === 0) throw new Error('empty setadle pool')
  const h = hashSeed(`setadle|${day}|${mode}|v1`)
  return pool[h % pool.length]
}

export function pickUnlimitedSecret(pool: SetadleSpecies[], excludeTaxon?: string): SetadleSpecies {
  const filtered = excludeTaxon
    ? pool.filter((p) => p.taxon !== excludeTaxon)
    : pool
  const list = filtered.length ? filtered : pool
  return list[Math.floor(Math.random() * list.length)]
}

function riskPartial(a: RiskLabel, b: RiskLabel): boolean {
  if (a === b) return false
  const ia = RISK_ORDER.indexOf(a)
  const ib = RISK_ORDER.indexOf(b)
  if (ia < 0 || ib < 0) return false
  return Math.abs(ia - ib) === 1
}

function seasonPartial(a: string, b: string): boolean {
  if (!a || !b || a === '—' || b === '—') return false
  const ta = fold(a).split(/[^a-z]+/).filter(Boolean)
  const tb = new Set(fold(b).split(/[^a-z]+/).filter(Boolean))
  return ta.some((t) => t.length > 3 && tb.has(t))
}

export function compareClassic(guess: SetadleSpecies, secret: SetadleSpecies): ClassicGuessRow {
  const cell = (key: AttrKey, gVal: string, sVal: string, partial?: boolean): ClassicGuessRow['cells'][0] => {
    let tone: CellTone = 'wrong'
    if (fold(gVal) === fold(sVal) && gVal !== '—') tone = 'correct'
    else if (partial) tone = 'partial'
    return { key, label: ATTR_LABELS[key], value: gVal, tone }
  }

  const cells = [
    cell('family', guess.family, secret.family),
    cell('genus', guess.genus, secret.genus),
    cell(
      'risk',
      guess.risk,
      secret.risk,
      riskPartial(guess.risk, secret.risk),
    ),
    cell('edibility', guess.edibility, secret.edibility),
    cell(
      'iberian',
      guess.iberian,
      secret.iberian,
      fold(guess.iberian).includes(fold(secret.iberian).slice(0, 4)) &&
        guess.iberian !== '—' &&
        secret.iberian !== '—',
    ),
    cell('season', guess.season, secret.season, seasonPartial(guess.season, secret.season)),
  ]

  return {
    taxon: guess.taxon,
    slug: guess.slug,
    common: guess.common,
    cells,
    won: fold(guess.taxon) === fold(secret.taxon),
  }
}

export function resolveGuess(pool: SetadleSpecies[], query: string): SetadleSpecies | null {
  const q = query.trim()
  if (!q) return null
  const qf = fold(q)
  const exact = pool.find((p) => fold(p.taxon) === qf || fold(p.common) === qf)
  if (exact) return exact
  const starts = pool.filter(
    (p) => fold(p.common).startsWith(qf) || fold(p.taxon).startsWith(qf),
  )
  if (starts[0]) return starts[0]
  const inc = pool.find(
    (p) => fold(p.common).includes(qf) || fold(p.taxon).includes(qf),
  )
  return inc || null
}

export function typeaheadPool(pool: SetadleSpecies[], query: string, limit = 8): SetadleSpecies[] {
  const q = fold(query.trim())
  if (q.length < 1) return []
  const scored = pool
    .map((p) => {
      const c = fold(p.common)
      const t = fold(p.taxon)
      let s = 0
      if (c === q || t === q) s = 100
      else if (c.startsWith(q) || t.startsWith(q)) s = 80
      else if (c.includes(q) || t.includes(q)) s = 40
      return { p, s }
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.common.localeCompare(b.p.common))
  return scored.slice(0, limit).map((x) => x.p)
}

/** Photo zoom: higher = more zoomed in (harder). Starts high, decreases. */
export function photoZoomForGuess(guessCount: number): number {
  // 2.8 → 1.0
  return Math.max(1, 2.8 - guessCount * 0.28)
}

export function storageWinKey(mode: SetadleMode | 'emoji', day = dayKey()): string {
  const m = mode === 'emoji' ? 'habitat' : mode
  return `setadle_win_${m}_${day}`
}

export function readDailyWin(mode: SetadleMode): { taxon: string; guesses: number } | null {
  try {
    const raw = localStorage.getItem(storageWinKey(mode))
    if (!raw) return null
    return JSON.parse(raw) as { taxon: string; guesses: number }
  } catch {
    return null
  }
}

export function writeDailyWin(mode: SetadleMode, taxon: string, guesses: number): void {
  try {
    localStorage.setItem(
      storageWinKey(mode),
      JSON.stringify({ taxon, guesses, at: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

export function todayKey(): string {
  return dayKey()
}

export { ATTR_LABELS }
